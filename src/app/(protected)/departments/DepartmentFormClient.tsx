"use client";

/**
 * create + edit form for departments
 * keep it minimal: name, manager (optional), status
 * manager is picked via the same modal search pattern as employees
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Props = { mode: "create" } | { mode: "edit"; id: string };
type Status = "ACTIVE" | "INACTIVE";

// tiny class join helper
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// normalize search strings so matching feels forgiving
function norm(s: string) {
  return s.trim().toLowerCase();
}

function asStatus(s: string): Status {
  return s === "ACTIVE" ? "ACTIVE" : "INACTIVE";
}

export default function DepartmentFormClient(props: Props) {
  const router = useRouter();
  const utils = api.useUtils();

  const isEdit = props.mode === "edit";
  const departmentId = isEdit ? props.id : null;

  // fetch existing data for edit mode
  const deptQ = api.departments.getById.useQuery(
    { id: departmentId ?? "" },
    { enabled: Boolean(departmentId) },
  );

  // manager picker options
  // keep this client side for now since its small and fast
  const managersQ = api.employees.list.useQuery(
    {
      sort: { field: "lastName", direction: "asc" as const },
      page: 1,
      pageSize: 200,
    },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );

  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<Status>("ACTIVE");
  const [managerId, setManagerId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  // manager modal state
  const [managerModalOpen, setManagerModalOpen] = React.useState(false);
  const [managerQuery, setManagerQuery] = React.useState("");
  const managerInputRef = React.useRef<HTMLInputElement | null>(null);

  // hydrate form when edit data loads
  React.useEffect(() => {
    if (!isEdit || !deptQ.data) return;

    setName(deptQ.data.name ?? "");
    setStatus(asStatus(deptQ.data.status));
    setManagerId(deptQ.data.manager?.id ?? null);

    // reset modal bits so you do not keep old state after switching records
    setManagerModalOpen(false);
    setManagerQuery("");
  }, [isEdit, deptQ.data]);

  // focus manager input when modal opens
  React.useEffect(() => {
    if (!managerModalOpen) return;
    const t = window.setTimeout(() => managerInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [managerModalOpen]);

  // prevent background scroll when modal open
  React.useEffect(() => {
    if (!managerModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [managerModalOpen]);

  // close modal on escape
  React.useEffect(() => {
    if (!managerModalOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setManagerModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [managerModalOpen]);

  const createM = api.departments.create.useMutation({
    onSuccess() {
      void utils.departments.list.invalidate();
      router.push("/departments");
      router.refresh();
    },
    onError(err) {
      setFormError(err.message || "failed to create department");
    },
  });

  const updateM = api.departments.update.useMutation({
    onSuccess() {
      void utils.departments.list.invalidate();
      if (departmentId) {
        void utils.departments.getById.invalidate({ id: departmentId });
      }
      router.push("/departments");
      router.refresh();
    },
    onError(err) {
      setFormError(err.message || "failed to update department");
    },
  });

  const saving = createM.isPending || updateM.isPending;

  // list of possible managers from the cached query
  const allManagers = React.useMemo(
    () => managersQ.data?.items ?? [],
    [managersQ.data?.items],
  );

  // label shown on the manager field when not in the modal
  const selectedManagerLabel = React.useMemo(() => {
    if (!managerId) return "No manager";
    const m = allManagers.find((x) => x.id === managerId);
    if (!m) return "Selected manager";
    const full = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
    return full || m.email || "Selected manager";
  }, [allManagers, managerId]);

  // filtered matches for the manager modal
  const managerMatches = React.useMemo(() => {
    const q = norm(managerQuery);

    return allManagers
      .filter((m) => {
        if (!q) return true;
        const first = m.firstName ?? "";
        const last = m.lastName ?? "";
        const email = m.email ?? "";
        return norm(`${first} ${last} ${email}`).includes(q);
      })
      .slice(0, 8);
  }, [allManagers, managerQuery]);

  function pickManager(id: string | null) {
    setManagerId(id);
    setManagerModalOpen(false);
    setManagerQuery("");
  }

  function openManagerModal() {
    setManagerModalOpen(true);
    setManagerQuery("");
  }

  function submitManagerFromEnter() {
    if (managersQ.isLoading || managersQ.isError) return;

    const typed = norm(managerQuery);
    if (!typed) return;

    // prefer exact email match if user types it
    const exactEmail = allManagers.find((m) => norm(m.email ?? "") === typed);
    if (exactEmail) {
      pickManager(exactEmail.id);
      return;
    }

    // otherwise select the top match
    const top = managerMatches[0];
    if (top) pickManager(top.id);
  }

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("name is required");
      return;
    }

    const payload = {
      name: trimmed,
      status,
      managerId: managerId ?? undefined,
    };

    if (isEdit) {
      updateM.mutate({ id: departmentId!, ...payload });
    } else {
      createM.mutate(payload);
    }
  };

  if (isEdit && deptQ.isLoading) {
    return (
      <div className="bg-background rounded-lg border p-6">
        <p className="text-muted-foreground text-sm">Loading department…</p>
      </div>
    );
  }

  if (isEdit && deptQ.isError) {
    return (
      <div className="bg-background rounded-lg border p-6">
        <p className="text-destructive text-sm">unable to load department</p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="bg-background rounded-lg border">
        <div className="space-y-4 p-6">
          {formError && (
            <div className="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2">
              <p className="text-destructive text-sm">{formError}</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="deptName">
              name
            </label>
            <input
              id="deptName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cx(
                "bg-background w-full rounded-md border px-3 py-2 text-sm outline-none",
                "focus-visible:ring-ring focus-visible:ring-2",
              )}
              placeholder="e.g. engineering"
              disabled={saving}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="deptStatus">
              status
            </label>
            <select
              id="deptStatus"
              value={status}
              onChange={(e) => setStatus(asStatus(e.target.value))}
              className={cx(
                "bg-background w-full rounded-md border px-3 py-2 text-sm outline-none",
                "focus-visible:ring-ring focus-visible:ring-2",
              )}
              disabled={saving}
            >
              <option value="ACTIVE">active</option>
              <option value="INACTIVE">inactive</option>
            </select>
          </div>

          {/* manager selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">manager</label>

            <div
              className={cx(
                "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                "hover:bg-muted/20 cursor-pointer",
              )}
              onClick={() => {
                if (managersQ.isError || managersQ.isLoading) return;
                openManagerModal();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (managersQ.isError || managersQ.isLoading) return;
                  openManagerModal();
                }
              }}
              aria-label="Select manager"
            >
              <div className="min-w-0">
                <div className="text-sm">{selectedManagerLabel}</div>
                <div className="text-muted-foreground text-xs">
                  {managerId ? "Selected" : "None"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    pickManager(null);
                  }}
                  className={cx(
                    "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  disabled={managersQ.isLoading || managersQ.isError || saving}
                  title="Clear manager"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openManagerModal();
                  }}
                  className={cx(
                    "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  disabled={managersQ.isLoading || managersQ.isError || saving}
                >
                  Change
                </button>
              </div>
            </div>

            {managersQ.isError && (
              <p className="text-destructive text-xs">
                Unable to load employees for manager selection.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <button
            type="button"
            onClick={() => router.push("/departments")}
            className="hover:bg-muted/40 h-9 rounded-md border px-3 text-sm"
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={cx(
              "h-9 rounded-md border px-3 text-sm",
              "bg-foreground text-background hover:opacity-90",
              saving && "opacity-70",
            )}
            disabled={saving}
          >
            {isEdit ? "Save changes" : "Create department"}
          </button>
        </div>
      </form>

      {/* manager modal */}
      {managerModalOpen && (
        <div
          className="fixed inset-0 z-50"
          aria-modal="true"
          role="dialog"
          aria-label="Select manager"
        >
          {/* backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setManagerModalOpen(false)}
          />

          {/* modal panel */}
          <div
            className={cx(
              "fixed top-20 left-1/2 -translate-x-1/2",
              "w-[92vw] max-w-md",
              "bg-white text-black",
              "rounded-lg border shadow-xl",
            )}
          >
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Select manager</div>
                  <div className="text-xs text-gray-500">
                    type a name or email, press enter to select
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setManagerModalOpen(false)}
                  className="h-8 rounded-md border px-3 text-xs hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <input
                ref={managerInputRef}
                value={managerQuery}
                onChange={(e) => setManagerQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitManagerFromEnter();
                  }
                }}
                placeholder="Start typing…"
                className="h-10 w-full rounded-md border px-3 text-sm"
                disabled={managersQ.isLoading}
              />

              <div className="text-xs text-gray-500">
                {managersQ.isLoading
                  ? "Loading employees…"
                  : managersQ.isError
                    ? "Cannot load employees."
                    : managerQuery.trim()
                      ? `Top matches: ${managerMatches.length}`
                      : "Tip: type an email for exact match."}
              </div>

              <div className="max-h-48 space-y-1 overflow-y-auto pt-1">
                {!managersQ.isLoading &&
                  !managersQ.isError &&
                  managerQuery.trim() && (
                    <>
                      {managerMatches.length === 0 ? (
                        <div className="rounded-md border px-3 py-2 text-sm text-gray-500">
                          No matches
                        </div>
                      ) : (
                        managerMatches.map((m) => {
                          const label =
                            `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() ||
                            m.email ||
                            "Employee";

                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => pickManager(m.id)}
                              className={cx(
                                "w-full rounded-md border px-3 py-2 text-left text-sm",
                                "hover:bg-gray-100",
                                managerId === m.id && "bg-gray-50",
                              )}
                            >
                              <div className="truncate">{label}</div>
                              {m.email && (
                                <div className="truncate text-xs text-gray-500">
                                  {m.email}
                                </div>
                              )}
                            </button>
                          );
                        })
                      )}
                    </>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
