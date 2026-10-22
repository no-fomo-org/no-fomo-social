import { EXTENSION_STORE_URL } from "@no-fomo/core";

export const GITHUB_URL = "https://github.com/no-fomo/no-fomo";
export const STORE_URL = EXTENSION_STORE_URL;
const RAW = "https://raw.githubusercontent.com/no-fomo/no-fomo/main/scripts/install";
export const SCRIPT_URL = { mac: `${RAW}/install.sh`, windows: `${RAW}/install.ps1` } as const;

export type Os = "mac" | "windows";

/** The one line people paste. Served from this site's own address, so it stays short. */
export function installCommand(os: Os, origin: string): string {
  return os === "mac" ? `curl -fsSL ${origin}/install.sh | bash` : `irm ${origin}/install.ps1 | iex`;
}

/** Best guess from the browser; people can switch the tab. Anything that is not Windows gets the Mac line. */
export function guessOs(userAgent: string | null): Os {
  return /windows/i.test(userAgent ?? "") ? "windows" : "mac";
}
