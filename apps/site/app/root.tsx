import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import "@fontsource-variable/outfit";
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist-mono";
import "./app.css";
import type { Route } from "./+types/root";
import { nonceContext } from "./lib/context";

export const loader = ({ context }: Route.LoaderArgs) => ({ nonce: context.get(nonceContext) });

export function Layout({ children }: { children: ReactNode }) {
  const nonce = useRouteLoaderData<typeof loader>("root")?.nonce;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#f6f7f3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#141a16" media="(prefers-color-scheme: dark)" />
        <Meta />
        <Links nonce={nonce} />
      </head>
      <body className="bg-bg text-text antialiased">
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <h1 className="font-display text-[28px] font-extrabold leading-[1.1]">{missing ? "This page does not exist" : "Something went wrong"}</h1>
      <p className="mt-3 text-muted">
        <a href="/" className="text-text underline">Go to the home page</a>
      </p>
    </main>
  );
}
