import { defineConfig } from "wxt";
import { EXTENSION_PUBLIC_KEY } from "@no-fomo/core/extension-id";

export default defineConfig({
  manifest: {
    name: "no-fomo",
    description: "Syncs your Instagram saved posts to the no-fomo app on your computer.",
    key: EXTENSION_PUBLIC_KEY,
    permissions: ["tabs"],
    host_permissions: ["https://www.instagram.com/*", "http://localhost/*", "http://127.0.0.1/*"],
    externally_connectable: { matches: ["http://localhost/*", "http://127.0.0.1/*"] },
    action: { default_title: "Open no-fomo" },
  },
});
