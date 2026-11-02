import { defineConfig } from "wxt";
import { EXTENSION_PUBLIC_KEY } from "@no-fomo-social/core/extension-id";
import { appOrigins } from "./src/origins";

export default defineConfig({
  zip: { artifactTemplate: "no-fomo-social-extension-{{version}}.zip" },
  manifest: ({ mode }) => {
    const origins = appOrigins(mode === "development").map((o) => `${o}/*`);
    return {
      name: "no-fomo-social",
      description: "Syncs your Instagram saved posts to the no-fomo-social app on your computer.",
      // The Chrome Web Store sets its own key and refuses uploads that carry one.
      ...(process.env.NO_FOMO_SOCIAL_STORE_BUILD ? {} : { key: EXTENSION_PUBLIC_KEY }),
      // No `tabs`: the instagram.com host permission already lets the worker read urls of Instagram tabs.
      permissions: ["storage"],
      host_permissions: ["https://www.instagram.com/*", ...origins],
      externally_connectable: { matches: origins },
      action: { default_title: "Open no-fomo-social" },
    };
  },
});
