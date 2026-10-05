/**
 * Rules for lists that page through Instagram itself (account pages). Each page is an Instagram request,
 * so nothing here loads a page the owner did not ask for by scrolling or clicking.
 */

/** The viewer is near the end of the list: load the next page, once per post and list size, never after a failure. */
export function shouldLoadAhead(o: {
  nearEnd: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Off while a filter is on: a filter that matches little would otherwise walk the whole account. */
  autoLoad: boolean;
  failed: boolean;
  key: string;
  lastKey: string | null;
}): boolean {
  return o.autoLoad && !o.failed && o.nearEnd && o.hasNextPage && !o.isFetchingNextPage && o.key !== o.lastKey;
}

/** A failed next page keeps the posts already shown; only a failed first page replaces them with an error. */
export const listBody = (o: { isError: boolean; hasData: boolean }): "error" | "grid" => (o.isError && !o.hasData ? "error" : "grid");

/** Loaded pages are never asked again by themselves: not on coming back, not after a network change, not after an error. */
export const LIVE_LIST_OPTIONS = {
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
  refetchOnReconnect: false,
  retry: false,
} as const;
