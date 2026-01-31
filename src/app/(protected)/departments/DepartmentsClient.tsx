"use client";

// react and api imports
import * as React from "react";
import { api } from "@/trpc/react";

// sorting types
type SortField = "name" | "manager" | "status" | "createdAt";
type SortDir = "asc" | "desc";

// small utility to join class names
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// helper to clamp numeric input safely
function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// map department status to pill styles
function statusPillClass(s: string) {
  return s === "ACTIVE"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-muted bg-muted/40 text-muted-foreground";
}

// main departments table client component
export default function DepartmentsClient() {
  // sorting state
  const [sort, setSort] = React.useState<{
    field: SortField;
    direction: SortDir;
  }>({
    field: "name",
    direction: "asc",
  });

  // pagination state
  const [page, setPage] = React.useState(1);
  const [pageInput, setPageInput] = React.useState("1");
  const [pageSizeInput, setPageSizeInput] = React.useState("10");

  // derive page size from user input
  const pageSize = React.useMemo(() => {
    const parsed = Number(pageSizeInput);
    return clampInt(parsed, 1, 200);
  }, [pageSizeInput]);

  // fetch departments list
  const q = api.departments.list.useQuery(
    { sort, page, pageSize },
    {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      placeholderData: (prev) => prev,
    },
  );

  // derived data
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  // pagination bounds
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // loading and updating flags
  const isInitialLoading = q.isLoading && items.length === 0;
  const isUpdating = q.isFetching && !q.isLoading;

  // sync visible page input with page state
  React.useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  // reset page when sort or page size changes
  React.useEffect(() => {
    setPage(1);
  }, [sort.field, sort.direction, pageSize]);

  // keep page in range if total pages shrink
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // commit page input changes
  const commitPageInput = React.useCallback(() => {
    const normalized = clampInt(Number(pageInput || 1), 1, totalPages);
    setPage(normalized);
    setPageInput(String(normalized));
  }, [pageInput, totalPages]);

  // toggle sorting state for a column
  const toggleSort = (field: SortField) => {
    setSort((prev) => {
      if (prev.field !== field) return { field, direction: "asc" };
      return {
        field: prev.field,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  // sort direction indicator
  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
    <span
      aria-hidden="true"
      className={cx(
        "ml-1 inline-block text-[10px] leading-none",
        active ? "text-foreground" : "text-muted-foreground/70",
      )}
    >
      {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
    </span>
  );

  // reusable sortable table header button
  const ThButton = ({ label, field }: { label: string; field: SortField }) => {
    const active = sort.field === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cx(
          "inline-flex items-center rounded-sm outline-none",
          "hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2",
        )}
        aria-sort={
          active
            ? sort.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        {label}
        <SortIcon active={active} dir={sort.direction} />
      </button>
    );
  };

  // initial loading skeleton
  if (isInitialLoading) {
    return (
      <section className="bg-background rounded-lg border">
        <div className="border-b px-6 py-4">
          <div className="bg-muted h-4 w-40 animate-pulse rounded" />
          <div className="bg-muted mt-2 h-3 w-72 animate-pulse rounded" />
        </div>
        <div className="text-muted-foreground p-6 text-sm">
          Loading departments…
        </div>
      </section>
    );
  }

  // main table layout
  return (
    <section className="bg-background overflow-hidden rounded-lg border">
      {q.isError && (
        <div className="border-destructive/40 bg-destructive/10 border-b px-6 py-3">
          <p className="text-destructive text-xs">
            Unable to refresh departments showing the last loaded results
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b text-left">
            <tr className="[&>th]:px-6 [&>th]:py-3 [&>th]:font-medium">
              <th>
                <ThButton label="Name" field="name" />
              </th>
              <th>
                <ThButton label="Manager" field="manager" />
              </th>
              <th className="text-right">
                <ThButton label="Status" field="status" />
              </th>
            </tr>
          </thead>

          {/* table body */}
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="text-muted-foreground px-6 py-6 text-sm"
                >
                  No departments found.
                </td>
              </tr>
            ) : (
              items.map((d) => {
                const managerName = d.manager
                  ? `${d.manager.firstName} ${d.manager.lastName}`
                  : "—";

                return (
                  <tr
                    key={d.id}
                    className={cx(
                      "transition-colors [&>td]:px-6 [&>td]:py-3",
                      !isUpdating && "hover:bg-muted/30",
                      isUpdating && "opacity-60",
                    )}
                  >
                    <td className="font-medium">{d.name}</td>
                    <td className="text-muted-foreground">{managerName}</td>
                    <td className="text-right">
                      <span
                        className={cx(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                          statusPillClass(d.status),
                        )}
                      >
                        {d.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* pagination controls */}
      <div className="relative flex items-center border-t px-6 py-3 text-sm">
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span>Page</span>
          <input
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPageInput();
            }}
            onBlur={commitPageInput}
            className={cx(
              "text-foreground bg-transparent tabular-nums",
              "w-[2.5ch] text-center",
              "outline-none",
              "focus-visible:border-foreground/40 focus-visible:border-b",
            )}
            aria-label="Current page"
            disabled={isUpdating}
          />
          <span>/ {totalPages}</span>
        </div>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1 || isUpdating}
            className={cx(
              "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Prev
          </button>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages || isUpdating}
            className={cx(
              "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Next
          </button>
        </div>

        {/* page size selector */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-muted-foreground text-xs" htmlFor="pageSize">
            Per page
          </label>
          <input
            id="pageSize"
            inputMode="numeric"
            value={pageSizeInput}
            onChange={(e) => setPageSizeInput(e.target.value)}
            onBlur={() => {
              const normalized = clampInt(Number(pageSizeInput || 10), 1, 200);
              setPageSizeInput(String(normalized));
            }}
            className="bg-background focus-visible:ring-ring h-9 w-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
            aria-label="Departments per page"
          />
        </div>
      </div>
    </section>
  );
}
