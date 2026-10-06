import { NavLink } from "react-router";
import { TAB } from "./ui/tab";
import { TabLabel } from "./ui/tab-label";

const TABS = [
  { to: "/", label: "Search", end: true },
  { to: "/saved", label: "Saved", end: false },
  { to: "/reports", label: "Reports", end: false },
] as const;

export function NavTabs({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="flex gap-1">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} end={t.end} className={TAB}>
              <TabLabel>{t.label}</TabLabel>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
