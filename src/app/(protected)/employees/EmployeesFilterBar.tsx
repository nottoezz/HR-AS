"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { withFilterCsv, withFilterParam } from "./EmployeeFilters";

type Status = "ACTIVE" | "INACTIVE";

// tiny class join helper
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// debounce a value so typing does not spam url updates
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

// split a csv query param into a clean array
function splitCsv(v: string | null) {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EmployeesFilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  // local input state so typing feels smooth
  const [firstName, setFirstName] = React.useState(sp.get("firstName") ?? "");
  const [lastName, setLastName] = React.useState(sp.get("lastName") ?? "");
  const [email, setEmail] = React.useState(sp.get("email") ?? "");

  // keep local state in sync when user navigates via url
  React.useEffect(() => setFirstName(sp.get("firstName") ?? ""), [sp]);
  React.useEffect(() => setLastName(sp.get("lastName") ?? ""), [sp]);
  React.useEffect(() => setEmail(sp.get("email") ?? ""), [sp]);

  const debouncedFirst = useDebouncedValue(firstName, 300);
  const debouncedLast = useDebouncedValue(lastName, 300);
  const debouncedEmail = useDebouncedValue(email, 300);

  // write debounced text filters into the url
  React.useEffect(() => {
    const next = withFilterParam(
      new URLSearchParams(sp),
      "firstName",
      debouncedFirst.trim() || undefined,
    );
    router.replace(`?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFirst]);

  React.useEffect(() => {
    const next = withFilterParam(
      new URLSearchParams(sp),
      "lastName",
      debouncedLast.trim() || undefined,
    );
    router.replace(`?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLast]);

  React.useEffect(() => {
    const next = withFilterParam(
      new URLSearchParams(sp),
      "email",
      debouncedEmail.trim() || undefined,
    );
    router.replace(`?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedEmail]);

  // status is single-select: active, inactive, or unset
  const selectedStatus = React.useMemo(() => {
    const raw = splitCsv(sp.get("status"))[0] ?? "";
    if (raw === "ACTIVE" || raw === "INACTIVE") return raw as Status;
    return undefined;
  }, [sp]);

  // set or clear the status filter
  function setStatus(nextStatus: Status | undefined) {
    const next = new URLSearchParams(sp);

    if (!nextStatus) next.delete("status");
    else next.set("status", nextStatus);

    // anytime filters change, reset paging
    next.set("page", "1");

    router.replace(`?${next.toString()}`);
  }

  // departments are multi-select and stored as csv
  const selectedDeptIds = React.useMemo(
    () => new Set(splitCsv(sp.get("departmentIds"))),
    [sp],
  );

  const departmentsQuery = api.departments.list.useQuery(
    { page: 1, pageSize: 200 },
    { staleTime: 60_000 },
  );

  // toggle a department id in the csv filter
  function toggleDept(deptId: string) {
    const cur = new Set(selectedDeptIds);
    if (cur.has(deptId)) cur.delete(deptId);
    else cur.add(deptId);

    const next = withFilterCsv(
      new URLSearchParams(sp),
      "departmentIds",
      Array.from(cur),
    );
    router.replace(`?${next.toString()}`);
  }

  // manager filter uses a small modal picker
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

  // set or clear the manager filter
  function setManager(nextId: string | undefined) {
    const next = withFilterParam(new URLSearchParams(sp), "managerId", nextId);
    router.replace(`?${next.toString()}`);
    setManagerOpen(false);
    setManagerSearch("");
  }

  // clear all filters and reset paging
  function clearAll() {
    const next = new URLSearchParams(sp);
    next.delete("firstName");
    next.delete("lastName");
    next.delete("email");
    next.delete("status");
    next.delete("departmentIds");
    next.delete("managerId");
    next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  // used to disable the clear button when nothing is set
  const hasAnyFilters =
    !!sp.get("firstName") ||
    !!sp.get("lastName") ||
    !!sp.get("email") ||
    !!sp.get("status") ||
    !!sp.get("departmentIds") ||
    !!sp.get("managerId");

  return (
    <div className="relative rounded-lg border bg-background">
      <div className="p-4 pb-14">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            {/* first name filter */}
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">first name</div>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
                placeholder="search..."
              />
            </label>

            {/* last name filter */}
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">last name</div>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
                placeholder="search..."
              />
            </label>

            {/* email filter */}
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">email</div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
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

        {/* departments multi-select */}
        <div className="mt-4">
          <div className="mb-2 text-xs text-muted-foreground">departments</div>

          {departmentsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">loading…</div>
          ) : departmentsQuery.isError ? (
            <div className="text-sm text-destructive">
              failed to load departments
            </div>
          ) : (departmentsQuery.data?.items.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(departmentsQuery.data?.items ?? []).map((d) => {
                const selected = selectedDeptIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDept(d.id)}
                    className={cx(
                      "h-8 rounded-md border px-2 text-xs",
                      selected && "bg-red-500/10 border-red-500/30",
                    )}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">no departments</div>
          )}
        </div>
      </div>

      {/* always-visible clear action */}
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

      {/* manager picker modal */}
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
