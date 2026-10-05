import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const server = "http://localhost:4747";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: server, changeOrigin: true }, "/media": { target: server, changeOrigin: true } },
  },
});
