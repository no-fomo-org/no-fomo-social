import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, count, desc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/open";
import { postCollections, postParts, posts, reports, savedPosts } from "../src/db/schema";

const SRC = fileURLToPath(new URL("../drizzle", import.meta.url));

/** A copy of the migrations folder that stops at `tag`, to build a database as an older app left it. */
function migrationsUpTo(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), "nf-mig-"));
  cpSync(SRC, dir, { recursive: true });
  const file = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(file, "utf8")) as { entries: Array<{ tag: string }> };
  journal.entries = journal.entries.slice(0, journal.entries.findIndex((e) => e.tag === tag) + 1);
  writeFileSync(file, JSON.stringify(journal));
  return dir;
}

describe("migration 0008", () => {
  it("moves saved-feed state to saved_posts and keeps posts, parts, links and reports", () => {
    const file = join(mkdtempSync(join(tmpdir(), "nf-db-")), "old.db");
    const old = new Database(file);
    old.pragma("foreign_keys = ON");
    migrate(drizzle(old), { migrationsFolder: migrationsUpTo("0007_report_search") });
    old.exec(`
      INSERT INTO authors (id, username) VALUES ('9', 'a');
      INSERT INTO posts (id, code, kind, author_id, hashtags, mentions, taken_at, sort_key, first_seen_run_id, last_seen_run_id, removed_at, removed_remotely_at)
        VALUES ('1', 'C1', 'image', '9', '[]', '[]', 1, 200, 1, 2, NULL, NULL),
               ('2', 'C2', 'video', '9', '[]', '[]', 2, 100, 1, 1, NULL, 555);
      INSERT INTO post_parts (post_id, idx, kind) VALUES ('1', 0, 'image');
      INSERT INTO collections (id) VALUES ('77');
      INSERT INTO post_collections (post_id, collection_id, first_seen_run_id) VALUES ('1', '77', 1);
      INSERT INTO reports (post_id, status, markdown, language, report_model, created_at) VALUES ('2', 'done', '## Summary\nhi', 'English', 'm', 1);
    `);
    old.close();

    const db = openDb(file);
    expect(db.select().from(savedPosts).orderBy(desc(savedPosts.sortKey)).all()).toEqual([
      { postId: "1", sortKey: 200, firstSeenRunId: 1, lastSeenRunId: 2, removedAt: null, removedRemotelyAt: null },
      { postId: "2", sortKey: 100, firstSeenRunId: 1, lastSeenRunId: 1, removedAt: null, removedRemotelyAt: 555 },
    ]);
    expect(db.select({ id: posts.id }).from(posts).orderBy(asc(posts.id)).all()).toEqual([{ id: "1" }, { id: "2" }]);
    expect(db.select({ n: count() }).from(postParts).get()!.n).toBe(1);
    expect(db.select({ n: count() }).from(postCollections).get()!.n).toBe(1);
    expect(db.select({ markdown: reports.markdown }).from(reports).get()!.markdown).toBe("## Summary\nhi");
  });
});
