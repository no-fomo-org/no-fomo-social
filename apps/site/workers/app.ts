import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext, nonceContext } from "../app/lib/context";

const handler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    context.set(nonceContext, btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))));
    return handler(request, context);
  },
} satisfies ExportedHandler<Env>;
