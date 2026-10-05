import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NO_FILTERS, type Filters } from "../lib/filters";
import { FacetPicker } from "./facet-picker";
import { KindSwitch } from "./kind-switch";
import { Button } from "./ui/button";

export function FilterBar({ filters, total, onChange }: { filters: Filters; total: number | undefined; onChange: (p: Partial<Filters>) => void }) {
  const authors = useQuery({ queryKey: ["authors"], queryFn: api.authors });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });

  return (
    <div className="flex flex-wrap items-center gap-2 py-3 md:py-4">
      <FacetPicker
        label="Author"
        allLabel="All authors"
        searchPlaceholder="Search authors"
        value={filters.author}
        onChange={(author) => onChange({ author })}
        options={(authors.data ?? []).map((a) => ({
          id: a.id,
          label: `@${a.username}`,
          sublabel: a.fullName,
          count: a.count,
          leading: <img src={a.avatarUrl} alt="" className="size-5 shrink-0 rounded-full bg-surface-2 object-cover" loading="lazy" />,
        }))}
      />
      {(collections.data?.length ?? 0) > 0 && (
        <FacetPicker
          label="Collection"
          allLabel="All collections"
          value={filters.collection}
          onChange={(collection) => onChange({ collection })}
          options={(collections.data ?? []).map((c) => ({
            id: c.id,
            label: c.name ?? "Unnamed collection",
            sublabel: c.name ? null : `Number ending ${c.id.slice(-4)}`,
            count: c.count,
          }))}
        />
      )}
      <KindSwitch value={filters.kind} onChange={(kind) => onChange({ kind })} />
      <div className="ms-auto flex items-center gap-2">
        {activeCount(filters) > 1 && (
          <Button variant="ghost" className="hidden md:inline-flex" onClick={() => onChange(NO_FILTERS)}>Clear all</Button>
        )}
        <span className="font-mono text-[13px] tabular-nums text-muted" role="status" aria-live="polite">
          {total !== undefined ? `${total.toLocaleString("en")} ${total === 1 ? "post" : "posts"}` : ""}
        </span>
      </div>
    </div>
  );
}

const activeCount = (f: Filters) => [f.q, f.author, f.collection, f.kind].filter(Boolean).length;
