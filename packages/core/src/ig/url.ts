/** Instagram CDN urls carry their expiry as a hex unix timestamp in `oe`. */
export function expiresAtFromUrl(url: string | null): number | null {
  if (!url) return null;
  try {
    const oe = new URL(url).searchParams.get("oe");
    return oe && /^[0-9a-f]{1,12}$/i.test(oe) ? parseInt(oe, 16) : null;
  } catch {
    return null;
  }
}
