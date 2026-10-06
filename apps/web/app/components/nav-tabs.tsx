import { NavLink } from "react-router";

const TABS = [
  { to: "/", label: "Home", end: true },
  { to: "/saved", label: "Saved", end: false },
  { to: "/reports", label: "Reports", end: false },
] as const;

export function NavTabs({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="flex gap-1">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `inline-flex h-9 items-center rounded-control px-3 text-[14px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent ${
                  isActive ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface hover:text-text"
                }`
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
