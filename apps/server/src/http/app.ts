import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { APP_VERSION, isReportLanguage, isReportModel, isTranscribeModel } from "@no-fomo/core";
import type { ServerConfig } from "../config";
import type { Db } from "../db/open";
import { authors, posts } from "../db/schema";
import type { Analyzer } from "../analyze/analyzer";
import { AnalyzeError } from "../analyze/errors";
import type { ModelCatalog } from "../analyze/models";
import { getReport } from "../analyze/report-store";
import { imageType, type MediaStore } from "../media/store";
import type { KeyStore } from "../secrets/key-store";
import { readSettings, updateSettings } from "../settings";
import { getPostMedia, listAuthors, listCollections, listFollowing, listPosts, listProfiles, listReports, syncStatus } from "../queries";
import {
  finishRun, ingestCollections, ingestMediaInfo, ingestSavedPage, MismatchError, NotFoundError, RunNotActiveError, startRun,
} from "../sync/ingest";
import {
  finishLoadRun, ingestFollowingPage, ingestProfilePage, LoadError, removeProfile, startFollowingRun, startProfileRun,
} from "../sync/loads";
import { security } from "./security";

const Id = z.string().regex(/^\d{1,30}$/);
const RunId = z.coerce.number().int().positive();
const PageBody = z.object({ payload: z.unknown() });
const StartBody = z.object({ mode: z.enum(["incremental", "full"]).optional() });
const FinishBody = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), code: z.string().max(64), message: z.string().max(500) }),
]);
const Kind = z.enum(["image", "video", "carousel"]);
const Cursor = z.string().regex(/^\d{1,20}(\.\d{1,30})?$/);
const PostsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  author: Id.optional(),
  collection: Id.optional(),
  kind: Kind.optional(),
  profile: Id.optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
const ReportsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  author: Id.optional(),
  kind: Kind.optional(),
  source: z.enum(["saved", "profile"]).optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
const FollowingQuery = z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const AuthorsQuery = z.object({ scope: z.enum(["saved", "reports"]).default("saved") });
const ProfileStartSchema = z.union([
  z.object({ mode: z.literal("add"), payload: z.unknown() }),
  z.object({ mode: z.enum(["older", "refresh"]), authorId: Id }),
]);

const SettingsBody = z.object({ openaiKey: z.string().trim().regex(/^[\x21-\x7e]{20,300}$/).nullable().optional() }).strict();
const AnalyzeBody = z
  .object({
    reportModel: z.string().refine(isReportModel),
    transcribeModel: z.string().refine(isTranscribeModel),
    language: z.string().refine(isReportLanguage),
  })
  .strict();

/** Keys and analysis belong to the app page only. The extension never needs them. */
const fromExtension = (c: Context) => (c.req.header("origin") ?? "").startsWith("chrome-extension://");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

export function createApp(deps: { db: Db; config: ServerConfig; media: MediaStore; keys: KeyStore; analyzer: Analyzer; models: ModelCatalog }) {
  const { db, config, media, keys, analyzer, models } = deps;
  const app = new Hono();
  let dumpCount = 0;

  async function dump(runId: number, kind: string, payload: unknown) {
    if (!config.dumpPayloads) return;
    const dir = join(config.dataDir, "dumps");
    mkdirSync(dir, { recursive: true });
    await writeFile(join(dir, `${runId}-${String(++dumpCount).padStart(4, "0")}-${kind}.json`), JSON.stringify(payload, null, 2));
  }

  app.use(
    "*",
    security({
      port: config.port,
      allowedOrigins: [
        `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`, `chrome-extension://${config.extensionId}`, ...config.devOrigins,
      ],
    }),
  );
  app.use("/api/*", bodyLimit({ maxSize: 8 * 1024 * 1024 }));

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: "bad_request", issues: err.issues }, 400);
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof RunNotActiveError) return c.json({ error: err.message }, 409);
    if (err instanceof MismatchError) return c.json({ error: err.message }, 422);
    if (err instanceof LoadError) return c.json({ error: err.code }, 409);
    if (err instanceof AnalyzeError) return c.json({ error: err.code }, 409);
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/api/config", (c) => c.json({ extensionId: config.extensionId, version: APP_VERSION }));

  app.post("/api/sync/runs", async (c) => {
    const { mode } = StartBody.parse(await c.req.json().catch(() => ({})));
    return c.json(startRun(db, mode), 201);
  });

  app.post("/api/sync/runs/:id/saved", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "saved", payload);
    const r = ingestSavedPage(db, runId, payload);
    media.enqueue(r.jobs);
    return c.json({ stop: r.stop, newCount: r.newCount, seen: r.seen });
  });

  app.post("/api/sync/runs/:id/collections", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "collections", payload);
    return c.json(ingestCollections(db, runId, payload));
  });

  app.post("/api/sync/runs/:id/finish", async (c) => {
    finishRun(db, RunId.parse(c.req.param("id")), FinishBody.parse(await c.req.json()));
    return c.json({ ok: true });
  });

  app.post("/api/sync/media/:id", async (c) => {
    const id = Id.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    media.enqueue(ingestMediaInfo(db, id, payload));
    return c.json(getPostMedia(db, id));
  });

  app.post("/api/sync/profiles/runs", async (c) => {
    const r = startProfileRun(db, ProfileStartSchema.parse(await c.req.json()));
    media.enqueue(r.jobs);
    return c.json({ runId: r.runId, authorId: r.authorId, cursor: r.cursor }, 201);
  });

  app.post("/api/sync/profiles/runs/:id/page", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "load-profile", payload);
    const r = ingestProfilePage(db, runId, payload);
    media.enqueue(r.jobs);
    return c.json({ stop: r.stop, newCount: r.newCount });
  });

  app.post("/api/sync/following/runs", (c) => c.json(startFollowingRun(db), 201));

  app.post("/api/sync/following/runs/:id/page", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "load-following", payload);
    return c.json(ingestFollowingPage(db, runId, payload));
  });

  app.post("/api/sync/loads/:id/finish", async (c) => {
    finishLoadRun(db, RunId.parse(c.req.param("id")), FinishBody.parse(await c.req.json()));
    return c.json({ ok: true });
  });

  app.get("/api/sync/status", (c) => c.json(syncStatus(db)));
  app.get("/api/posts", (c) => c.json(listPosts(db, PostsQuerySchema.parse(c.req.query()))));
  app.get("/api/posts/:id/media", (c) => {
    const found = getPostMedia(db, Id.parse(c.req.param("id")));
    return found ? c.json(found) : c.json({ error: "not_found" }, 404);
  });
  app.post("/api/posts/:id/analyze", async (c) => {
    if (fromExtension(c)) return c.json({ error: "forbidden" }, 403);
    const id = Id.parse(c.req.param("id"));
    return c.json(analyzer.start(id, AnalyzeBody.parse(await c.req.json().catch(() => null))), 202);
  });
  app.get("/api/models", async (c) => (fromExtension(c) ? c.json({ error: "forbidden" }, 403) : c.json(await models.list())));
  app.get("/api/posts/:id/report", (c) => {
    const found = getReport(db, Id.parse(c.req.param("id")));
    return found ? c.json(found) : c.json({ error: "not_found" }, 404);
  });
  app.get("/api/authors", (c) => c.json(listAuthors(db, AuthorsQuery.parse(c.req.query()).scope)));
  app.get("/api/reports", (c) => c.json(listReports(db, ReportsQuerySchema.parse(c.req.query()))));
  app.get("/api/profiles", (c) => c.json(listProfiles(db)));
  app.post("/api/profiles/:id/remove", async (c) => {
    if (fromExtension(c)) return c.json({ error: "forbidden" }, 403);
    const ids = removeProfile(db, Id.parse(c.req.param("id")));
    await media.removeThumbs(ids);
    return c.json({ ok: true, removed: ids.length });
  });
  app.get("/api/following", (c) => c.json(listFollowing(db, FollowingQuery.parse(c.req.query()))));
  app.get("/api/collections", (c) => c.json(listCollections(db)));
  app.get("/api/settings", (c) => (fromExtension(c) ? c.json({ error: "forbidden" }, 403) : c.json(readSettings(db, keys))));
  app.post("/api/settings", async (c) => {
    if (fromExtension(c)) return c.json({ error: "forbidden" }, 403);
    return c.json(updateSettings(db, keys, SettingsBody.parse(await c.req.json())));
  });
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.get("/media/:folder{thumbs|avatars}/:id{[0-9]+}", async (c) => {
    const kind = c.req.param("folder") === "thumbs" ? "thumb" : "avatar";
    const id = c.req.param("id");
    const file = media.pathFor(kind, id);
    if (!existsSync(file)) {
      const url =
        kind === "thumb"
          ? db.select({ url: posts.thumbnailUrl }).from(posts).where(eq(posts.id, id)).get()?.url
          : db.select({ url: authors.avatarUrl }).from(authors).where(eq(authors.id, id)).get()?.url;
      if (!url || !(await media.fetchNow({ kind, id, url }))) return c.notFound();
    }
    const bytes = await readFile(file);
    return c.body(bytes, 200, {
      "content-type": imageType(bytes) ?? "application/octet-stream",
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    });
  });
  app.get("/media/*", (c) => c.notFound());

  app.get("*", async (c) => {
    if (!config.webDist) return c.text("Web app is not built. Run: pnpm --filter @no-fomo/web build", 404);
    const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
    const file = resolve(config.webDist, rel);
    if (rel && file.startsWith(config.webDist + sep) && existsSync(file) && statSync(file).isFile()) {
      const immutable = rel.startsWith("assets/");
      return c.body(await readFile(file), 200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      });
    }
    return c.html(await readFile(join(config.webDist, "index.html"), "utf8"));
  });

  return app;
}
