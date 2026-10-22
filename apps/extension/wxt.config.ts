import { defineConfig } from "wxt";
import { EXTENSION_PUBLIC_KEY } from "@no-fomo-social/core/extension-id";
import { appOrigins } from "./src/origins";

export default defineConfig({
  zip: { artifactTemplate: "no-fomo-extension-{{version}}.zip" },
  manifest: ({ mode }) => {
    const origins = appOrigins(mode === "development").map((o) => `${o}/*`);
    return {
      name: "no-fomo",
      description: "Syncs your Instagram saved posts to the no-fomo app on your computer.",
      // The Chrome Web Store sets its own key and refuses uploads that carry one.
      ...(process.env.NO_FOMO_STORE_BUILD ? {} : { key: EXTENSION_PUBLIC_KEY }),
      permissions: ["tabs", "storage"],
      host_permissions: ["https://www.instagram.com/*", ...origins],
      externally_connectable: { matches: origins },
      action: { default_title: "Open no-fomo" },
    };
  },
});
