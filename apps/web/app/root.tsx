import { useState, type ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/outfit";
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist-mono";
import "./app.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>no-fomo</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#f6f7f3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#141a16" media="(prefers-color-scheme: dark)" />
        <Meta />
        <Links />
      </head>
      <body className="bg-bg text-text antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return <div className="min-h-[100dvh] bg-bg" />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const text = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something went wrong. Reload the page.";
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <h1 className="text-xl font-semibold">no-fomo stopped working</h1>
      <p className="mt-2 text-muted">{text}</p>
    </main>
  );
}
