/** Instagram may send a post twice (a pinned post again in time order). Keep the first copy. */
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => !seen.has(x.id) && (seen.add(x.id), true));
}
