import { lte } from "drizzle-orm";
import type { IgCallLog } from "@no-fomo-social/core";
import type { Db } from "../db/open";
import { igCalls } from "../db/schema";

export const IG_CALLS_KEPT = 2000;

/** Stores one call and drops the ones older than the newest `kept`. */
export function logIgCall(db: Db, entry: IgCallLog, kept = IG_CALLS_KEPT): void {
  db.transaction((tx) => {
    const { id } = tx.insert(igCalls).values(entry).returning({ id: igCalls.id }).get();
    tx.delete(igCalls).where(lte(igCalls.id, id - kept)).run();
  });
}
