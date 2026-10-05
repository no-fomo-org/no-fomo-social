import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, count, desc, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/open";
import { following, followingRuns, postCollections, postParts, posts, reports, savedPosts } from "../src/db/schema";

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

  it("upgrades a database that ran the first version of 0008 (profile library)", () => {
    const file = join(mkdtempSync(join(tmpdir(), "nf-db-")), "v1.db");
    const old = new Database(file);
    old.pragma("foreign_keys = ON");
    migrate(drizzle(old), { migrationsFolder: migrationsUpTo("0008_profiles") });
    old.exec(`
      INSERT INTO authors (id, username) VALUES ('9', 'a'), ('8', 'friend');
      INSERT INTO posts (id, code, kind, author_id, hashtags, mentions, taken_at) VALUES
        ('1', 'C1', 'image', '9', '[]', '[]', 1), ('2', 'C2', 'image', '9', '[]', '[]', 2), ('3', 'C3', 'image', '9', '[]', '[]', 3);
      INSERT INTO post_search (post_id, body) VALUES ('1', 'a'), ('2', 'b'), ('3', 'c');
      INSERT INTO saved_posts (post_id, sort_key, first_seen_run_id, last_seen_run_id) VALUES ('1', 10, 1, 1);
      INSERT INTO reports (post_id, status, markdown, language, report_model, created_at) VALUES ('2', 'done', '## Summary\nhi', 'English', 'm', 1);
      INSERT INTO profiles (author_id, added_at) VALUES ('9', 1);
      INSERT INTO load_runs (kind, author_id, mode, status, started_at, active_at) VALUES ('profile', '9', 'add', 'done', 1, 1);
      INSERT INTO profile_posts (author_id, post_id, run_id) VALUES ('9', '1', 1), ('9', '2', 1), ('9', '3', 1);
      INSERT INTO following (author_id, position, last_seen_run_id) VALUES ('8', 0, 1);
    `);
    old.close();

    const db = openDb(file);
    // Post 3 was only in the old profile library: it goes. The saved post and the reported post stay.
    expect(db.select({ id: posts.id }).from(posts).orderBy(asc(posts.id)).all()).toEqual([{ id: "1" }, { id: "2" }]);
    expect(db.all(sql`SELECT post_id FROM post_search ORDER BY post_id`)).toEqual([{ post_id: "1" }, { post_id: "2" }]);
    expect(db.select().from(following).all()).toEqual([{ authorId: "8", position: 0, lastSeenRunId: 1 }]);
    expect(db.select().from(followingRuns).all()).toEqual([]);
    const tables = db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`).map((t) => t.name);
    expect(tables).not.toContain("profiles");
    expect(tables).not.toContain("profile_posts");
    expect(tables).not.toContain("load_runs");
  });
});
