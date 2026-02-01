"use client";

import * as React from "react";
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
    <div className="relative rounded-lg border bg-background">
      <div className="p-4 pb-14">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            {/* name filter */}
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
                placeholder="search..."
              />
            </label>
          </div>

          {/* status + manager controls (same layout as employees) */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setStatus(selectedStatus === "ACTIVE" ? undefined : "ACTIVE")
              }
              className={cx(
                "h-9 rounded-md border px-3 text-sm",
                selectedStatus === "ACTIVE" && "bg-emerald-500/10",
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
                "h-9 rounded-md border px-3 text-sm",
                selectedStatus === "INACTIVE" && "bg-amber-500/10",
              )}
            >
              inactive
            </button>

            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              className={cx(
                "h-9 rounded-md border px-3 text-sm",
                managerId && "bg-sky-500/10",
              )}
            >
              {managerId ? "manager set" : "pick manager"}
            </button>
          </div>
        </div>
      </div>

      {/* always-visible clear action (same as employees) */}
      <div className="sticky bottom-0 flex justify-end border-t p-3">
        <button
          type="button"
          onClick={clearAll}
          disabled={!hasAnyFilters}
          className={cx(
            "h-9 rounded-md border px-3 text-sm",
            !hasAnyFilters && "cursor-not-allowed opacity-50",
          )}
        >
          clear filters
        </button>
      </div>

      {/* manager picker modal (same pattern as employees) */}
      {managerOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
          <div className="w-full max-w-lg rounded-lg border bg-white p-4 dark:bg-background">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">pick manager</div>
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="rounded-md border px-2 py-1 text-xs"
              >
                close
              </button>
            </div>

            <input
              value={managerSearch}
              onChange={(e) => setManagerSearch(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
              placeholder="type last name…"
              autoFocus
            />

            <div className="mt-3 max-h-64 overflow-auto rounded-md border">
              {managersQuery.isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">
                  loading…
                </div>
              ) : managersQuery.isError ? (
                <div className="p-3 text-sm text-destructive">failed to load</div>
              ) : (managersQuery.data?.items.length ?? 0) > 0 ? (
                <div className="divide-y">
                  {(managersQuery.data?.items ?? []).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setManager(m.id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      {m.lastName}, {m.firstName}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">
                  no matches
                </div>
              )}
            </div>

            <div className="mt-3 flex justify-between">
              <button
                type="button"
                onClick={() => setManager(undefined)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                clear manager
              </button>

              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
