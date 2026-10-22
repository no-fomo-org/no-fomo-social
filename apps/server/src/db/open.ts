import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { appPaths } from "../paths";
import * as schema from "./schema";

export function openDb(file: string, migrations = appPaths().migrations) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrations });
  return db;
}

export type Db = ReturnType<typeof openDb>;
