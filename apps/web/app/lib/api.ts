import type { AppConfig, AuthorFacet, CollectionFacet, PostMedia, PostsPage, SyncStatus } from "@no-fomo/core";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const api = {
  config: () => get<AppConfig>("/api/config"),
  posts: (qs: string) => get<PostsPage>(`/api/posts?${qs}`),
  media: (id: string) => get<PostMedia>(`/api/posts/${id}/media`),
  authors: () => get<AuthorFacet[]>("/api/authors"),
  collections: () => get<CollectionFacet[]>("/api/collections"),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
};
