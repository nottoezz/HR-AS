"use client";

import * as React from "react";
import { api } from "@/trpc/react";
import { useSearchParams } from "next/navigation";
import { useDepartmentsSelection } from "./DepartmentsSelectionContext";
import DepartmentsFilterBar from "./DepartmentsFilterBar";
import { filtersFromSearchParams } from "./DepartmentFilters";

// client table for departments
// server sorted paginated list with optimistic status toggle
// row selection is hradmin only and stored in context

type SortField = "name" | "manager" | "status";
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
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
    : "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-slate-600";
}

// normalize api strings into our union
function asStatus(s: string): Status {
  return s === "ACTIVE" ? "ACTIVE" : "INACTIVE";
}

export default function DepartmentsClient() {
  // selected row lives in context so header actions can use it
  const { selectedId, setSelectedId } = useDepartmentsSelection();

  // url state for filters (filter bar writes to these params)
  const sp = useSearchParams();
  const filters = React.useMemo(() => {
    const raw = filtersFromSearchParams(sp);
    if (!raw) return undefined;
    // API expects status as array
    return {
      ...raw,
      status: raw.status ? [raw.status] : undefined,
    };
  }, [sp]);

  // trpc cache helpers for optimistic updates
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
  }>({ field: "name", direction: "asc" });

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
    () => ({ sort, page, pageSize, filters }),
    [sort, page, pageSize, filters],
  );

  // departments list
  // placeholderData keeps the table interactive while a refetch happens
  const q = api.departments.list.useQuery(listInput, {
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
          active ? "text-slate-900" : "text-slate-400",
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
            "inline-flex items-center rounded-sm transition outline-none",
            "hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-offset-2",
            "focus-visible:ring-[rgb(var(--ring))] focus-visible:ring-offset-[rgb(var(--background))]",
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

  // if not hradmin clear selection and keep it cleared
  React.useEffect(() => {
    if (isHRAdmin) return;
    if (selectedId) setSelectedId(null);
  }, [isHRAdmin, selectedId, setSelectedId]);

  // clear selection if the selected department is no longer visible
  React.useEffect(() => {
    if (!selectedId) return;
    const stillVisible = items.some((d) => d.id === selectedId);
    if (!stillVisible) setSelectedId(null);
  }, [items, selectedId, setSelectedId]);

  // update department status with optimistic ui
  const updateM = api.departments.update.useMutation({
    async onMutate(vars) {
      // stop in flight list requests so we do not overwrite our optimistic change
      await utils.departments.list.cancel(listInput);

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
      const previous = utils.departments.list.getData(listInput);

      // apply optimistic status update
      const newStatus = vars.status;
      utils.departments.list.setData(listInput, (old) => {
        if (!old) return old;
        if (newStatus === undefined) return old;
        return {
          ...old,
          items: old.items.map((d) =>
            d.id === vars.id ? { ...d, status: newStatus } : d,
          ),
        };
      });

      return { previous };
    },
    onError(_err, vars, ctx) {
      // revert optimistic change
      if (ctx?.previous)
        utils.departments.list.setData(listInput, ctx.previous);

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
      void utils.departments.list.invalidate(listInput);
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
      <section className="ui-card ui-fade-in p-0">
        <div className="border-b border-[rgb(var(--border))] px-6 py-4">
          <div className="h-4 w-40 animate-pulse rounded bg-[rgb(var(--surface-2))]" />
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-[rgb(var(--surface-2))]" />
        </div>
        <div className="p-6 text-sm text-slate-600">Loading departments…</div>
      </section>
    );
  }

  return (
    <>
      <DepartmentsFilterBar />

      <section className="ui-card ui-fade-in overflow-hidden p-0">
        {/* we keep old data on screen but tell the user the refresh failed */}
        {q.isError && (
          <div className="border-b border-[rgb(var(--danger-border))] bg-[rgb(var(--danger-bg))] px-6 py-3">
            <p className="text-xs text-[rgb(var(--danger))]">
              Unable to refresh departments; showing the last loaded results.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-left">
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

            <tbody className="divide-y divide-[rgb(var(--border))]">
              {/* empty state */}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-6 text-sm text-slate-600">
                    No departments found.
                  </td>
                </tr>
              ) : (
                items.map((d) => {
                  // manager label for the table
                  const managerName = d.manager
                    ? `${d.manager.firstName} ${d.manager.lastName}`
                    : "—";

                  // status might be a string from prisma so normalize it
                  const effectiveStatus = asStatus(d.status);

                  // local state flags
                  const statusBusy = savingIds.has(d.id);
                  const showRowError = Boolean(rowError[d.id]);

                  // selection is hradmin only
                  const canSelectRow = Boolean(isHRAdmin);
                  const isSelected = canSelectRow && selectedId === d.id;

                  // toggling is hradmin only and disabled while busy
                  const canToggleStatus = Boolean(isHRAdmin) && !statusBusy;

                  return (
                    <tr
                      key={d.id}
                      onClick={() => toggleSelectedRow(d.id)}
                      onKeyDown={(ev) => {
                        // keyboard support for selection
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          toggleSelectedRow(d.id);
                        }
                      }}
                      tabIndex={canSelectRow ? 0 : -1}
                      aria-selected={isSelected}
                      className={cx(
                        "transition-colors [&>td]:px-6 [&>td]:py-3",
                        canSelectRow
                          ? "cursor-pointer hover:bg-[rgb(var(--surface-2))]"
                          : "",
                        isSelected && "bg-[rgba(99,102,241,0.10)]",
                        canSelectRow &&
                          "focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))] focus-visible:outline-none",
                      )}
                    >
                      <td className="font-semibold text-slate-900">{d.name}</td>
                      <td className="text-slate-600">{managerName}</td>

                      <td className="text-right">
                        <div className="inline-flex flex-col items-end">
                          <button
                            type="button"
                            onClick={(ev) => {
                              // keep row click from firing when toggling status
                              ev.stopPropagation();
                              if (!canToggleStatus) return;
                              onToggleStatus(d.id, effectiveStatus);
                            }}
                            className={cx(
                              "inline-flex items-center justify-between",
                              "min-w-[7.5rem] gap-2",
                              "rounded-md border px-2 py-0.5 text-xs font-semibold",
                              "transition focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))] focus-visible:outline-none",
                              statusPillClass(effectiveStatus),
                              !isHRAdmin && "cursor-default",
                              statusBusy && "cursor-not-allowed opacity-70",
                            )}
                            aria-label={`Status for ${d.name}`}
                            title={
                              statusBusy
                                ? "Updating…"
                                : isHRAdmin
                                  ? "Click to toggle status"
                                  : "Status"
                            }
                            disabled={!isHRAdmin || statusBusy}
                          >
                            <span className="tabular-nums">
                              {effectiveStatus}
                            </span>
                            {/* tiny busy dot so the user sees something happening */}
                            <span
                              aria-hidden="true"
                              className={cx(
                                "h-2 w-2 rounded-full",
                                statusBusy
                                  ? "animate-pulse bg-slate-300"
                                  : "bg-transparent",
                              )}
                            />
                          </button>

                          {/* row level failure message so we do not break the whole table */}
                          {showRowError && (
                            <div className="mt-1 text-[11px] text-[rgb(var(--danger))]">
                              failed to update status
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* pagination bar */}
        <div className="relative flex items-center border-t border-[rgb(var(--border))] px-6 py-3 text-sm">
          {/* left side page indicator with editable input */}
          <div className="flex items-center gap-1 text-xs text-slate-600">
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
                "text-slate-900 tabular-nums",
                "w-[2.5ch] bg-transparent text-center outline-none",
                "focus-visible:border-b focus-visible:border-slate-400",
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
                "ui-btn w-auto px-3.5 py-2",
                "border border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
                "hover:shadow-[var(--shadow-1)]",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none",
              )}
            >
              Prev
            </button>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={cx(
                "ui-btn w-auto px-3.5 py-2",
                "border border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
                "hover:shadow-[var(--shadow-1)]",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none",
              )}
            >
              Next
            </button>
          </div>

          {/* right side page size input */}
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-slate-600" htmlFor="pageSize">
              Per page
            </label>
            <input
              id="pageSize"
              inputMode="numeric"
              value={pageSizeInput}
              onChange={(e) => setPageSizeInput(e.target.value)}
              onBlur={() => {
                // normalize on blur so the ui matches what we actually request
                const normalized = clampInt(
                  Number(pageSizeInput || 10),
                  1,
                  200,
                );
                setPageSizeInput(String(normalized));
              }}
              className="ui-input h-9 w-12 px-2 py-1.5 text-center"
              aria-label="Departments per page"
            />
          </div>
        </div>
      </section>
    </>
  );
}
