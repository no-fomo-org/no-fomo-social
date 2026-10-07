import { defineConfig } from "vitest/config";

// Tests cover plain server logic; they do not need the Cloudflare or React Router plugins.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
