import { createContext } from "react-router";

/** Cloudflare bindings and the request's execution context, for loaders and actions. */
export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();
/** Allows the page's own inline scripts under the Content Security Policy. New for every request. */
export const nonceContext = createContext<string>();
