import type { MiddlewareHandler } from "hono";

export function security(opts: { port: number; allowedOrigins: string[] }): MiddlewareHandler {
  const hosts = new Set([`localhost:${opts.port}`, `127.0.0.1:${opts.port}`, `[::1]:${opts.port}`]);
  const origins = new Set(opts.allowedOrigins);
  const cors = (origin: string) => ({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  });

  return async (c, next) => {
    const host = c.req.header("host");
    if (!host || !hosts.has(host)) return c.text("Forbidden host", 403);
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin)) return c.text("Forbidden origin", 403);
    // A page on another site can load an image without an Origin header. Browsers mark it cross-site,
    // so refusing it stops other sites from learning which posts are in the library.
    if (c.req.path.startsWith("/media/") && c.req.header("sec-fetch-site") === "cross-site") return c.text("Forbidden", 403);
    if (c.req.method === "OPTIONS") return c.body(null, 204, origin ? cors(origin) : {});
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.text("JSON required", 415);
    }
    await next();
    // Nothing frames the app, so no other site may put it in an iframe and trick clicks.
    c.res.headers.set("x-frame-options", "DENY");
    c.res.headers.set("content-security-policy", "frame-ancestors 'none'");
    if (origin) for (const [k, v] of Object.entries(cors(origin))) c.res.headers.set(k, v);
  };
}
