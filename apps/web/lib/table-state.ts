// Shared URL state for paginated, sortable tables. Every list page parses and builds its query string here,
// so the rules (defaults, malformed values, clamping, sort toggling) are the same everywhere.

export type SortDir = "asc" | "desc";

export type ListState<K extends string> = { page: number; sort: K; dir: SortDir };

export type SearchParams = { [key: string]: string | string[] | undefined };

export const PAGE_SIZE = 10;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Missing or malformed values mean page 1, so a hand-edited URL never breaks the page.
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(firstParam(value));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// Reads `<section>`, `<section>Sort` and `<section>Dir` from the URL. Unknown sort keys fall back to the default.
export function parseListState<K extends string>(
  params: SearchParams,
  section: string,
  keys: readonly K[],
  defaults: { sort: K; dir: SortDir },
): ListState<K> {
  const sortRaw = firstParam(params[`${section}Sort`]) ?? "";
  const dirRaw = firstParam(params[`${section}Dir`]);
  return {
    page: parsePage(params[section]),
    sort: (keys as readonly string[]).includes(sortRaw) ? (sortRaw as K) : defaults.sort,
    dir: dirRaw === "asc" || dirRaw === "desc" ? dirRaw : defaults.dir,
  };
}

// Clamps the page to the last real page, so a stale link (for example after a cancellation) still shows data.
export function clampPage<K extends string>(state: ListState<K>, total: number): ListState<K> {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { ...state, page: Math.min(state.page, totalPages) };
}

// Clicking the active column flips its direction. Clicking another column starts ascending. Sorting resets to page 1.
export function nextSort<K extends string>(current: ListState<K>, key: K): ListState<K> {
  const dir: SortDir = current.sort === key ? (current.dir === "asc" ? "desc" : "asc") : "asc";
  return { page: 1, sort: key, dir };
}

// Query-string pairs for one section, e.g. section "upcoming" gives upcoming, upcomingSort, upcomingDir.
export function sectionParams<K extends string>(section: string, state: ListState<K>): Record<string, string> {
  return {
    [section]: String(state.page),
    [`${section}Sort`]: state.sort,
    [`${section}Dir`]: state.dir,
  };
}

export function buildHref(path: string, ...parts: Record<string, string>[]): string {
  return `${path}?${new URLSearchParams(Object.assign({}, ...parts)).toString()}`;
}
