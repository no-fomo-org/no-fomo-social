import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext, type RouterContextProvider } from "react-router";
import { nonceContext } from "./lib/context";

/** Only our own files, our inline scripts (by nonce) and the Turnstile check may run on the page. */
function securityHeaders(headers: Headers, nonce: string) {
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const nonce = loadContext.get(nonceContext);
  let shellRendered = false;
  const body = await renderToReadableStream(<ServerRouter context={routerContext} url={request.url} nonce={nonce} />, {
    nonce,
    signal: request.signal,
    onError(error: unknown) {
      status = 500;
      if (shellRendered) console.error(error);
    },
  });
  shellRendered = true;
  if (isbot(request.headers.get("user-agent") ?? "") || routerContext.isSpaMode) await body.allReady;

  headers.set("Content-Type", "text/html; charset=utf-8");
  securityHeaders(headers, nonce);
  return new Response(body, { headers, status });
}
