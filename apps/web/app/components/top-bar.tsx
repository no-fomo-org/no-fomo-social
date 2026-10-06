import { Link } from "react-router";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { IgLimitBanner } from "./ig-limit";
import { LogoLockup } from "./logo";
import { NavTabs } from "./nav-tabs";
import { useOpenSettings } from "./settings-dialog";
import { SyncControl } from "./sync-control";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

/**
 * Logo (links Home), centered tabs, page actions. The tabs keep the same spot on every page:
 * the two side columns share the rest of the width equally. On a phone the tabs take their own row.
 * `sync`: show saved-post syncing. Only the Saved tab has it; other tabs load their own way.
 */
export function TopBar({ sync = false }: { sync?: boolean }) {
  const openSettings = useOpenSettings();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 md:h-16 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-x-6 md:py-0 md:px-6">
        <Link
          to="/"
          aria-label="no-fomo, go to Home"
          className="justify-self-start rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <LogoLockup height={22} />
        </Link>
        <NavTabs className="col-span-2 row-start-2 justify-self-center md:col-span-1 md:col-start-2 md:row-start-1" />
        <div className="flex min-w-0 items-center justify-end gap-1 md:col-start-3">
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
