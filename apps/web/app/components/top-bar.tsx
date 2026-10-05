import { SyncControl } from "./sync-control";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
        <span className="text-[15px] font-semibold tracking-tight">no-fomo</span>
        <SyncControl />
      </div>
    </header>
  );
}
