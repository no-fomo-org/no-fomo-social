import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/open";
import { igCalls } from "../src/db/schema";
import { logIgCall } from "../src/sync/ig-calls";

const entry = (at: number) => ({ at, kind: "saved" as const, status: 200, result: "ok" as const, ms: 300 });

describe("Instagram call log", () => {
  it("stores calls and keeps only the newest ones", () => {
    const db = openDb(":memory:");
    for (let at = 1; at <= 5; at++) logIgCall(db, entry(at), 3);
    expect(db.select({ at: igCalls.at }).from(igCalls).orderBy(asc(igCalls.id)).all().map((r) => r.at)).toEqual([3, 4, 5]);
  });
});
