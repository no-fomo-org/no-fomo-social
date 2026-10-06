import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import { LogoSymbol } from "../logo";
import type { Viewer as ViewerComponent } from "./viewer";

const load = () => import("./viewer");
const Viewer = lazy(() => load().then((m) => ({ default: m.Viewer })));

/**
 * The post viewer (video player, report) as its own download, so the grid loads first.
 * The code is fetched when the browser is idle, or on the first post open, whichever comes first.
 * Once mounted it stays, so the close animation can run.
 */
export function LazyViewer(props: ComponentProps<typeof ViewerComponent>) {
  const [needed, setNeeded] = useState(false);
  if (props.post && !needed) setNeeded(true);

  useEffect(() => {
    if (!("requestIdleCallback" in window)) {
      const t = setTimeout(() => void load(), 2000);
      return () => clearTimeout(t);
    }
    const id = requestIdleCallback(() => void load(), { timeout: 4000 });
    return () => cancelIdleCallback(id);
  }, []);

  if (!needed) return null;
  return (
    <Suspense fallback={props.post ? <ViewerLoading /> : null}>
      <Viewer {...props} />
    </Suspense>
  );
}

function ViewerLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper" role="status">
      <LogoSymbol size={32} loading title="Opening post" className="text-accent" />
    </div>
  );
}
