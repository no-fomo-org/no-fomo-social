import type { MediaKind, ReportSource } from "@no-fomo/core";

export interface Filters {
  q: string | null;
  author: string | null;
  collection: string | null;
  kind: MediaKind | null;
  /** Reports tab only. */
  source: ReportSource | null;
}

export const NO_FILTERS: Filters = { q: null, author: null, collection: null, kind: null, source: null };

const KINDS: readonly MediaKind[] = ["image", "video", "carousel"];
const SOURCES: readonly ReportSource[] = ["saved", "profile"];
const ID = /^\d{1,30}$/;

const cleanQuery = (v: string | null | undefined) => {
  const t = (v ?? "").trim().slice(0, 200);
  return t ? t : null;
};

export function readFilters(sp: URLSearchParams): Filters {
  const author = sp.get("author");
  const collection = sp.get("collection");
  const kind = sp.get("kind") as MediaKind | null;
  const source = sp.get("source") as ReportSource | null;
  return {
    q: cleanQuery(sp.get("q")),
    author: author && ID.test(author) ? author : null,
    collection: collection && ID.test(collection) ? collection : null,
    kind: kind && KINDS.includes(kind) ? kind : null,
    source: source && SOURCES.includes(source) ? source : null,
  };
}

export function writeFilters(sp: URLSearchParams, patch: Partial<Filters>): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const [k, v] of Object.entries(patch)) {
    const value = k === "q" ? cleanQuery(v) : v;
    if (value) next.set(k, value);
    else next.delete(k);
  }
  return next;
}

export function postsQueryString(f: Filters, cursor: string | null, o: { profile?: string; limit?: number } = {}): string {
  const q = new URLSearchParams({ limit: String(o.limit ?? 60) });
  if (o.profile) q.set("profile", o.profile);
  if (f.q) q.set("q", f.q);
  if (f.author) q.set("author", f.author);
  if (f.collection && !o.profile) q.set("collection", f.collection);
  if (f.kind) q.set("kind", f.kind);
  if (cursor !== null) q.set("cursor", cursor);
  return q.toString();
}

export function reportsQueryString(f: Filters, cursor: string | null, limit = 40): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (f.q) q.set("q", f.q);
  if (f.author) q.set("author", f.author);
  if (f.kind) q.set("kind", f.kind);
  if (f.source) q.set("source", f.source);
  if (cursor !== null) q.set("cursor", cursor);
  return q.toString();
}

export const hasFilters = (f: Filters) => Boolean(f.q || f.author || f.collection || f.kind || f.source);
