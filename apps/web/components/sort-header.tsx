import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { tableHeadClass } from "@/components/table-styles";
import { type ListState, nextSort } from "@/lib/table-state";

export type ColumnDef<K extends string> = {
  label: string;
  key: K | null; // null means the column is not sortable
  align?: "left" | "right";
};

export type SortableHeaderProps = {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  href: string;
  align?: "left" | "right";
};

// Column header that links to the same list sorted by this column. Sorting happens on the server, so the
// link carries the new sort in the URL. The active column shows its direction through aria-sort and an icon.
export function SortableHeader({ label, active, dir, href, align = "left" }: SortableHeaderProps) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right" : ""}`}
    >
      <Link
        href={href}
        scroll={false}
        className={[
          "-mx-1 inline-flex items-center gap-1.5 rounded px-1 transition-colors",
          "hover:text-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
          active ? "text-brand-green" : "",
        ].join(" ")}
      >
        {label}
        <Icon size={14} aria-hidden="true" className={active ? "" : "opacity-40"} />
      </Link>
    </th>
  );
}

export function StaticHeader({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      {label || <span className="sr-only">Actions</span>}
    </th>
  );
}

// The whole <thead> for a sortable table. `hrefFor` builds the link for the next sort state.
export function SortableHead<K extends string>({
  columns,
  state,
  hrefFor,
}: {
  columns: ColumnDef<K>[];
  state: ListState<K>;
  hrefFor: (next: ListState<K>) => string;
}) {
  return (
    <thead className={tableHeadClass}>
      <tr>
        {columns.map((col) => {
          if (!col.key) return <StaticHeader key={col.label || "actions"} label={col.label} align={col.align} />;
          return (
            <SortableHeader
              key={col.label}
              label={col.label}
              active={state.sort === col.key}
              dir={state.dir}
              align={col.align}
              href={hrefFor({ ...nextSort(state, col.key) })}
            />
          );
        })}
      </tr>
    </thead>
  );
}
