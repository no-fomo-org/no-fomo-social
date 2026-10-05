import type { MediaKind } from "@no-fomo/core";

export interface Filters { author: string | null; collection: string | null; kind: MediaKind | null }

const KINDS: readonly MediaKind[] = ["image", "video", "carousel"];
const ID = /^\d{1,30}$/;

export function readFilters(sp: URLSearchParams): Filters {
  const author = sp.get("author");
  const collection = sp.get("collection");
  const kind = sp.get("kind") as MediaKind | null;
  return {
    author: author && ID.test(author) ? author : null,
    collection: collection && ID.test(collection) ? collection : null,
    kind: kind && KINDS.includes(kind) ? kind : null,
  };
}

export function writeFilters(sp: URLSearchParams, patch: Partial<Filters>): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const [k, v] of Object.entries(patch)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  return next;
}

export function postsQueryString(f: Filters, cursor: number | null, limit = 60): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (f.author) q.set("author", f.author);
  if (f.collection) q.set("collection", f.collection);
  if (f.kind) q.set("kind", f.kind);
  if (cursor !== null) q.set("cursor", String(cursor));
  return q.toString();
}

export const hasFilters = (f: Filters) => Boolean(f.author || f.collection || f.kind);
