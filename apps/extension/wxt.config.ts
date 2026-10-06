import { defineConfig } from "wxt";
import { EXTENSION_PUBLIC_KEY } from "@no-fomo/core/extension-id";
import { appOrigins } from "./src/origins";

export default defineConfig({
  manifest: ({ mode }) => {
    const origins = appOrigins(mode === "development").map((o) => `${o}/*`);
    return {
      name: "no-fomo",
      description: "Syncs your Instagram saved posts to the no-fomo app on your computer.",
      key: EXTENSION_PUBLIC_KEY,
      permissions: ["tabs", "storage"],
      host_permissions: ["https://www.instagram.com/*", ...origins],
      externally_connectable: { matches: origins },
      action: { default_title: "Open no-fomo" },
    };
  },
});
