"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { withFilterParam } from "./DepartmentFilters";

type Status = "ACTIVE" | "INACTIVE";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export default function DepartmentsFilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  // local input state so typing feels smooth
  const [name, setName] = React.useState(sp.get("name") ?? "");

  // keep local state in sync when user navigates via url
  React.useEffect(() => setName(sp.get("name") ?? ""), [sp]);

  const debouncedName = useDebouncedValue(name, 300);

  // write debounced name filter into the url
  React.useEffect(() => {
    const next = withFilterParam(
      new URLSearchParams(sp),
      "name",
      debouncedName.trim() || undefined,
    );
    router.replace(`?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName]);

  // status is single-select: active, inactive, or unset (same as employees)
  const selectedStatus = React.useMemo(() => {
    const raw = sp.get("status") ?? "";
    if (raw === "ACTIVE" || raw === "INACTIVE") return raw as Status;
    return undefined;
  }, [sp]);

  function setStatus(nextStatus: Status | undefined) {
    const next = new URLSearchParams(sp);
    if (!nextStatus) next.delete("status");
    else next.set("status", nextStatus);
    next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  // manager filter: picker modal like employees
  const [managerOpen, setManagerOpen] = React.useState(false);
  const managerId = sp.get("managerId") ?? "";

  const [managerSearch, setManagerSearch] = React.useState("");
  const debouncedManagerSearch = useDebouncedValue(managerSearch, 250);

  const managersQuery = api.employees.list.useQuery(
    {
      page: 1,
      pageSize: 10,
      sort: { field: "lastName", direction: "asc" },
      filters: debouncedManagerSearch
        ? { lastName: debouncedManagerSearch }
        : undefined,
    },
    {
      enabled: managerOpen,
      staleTime: 10_000,
    },
  );

  function setManager(nextId: string | undefined) {
    const next = withFilterParam(
      new URLSearchParams(sp),
      "managerId",
      nextId ?? undefined,
    );
    router.replace(`?${next.toString()}`);
    setManagerOpen(false);
    setManagerSearch("");
  }

  function clearAll() {
    const next = new URLSearchParams(sp);
    next.delete("name");
    next.delete("status");
    next.delete("managerId");
    next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  const hasAnyFilters =
    !!sp.get("name") || !!sp.get("status") || !!sp.get("managerId");

  return (
    <div className="ui-card ui-fade-in relative p-0">
      {/* inputs */}
      <div className="p-4 pb-14">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            {/* name filter */}
            <label className="space-y-1">
              <div className="ui-label">name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ui-input h-9"
                placeholder="search..."
              />
            </label>
          </div>

          {/* status + manager controls */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setStatus(selectedStatus === "ACTIVE" ? undefined : "ACTIVE")
              }
              className={cx(
                "ui-btn w-auto px-3.5 py-2",
                "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-slate-900",
                "hover:shadow-[var(--shadow-1)]",
                selectedStatus === "ACTIVE" &&
                  "border-emerald-500/30 bg-emerald-500/10",
              )}
            >
              active
            </button>

            <button
              type="button"
              onClick={() =>
                setStatus(
                  selectedStatus === "INACTIVE" ? undefined : "INACTIVE",
                )
              }
              className={cx(
                "ui-btn w-auto px-3.5 py-2",
                "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-slate-900",
                "hover:shadow-[var(--shadow-1)]",
                selectedStatus === "INACTIVE" &&
                  "border-amber-500/30 bg-amber-500/10",
              )}
            >
              inactive
            </button>

            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              className={cx(
                "ui-btn w-auto px-3.5 py-2",
                "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-slate-900",
                "hover:shadow-[var(--shadow-1)]",
                managerId && "border-sky-500/30 bg-sky-500/10",
              )}
            >
              {managerId ? "manager set" : "pick manager"}
            </button>
          </div>
        </div>
      </div>

      {/* always-visible clear action */}
      <div className="sticky bottom-0 flex justify-end border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
        <button
          type="button"
          onClick={clearAll}
          disabled={!hasAnyFilters}
          className={cx(
            "ui-btn w-auto px-3.5 py-2",
            "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-slate-900",
            "hover:shadow-[var(--shadow-1)]",
            !hasAnyFilters && "cursor-not-allowed opacity-50 hover:shadow-none",
          )}
        >
          clear filters
        </button>
      </div>

      {/* manager picker modal rendered via portal so it can't be clipped by the card */}
      {managerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close"
              onClick={() => setManagerOpen(false)}
            />

            <div className="fixed left-1/2 top-16 w-[92vw] max-w-lg -translate-x-1/2">
              <div className="ui-card ui-fade-in p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">
                    pick manager
                  </div>
                  <button
                    type="button"
                    onClick={() => setManagerOpen(false)}
                    className="ui-btn w-auto px-3.5 py-2"
                  >
                    close
                  </button>
                </div>

                <input
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                  className="ui-input h-9"
                  placeholder="type last name…"
                  autoFocus
                />

                <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                  {managersQuery.isLoading ? (
                    <div className="p-3 text-sm text-slate-600">loading…</div>
                  ) : managersQuery.isError ? (
                    <div className="p-3 text-sm text-[rgb(var(--danger))]">
                      failed to load
                    </div>
                  ) : (managersQuery.data?.items.length ?? 0) > 0 ? (
                    <div className="divide-y divide-[rgb(var(--border))]">
                      {(managersQuery.data?.items ?? []).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setManager(m.id)}
                          className="w-full px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--surface-2))]"
                        >
                          {m.lastName}, {m.firstName}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-sm text-slate-600">no matches</div>
                  )}
                </div>

                <div className="mt-3 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setManager(undefined)}
                    className="ui-btn w-auto px-3.5 py-2"
                  >
                    clear manager
                  </button>

                  <button
                    type="button"
                    onClick={() => setManagerOpen(false)}
                    className="ui-btn ui-btn-primary w-auto px-3.5 py-2"
                  >
                    done
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
