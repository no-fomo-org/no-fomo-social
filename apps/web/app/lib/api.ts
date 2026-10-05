import type {
  AnalyzeChoice, AppConfig, AppSettings, AuthorFacet, CollectionFacet, ModelsInfo, PostMedia, PostReport, PostsPage, SettingsUpdate, SyncStatus,
} from "@no-fomo/core";

/** `message` is the server's error code when it sent one. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function read<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (!res.ok) throw new ApiError(res.status, typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

const get = async <T>(path: string) => read<T>(await fetch(path, { headers: { accept: "application/json" } }));
const send = async <T>(path: string, body: unknown) =>
  read<T>(await fetch(path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) }));

export const api = {
  config: () => get<AppConfig>("/api/config"),
  posts: (qs: string) => get<PostsPage>(`/api/posts?${qs}`),
  media: (id: string) => get<PostMedia>(`/api/posts/${id}/media`),
  authors: () => get<AuthorFacet[]>("/api/authors"),
  collections: () => get<CollectionFacet[]>("/api/collections"),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
  settings: () => get<AppSettings>("/api/settings"),
  saveSettings: (u: SettingsUpdate) => send<AppSettings>("/api/settings", u),
  models: () => get<ModelsInfo>("/api/models"),
  analyze: (id: string, choice: AnalyzeChoice) => send<PostReport>(`/api/posts/${id}/analyze`, choice),
  report: (id: string) =>
    get<PostReport>(`/api/posts/${id}/report`).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),
};
