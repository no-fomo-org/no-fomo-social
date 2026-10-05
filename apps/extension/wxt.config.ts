import { defineConfig } from "wxt";
import { EXTENSION_PUBLIC_KEY } from "@no-fomo/core/extension-id";
import { APP_ORIGINS } from "./src/origins";

export default defineConfig({
  manifest: {
    name: "no-fomo",
    description: "Syncs your Instagram saved posts to the no-fomo app on your computer.",
    key: EXTENSION_PUBLIC_KEY,
    permissions: ["tabs"],
    host_permissions: ["https://www.instagram.com/*", ...APP_ORIGINS.map((o) => `${o}/*`)],
    externally_connectable: { matches: APP_ORIGINS.map((o) => `${o}/*`) },
    action: { default_title: "Open no-fomo" },
  },
});
