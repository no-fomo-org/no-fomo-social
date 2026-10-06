import { Settings01Icon } from "@hugeicons/core-free-icons";
import { IgLimitBanner } from "./ig-limit";
import { NavTabs } from "./nav-tabs";
import { SearchBox } from "./search-box";
import { useOpenSettings } from "./settings-dialog";
import { SyncControl } from "./sync-control";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export type SearchConfig = { value: string | null; onChange: (q: string | null) => void; placeholder: string; label: string };

/** `sync`: show saved-post syncing. Only the Saved tab has it; other tabs load their own way. */
export function TopBar({ search, sync = false }: { search: SearchConfig | null; sync?: boolean }) {
  const openSettings = useOpenSettings();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:flex-nowrap md:px-6">
        <span className="text-[15px] font-semibold tracking-tight">no-fomo</span>
        <NavTabs className="order-last basis-full md:order-none md:basis-auto" />
        {search && (
          <div className="order-last basis-full md:order-none md:max-w-[480px] md:flex-1 md:basis-auto">
            <SearchBox {...search} />
          </div>
        )}
        <div className="ms-auto flex min-w-0 items-center gap-1">
          <button type="button" onClick={openSettings} aria-label="Settings" title="Settings" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={Settings01Icon} size={18} />
          </button>
          {sync && <SyncControl />}
        </div>
      </div>
      <IgLimitBanner />
    </header>
  );
}
