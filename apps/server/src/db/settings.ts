import { eq } from "drizzle-orm";
import type { Db } from "./open";
import { settings } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Q = Db | Tx;

export const getSetting = (q: Q, key: string) => q.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
export const setSetting = (q: Q, key: string, value: string) =>
  q.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
export const deleteSetting = (q: Q, key: string) => q.delete(settings).where(eq(settings.key, key)).run();
