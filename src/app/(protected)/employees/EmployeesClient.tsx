"use client";

import * as React from "react";
import { api } from "@/trpc/react";
import { useEmployeesSelection } from "./EmployeesSelectionContext";

// employees table client
// server sorted paginated list with optimistic status toggle
// row selection is hradmin only and stored in context

type SortField =
  | "firstName"
  | "lastName"
  | "email"
  | "status"
  | "createdAt"
  | "manager"
  | "depts"
  | "reports";

type SortDir = "asc" | "desc";
type Status = "ACTIVE" | "INACTIVE";

// tiny class join helper
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// clamp user input so we do not request silly pages or sizes
function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// status pill styling
function statusPillClass(s: Status) {
  return s === "ACTIVE"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-muted bg-muted/40 text-muted-foreground";
}

export default function EmployeesClient() {
  // selected row lives in context so header actions can use it
  const { selectedId, setSelectedId } = useEmployeesSelection();

  // trpc cache helpers for optimistic updates and invalidation
  const utils = api.useUtils();

  // who am i and what am i allowed to do
  const meQ = api.employees.me.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const isHRAdmin = meQ.data?.role === "HRADMIN";

  // current server sort
  const [sort, setSort] = React.useState<{
    field: SortField;
    direction: SortDir;
  }>({ field: "lastName", direction: "asc" });

  // current page and editable inputs
  const [page, setPage] = React.useState(1);
  const [pageInput, setPageInput] = React.useState("1");
  const [pageSizeInput, setPageSizeInput] = React.useState("10");

  // derived page size from user input
  const pageSize = React.useMemo(
    () => clampInt(Number(pageSizeInput), 1, 200),
    [pageSizeInput],
  );

  // stable query input so react query caching behaves
  const listInput = React.useMemo(
    () => ({ sort, page, pageSize }),
    [sort, page, pageSize],
  );

  // employees list
  // placeholderData keeps the table interactive while a refetch happens
  const q = api.employees.list.useQuery(listInput, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // safe defaults for render
  const items = React.useMemo(() => q.data?.items ?? [], [q.data?.items]);
  const total = q.data?.total ?? 0;

  // derived pagination
  const totalPages = React.useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  // only show skeleton on first load
  const isInitialLoading = q.isLoading && items.length === 0;

  // track optimistic toggles per row
  const [savingIds, setSavingIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  // per row error flag when mutation fails
  const [rowError, setRowError] = React.useState<Record<string, boolean>>({});

  // keep the input in sync when page changes from buttons or clamping
  React.useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  // reset to page 1 when query shape changes
  React.useEffect(() => {
    setPage(1);
  }, [sort.field, sort.direction, pageSize]);

  // clamp page if data size changes under us
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // if not hradmin clear selection and keep it cleared
  React.useEffect(() => {
    if (isHRAdmin) return;
    if (selectedId) setSelectedId(null);
  }, [isHRAdmin, selectedId, setSelectedId]);

  // commit the typed page input into the real page state
  const commitPageInput = React.useCallback(() => {
    const normalized = clampInt(Number(pageInput || 1), 1, totalPages);
    setPage(normalized);
    setPageInput(String(normalized));
  }, [pageInput, totalPages]);

  // toggle sort direction and switch fields
  const toggleSort = React.useCallback((field: SortField) => {
    setSort((prev) => {
      if (prev.field !== field) return { field, direction: "asc" };
      return {
        field: prev.field,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  }, []);

  // small glyph helper for the table header
  const SortIcon = React.useCallback(
    ({ active, dir }: { active: boolean; dir: SortDir }) => (
      <span
        aria-hidden="true"
        className={cx(
          "ml-1 inline-block text-[10px] leading-none",
          active ? "text-foreground" : "text-muted-foreground/70",
        )}
      >
        {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    ),
    [],
  );

  // table header button that wires up aria sort and click behavior
  const ThButton = React.useCallback(
    ({ label, field }: { label: string; field: SortField }) => {
      const active = sort.field === field;

      return (
        <button
          type="button"
          role="columnheader"
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
    },
    [sort.field, sort.direction, toggleSort, SortIcon],
  );

  // clear selection if the selected employee is no longer visible
  React.useEffect(() => {
    if (!selectedId) return;
    const stillVisible = items.some((e) => e.id === selectedId);
    if (!stillVisible) setSelectedId(null);
  }, [items, selectedId, setSelectedId]);

  // update employee status with optimistic ui
  const updateM = api.employees.update.useMutation({
    async onMutate(vars) {
      // stop in flight list requests so we do not overwrite our optimistic change
      await utils.employees.list.cancel(listInput);

      // clear old error for this row when we try again
      setRowError((prev) => {
        if (!prev[vars.id]) return prev;
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });

      // mark row as busy
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.add(vars.id);
        return next;
      });

      // snapshot previous list so we can revert on error
      const previous = utils.employees.list.getData(listInput);

      // apply optimistic status update
      const newStatus = vars.status;
      utils.employees.list.setData(listInput, (old) => {
        if (!old) return old;
        if (newStatus === undefined) return old;
        return {
          ...old,
          items: old.items.map((e) =>
            e.id === vars.id ? { ...e, status: newStatus } : e,
          ),
        };
      });

      return { previous };
    },
    onError(_err, vars, ctx) {
      // revert optimistic change
      if (ctx?.previous) utils.employees.list.setData(listInput, ctx.previous);

      // show error under the row
      setRowError((prev) => ({ ...prev, [vars.id]: true }));

      // clear busy state
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
    },
    onSuccess(_data, vars) {
      // clear busy state on success
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
    },
    onSettled() {
      // revalidate list so we end in sync with the server
      void utils.employees.list.invalidate(listInput);
    },
  });

  // click handler for status pill
  const onToggleStatus = React.useCallback(
    (id: string, current: Status) => {
      // if not hradmin do nothing
      if (!isHRAdmin) return;

      // guard against double clicks while busy
      setSavingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = current === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        updateM.mutate({ id, status: next });
        return prev;
      });
    },
    [isHRAdmin, updateM],
  );

  // row selection is hradmin only
  const toggleSelectedRow = React.useCallback(
    (id: string) => {
      if (!isHRAdmin) return;
      setSelectedId(selectedId === id ? null : id);
    },
    [isHRAdmin, selectedId, setSelectedId],
  );

  // initial skeleton
  if (isInitialLoading) {
    return (
      <section className="bg-background rounded-lg border">
        <div className="border-b px-6 py-4">
          <div className="bg-muted h-4 w-40 animate-pulse rounded" />
          <div className="bg-muted mt-2 h-3 w-72 animate-pulse rounded" />
        </div>
        <div className="text-muted-foreground p-6 text-sm">
          Loading employees…
        </div>
      </section>
    );
  }

  return (
    <section className="bg-background overflow-hidden rounded-lg border">
      {/* we keep old data on screen but tell the user the refresh failed */}
      {q.isError && (
        <div className="border-destructive/40 bg-destructive/10 border-b px-6 py-3">
          <p className="text-destructive text-xs">
            Unable to refresh employees; showing the last loaded results.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b text-left">
            <tr className="[&>th]:px-6 [&>th]:py-3 [&>th]:font-medium">
              <th>
                <ThButton label="Name" field="lastName" />
              </th>
              <th>
                <ThButton label="Email" field="email" />
              </th>
              <th>
                <ThButton label="Status" field="status" />
              </th>
              <th>
                <ThButton label="Manager" field="manager" />
              </th>
              <th className="text-right">
                <ThButton label="Depts" field="depts" />
              </th>
              <th className="text-right">
                <ThButton label="Reports" field="reports" />
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {/* empty state */}
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted-foreground px-6 py-6 text-sm"
                >
                  No employees found.
                </td>
              </tr>
            ) : (
              items.map((e) => {
                // simple display strings for the row
                const name = `${e.firstName} ${e.lastName}`;
                const managerName = e.manager
                  ? `${e.manager.firstName} ${e.manager.lastName}`
                  : "—";

                // normalize status into our union for styling
                const effectiveStatus = (e.status as Status) ?? "INACTIVE";

                // local state flags
                const statusBusy = savingIds.has(e.id);
                const showRowError = Boolean(rowError[e.id]);

                // selection is hradmin only
                const canSelectRow = Boolean(isHRAdmin);
                const isSelected = canSelectRow && selectedId === e.id;

                // toggling is hradmin only and disabled while busy
                const canToggleStatus = Boolean(isHRAdmin) && !statusBusy;

                return (
                  <tr
                    key={e.id}
                    onClick={() => toggleSelectedRow(e.id)}
                    onKeyDown={(ev) => {
                      // keyboard support for selection
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        toggleSelectedRow(e.id);
                      }
                    }}
                    tabIndex={canSelectRow ? 0 : -1}
                    aria-selected={isSelected}
                    className={cx(
                      "transition-colors [&>td]:px-6 [&>td]:py-3",
                      canSelectRow ? "hover:bg-muted/30 cursor-pointer" : "",
                      isSelected && "bg-red-500/10",
                      canSelectRow &&
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    )}
                  >
                    <td className="font-medium">{name}</td>
                    <td className="text-muted-foreground">{e.email}</td>

                    <td>
                      <button
                        type="button"
                        onClick={(ev) => {
                          // keep row click from firing when toggling status
                          ev.stopPropagation();
                          if (!canToggleStatus) return;
                          onToggleStatus(e.id, effectiveStatus);
                        }}
                        className={cx(
                          "inline-flex items-center justify-between",
                          "min-w-[7.5rem] gap-2",
                          "rounded-md border px-2 py-0.5 text-xs font-medium",
                          statusPillClass(effectiveStatus),
                          isHRAdmin &&
                            "hover:bg-muted/40 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                          !isHRAdmin && "cursor-default",
                          statusBusy && "cursor-not-allowed opacity-70",
                        )}
                        aria-label={`Status for ${name}`}
                        title={
                          statusBusy
                            ? "Updating…"
                            : isHRAdmin
                              ? "Click to toggle status"
                              : "Status"
                        }
                        disabled={!isHRAdmin || statusBusy}
                      >
                        <span className="tabular-nums">{effectiveStatus}</span>
                        {/* tiny busy dot so the user sees something happening */}
                        <span
                          aria-hidden="true"
                          className={cx(
                            "h-2 w-2 rounded-full",
                            statusBusy
                              ? "bg-muted animate-pulse"
                              : "bg-transparent",
                          )}
                        />
                      </button>

                      {/* row level failure message so we do not break the whole table */}
                      {showRowError && (
                        <div className="text-destructive mt-1 text-[11px]">
                          failed to update status
                        </div>
                      )}
                    </td>

                    <td className="text-muted-foreground">{managerName}</td>
                    <td className="text-right tabular-nums">
                      {e._count.departments}
                    </td>
                    <td className="text-right tabular-nums">
                      {e._count.directReports}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* pagination bar */}
      <div className="relative flex items-center border-t px-6 py-3 text-sm">
        {/* left side page indicator with editable input */}
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
          />
          <span>/ {totalPages}</span>
        </div>

        {/* centered prev next controls */}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
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
            disabled={page >= totalPages}
            className={cx(
              "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Next
          </button>
        </div>

        {/* right side page size input */}
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
              // normalize on blur so the ui matches what we actually request
              const normalized = clampInt(Number(pageSizeInput || 10), 1, 200);
              setPageSizeInput(String(normalized));
            }}
            className="bg-background focus-visible:ring-ring h-9 w-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
            aria-label="Employees per page"
          />
        </div>
      </div>
    </section>
  );
}
