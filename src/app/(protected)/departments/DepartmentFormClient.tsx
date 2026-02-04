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
      <section className="ui-card ui-fade-in">
        <p className="ui-muted">loading department…</p>
      </section>
    );
  }

  if (isEdit && deptQ.isError) {
    return (
      <section className="ui-card ui-fade-in">
        <div className="ui-alert-error">unable to load department</div>
      </section>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="ui-card ui-fade-in">
        <div className="space-y-4">
          {/* error */}
          {formError && <div className="ui-alert-error">{formError}</div>}

          {/* name */}
          <div className="space-y-1">
            <label className="ui-label" htmlFor="deptName">
              name
            </label>
            <input
              id="deptName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="ui-input"
              placeholder="e.g. engineering"
              disabled={saving}
            />
          </div>

          {/* status */}
          <div className="space-y-1">
            <label className="ui-label" htmlFor="deptStatus">
              status
            </label>
            <select
              id="deptStatus"
              value={status}
              onChange={(e) => setStatus(asStatus(e.target.value))}
              className="ui-input"
              disabled={saving}
            >
              <option value="ACTIVE">active</option>
              <option value="INACTIVE">inactive</option>
            </select>
          </div>

          {/* manager */}
          <div className="space-y-2">
            <label className="ui-label">manager</label>

            <div
              className={cx(
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                "border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
                "transition hover:bg-[rgb(var(--surface-2))]",
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {selectedManagerLabel}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pickManager(null)}
                  className="ui-btn w-auto px-3.5 py-2"
                  disabled={managersQ.isLoading || managersQ.isError || saving}
                  title="clear manager"
                >
                  clear
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (managersQ.isError || managersQ.isLoading) return;
                    openManagerModal();
                  }}
                  className="ui-btn w-auto px-3.5 py-2"
                  disabled={managersQ.isLoading || managersQ.isError || saving}
                >
                  change
                </button>
              </div>
            </div>

            {managersQ.isError && (
              <p className="text-[rgb(var(--danger))] text-xs">
                unable to load employees for manager selection
              </p>
            )}
          </div>

          {/* actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.push("/departments")}
              className="ui-btn w-auto px-4 py-2.5"
              disabled={saving}
            >
              cancel
            </button>

            <button
              type="submit"
              className="ui-btn ui-btn-primary w-auto px-4 py-2.5"
              disabled={saving}
            >
              {isEdit ? "save changes" : "create department"}
            </button>
          </div>
        </div>
      </form>

      {/* manager modal */}
      {managerModalOpen && (
        <div
          className="fixed inset-0 z-50"
          aria-modal="true"
          role="dialog"
          aria-label="select manager"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="close"
            onClick={() => setManagerModalOpen(false)}
          />

          <div className="fixed left-1/2 top-16 w-[92vw] max-w-lg -translate-x-1/2">
            <div className="ui-card ui-fade-in p-4">
              {/* header */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">pick manager</div>
                <button
                  type="button"
                  onClick={() => setManagerModalOpen(false)}
                  className="ui-btn w-auto px-3.5 py-2"
                >
                  close
                </button>
              </div>

              {/* search */}
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
                placeholder="type name or email…"
                className="ui-input h-10"
                disabled={managersQ.isLoading}
              />

              {/* list */}
              <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                {managersQ.isLoading ? (
                  <div className="p-3 text-sm text-slate-600">loading…</div>
                ) : managersQ.isError ? (
                  <div className="p-3 text-sm text-[rgb(var(--danger))]">
                    failed to load
                  </div>
                ) : (managerQuery.trim() ? managerMatches : allManagers).length >
                  0 ? (
                  <div className="divide-y divide-[rgb(var(--border))]">
                    {(managerQuery.trim() ? managerMatches : allManagers)
                      .slice(0, 20)
                      .map((m) => {
                        const label =
                          `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() ||
                          m.email ||
                          "employee";

                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => pickManager(m.id)}
                            className={cx(
                              "w-full px-3 py-2 text-left text-sm transition",
                              "hover:bg-[rgb(var(--surface-2))]",
                              managerId === m.id && "bg-[rgb(var(--surface-2))]",
                            )}
                          >
                            <div className="truncate font-medium">{label}</div>
                            {m.email ? (
                              <div className="truncate text-xs text-slate-600">
                                {m.email}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="p-3 text-sm text-slate-600">no matches</div>
                )}
              </div>

              {/* footer */}
              <div className="mt-3 flex justify-between">
                <button
                  type="button"
                  onClick={() => pickManager(null)}
                  className="ui-btn w-auto px-3.5 py-2"
                >
                  clear manager
                </button>
                <button
                  type="button"
                  onClick={() => setManagerModalOpen(false)}
                  className="ui-btn ui-btn-primary w-auto px-3.5 py-2"
                >
                  done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
