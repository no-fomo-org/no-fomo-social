import { Settings01Icon } from "@hugeicons/core-free-icons";
import { SearchBox } from "./search-box";
import { useOpenSettings } from "./settings-dialog";
import { SyncControl } from "./sync-control";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export function TopBar({ query, onQueryChange }: { query: string | null; onQueryChange: (q: string | null) => void }) {
  const openSettings = useOpenSettings();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 md:flex-nowrap md:px-6">
        <span className="text-[15px] font-semibold tracking-tight">no-fomo</span>
        <div className="order-last basis-full md:order-none md:max-w-[560px] md:flex-1 md:basis-auto">
          <SearchBox value={query} onChange={onQueryChange} />
        </div>
        <div className="ms-auto flex min-w-0 items-center gap-1">
          <button type="button" onClick={openSettings} aria-label="Settings" title="Settings" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={Settings01Icon} size={18} />
          </button>
          <SyncControl />
        </div>
      </div>
    </header>
  );
}
