import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { APP_VERSION } from "@no-fomo/core";
import type { ServerConfig } from "../config";
import type { Db } from "../db/open";
import { authors, posts } from "../db/schema";
import { imageType, type MediaStore } from "../media/store";
import { listAuthors, listCollections, listPosts, syncStatus } from "../queries";
import {
  finishRun, ingestCollectionPage, ingestCollections, ingestSavedPage, NotFoundError, RunNotActiveError, startRun,
} from "../sync/ingest";
import { security } from "./security";

const Id = z.string().regex(/^\d{1,30}$/);
const RunId = z.coerce.number().int().positive();
const PageBody = z.object({ payload: z.unknown() });
const FinishBody = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), code: z.string().max(64), message: z.string().max(500) }),
]);
const PostsQuerySchema = z.object({
  author: Id.optional(),
  collection: Id.optional(),
  kind: z.enum(["image", "video", "carousel"]).optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

export function createApp(deps: { db: Db; config: ServerConfig; media: MediaStore }) {
  const { db, config, media } = deps;
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
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/api/config", (c) => c.json({ extensionId: config.extensionId, version: APP_VERSION }));

  app.post("/api/sync/runs", (c) => c.json(startRun(db), 201));

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

  app.post("/api/sync/runs/:id/collections/:cid", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const cid = Id.parse(c.req.param("cid"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, `collection-${cid}`, payload);
    const r = ingestCollectionPage(db, runId, cid, payload);
    media.enqueue(r.jobs);
    return c.json({ stop: r.stop, seen: r.seen });
  });

  app.post("/api/sync/runs/:id/finish", async (c) => {
    finishRun(db, RunId.parse(c.req.param("id")), FinishBody.parse(await c.req.json()));
    return c.json({ ok: true });
  });

  app.get("/api/sync/status", (c) => c.json(syncStatus(db)));
  app.get("/api/posts", (c) => c.json(listPosts(db, PostsQuerySchema.parse(c.req.query()))));
  app.get("/api/authors", (c) => c.json(listAuthors(db)));
  app.get("/api/collections", (c) => c.json(listCollections(db)));
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
