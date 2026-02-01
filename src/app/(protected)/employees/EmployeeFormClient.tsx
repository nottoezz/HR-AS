"use client";

/**
 * create or edit employee form
 * hradmin can create + edit everything
 * non-hradmin can only edit their own basic profile fields (no status, manager, departments)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Props = { mode: "create" } | { mode: "edit"; id: string };

type Status = "ACTIVE" | "INACTIVE";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

type ManagerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

export default function EmployeeFormClient(props: Props) {
  const router = useRouter();
  const utils = api.useUtils();

  const isEdit = props.mode === "edit";
  const editId = isEdit ? props.id : undefined;

  // who am i
  const meQ = api.employees.me.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const myRole = meQ.data?.role;
  const myEmployeeId = meQ.data?.employeeId ?? null;
  const isHRAdmin = myRole === "HRADMIN";

  const isSelfEdit =
    isEdit && Boolean(myEmployeeId) && myEmployeeId === editId;

  // non-hr admins can only edit themselves
  const canOpenThisForm =
    !meQ.isLoading && (isHRAdmin || (isEdit && isSelfEdit));

  // fetch employee only when editing and permitted
  const employeeQ = api.employees.getById.useQuery(
    { id: editId ?? "" },
    { enabled: Boolean(isEdit && canOpenThisForm) },
  );

  // manager picker options (hradmin only UI, but query is cheap)
  const managersQ = api.employees.list.useQuery(
    { sort: { field: "lastName", direction: "asc" as const }, page: 1, pageSize: 200 },
    { staleTime: 60_000, refetchOnWindowFocus: false, enabled: Boolean(isHRAdmin) },
  );

  // departments picker options (hradmin only UI)
  const departmentsQ = api.departments.list.useQuery(
    { sort: { field: "name", direction: "asc" as const }, page: 1, pageSize: 200 },
    { staleTime: 60_000, refetchOnWindowFocus: false, enabled: Boolean(isHRAdmin) },
  );

  const createM = api.employees.create.useMutation();
  const updateM = api.employees.update.useMutation();

  const isSubmitting = createM.isPending || updateM.isPending;

  const [values, setValues] = React.useState<{
    firstName: string;
    lastName: string;
    email: string;
    telephone: string;
    status: Status;
    managerId: string | null;
    departmentIds: string[];
  }>({
    firstName: "",
    lastName: "",
    email: "",
    telephone: "",
    status: "ACTIVE",
    managerId: null,
    departmentIds: [],
  });

  // manager modal state (hradmin only)
  const [managerModalOpen, setManagerModalOpen] = React.useState(false);
  const [managerQuery, setManagerQuery] = React.useState("");
  const managerInputRef = React.useRef<HTMLInputElement | null>(null);

  // department modal state (hradmin only)
  const [deptModalOpen, setDeptModalOpen] = React.useState(false);
  const [deptQuery, setDeptQuery] = React.useState("");
  const deptInputRef = React.useRef<HTMLInputElement | null>(null);

  // hydrate form on edit (once employee is loaded)
  React.useEffect(() => {
    if (!employeeQ.data) return;

    const deptIds =
      employeeQ.data.departments?.map((x) => x.department.id) ?? [];

    setValues({
      firstName: employeeQ.data.firstName ?? "",
      lastName: employeeQ.data.lastName ?? "",
      email: employeeQ.data.email ?? "",
      telephone: employeeQ.data.telephone ?? "",
      status: (employeeQ.data.status as Status) ?? "ACTIVE",
      managerId: employeeQ.data.manager?.id ?? null,
      departmentIds: deptIds,
    });

    setManagerModalOpen(false);
    setManagerQuery("");
    setDeptModalOpen(false);
    setDeptQuery("");
  }, [employeeQ.data]);

  // focus modal input when opened
  React.useEffect(() => {
    if (!managerModalOpen) return;
    const t = window.setTimeout(() => managerInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [managerModalOpen]);

  React.useEffect(() => {
    if (!deptModalOpen) return;
    const t = window.setTimeout(() => deptInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [deptModalOpen]);

  // prevent background scroll when any modal open
  React.useEffect(() => {
    if (!managerModalOpen && !deptModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [managerModalOpen, deptModalOpen]);

  // close modals on escape
  React.useEffect(() => {
    if (!managerModalOpen && !deptModalOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setManagerModalOpen(false);
        setDeptModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [managerModalOpen, deptModalOpen]);

  const allManagers = React.useMemo(() => {
    const rows = managersQ.data?.items ?? [];
    return rows.map<ManagerRow>((m) => ({
      id: m.id,
      firstName: m.firstName ?? "",
      lastName: m.lastName ?? "",
      email: m.email ?? "",
    }));
  }, [managersQ.data?.items]);

  const allDepts = React.useMemo(() => {
    const rows = departmentsQ.data?.items ?? [];
    return rows.map<DepartmentRow>((d) => ({ id: d.id, name: d.name }));
  }, [departmentsQ.data?.items]);

  const selectedManagerLabel = React.useMemo(() => {
    if (!values.managerId) return "No manager";
    const m = allManagers.find((x) => x.id === values.managerId);
    if (!m) return "Selected manager";
    const name = `${m.firstName} ${m.lastName}`.trim();
    return name || m.email || "Selected manager";
  }, [allManagers, values.managerId]);

  const selectedDeptLabel = React.useMemo(() => {
    if (values.departmentIds.length === 0) return "No departments";
    if (values.departmentIds.length === 1) {
      const d = allDepts.find((x) => x.id === values.departmentIds[0]);
      return d?.name ?? "1 department";
    }
    return `${values.departmentIds.length} departments`;
  }, [allDepts, values.departmentIds]);

  const managerMatches = React.useMemo(() => {
    const q = norm(managerQuery);
    return allManagers
      .filter((m) => !(isEdit && m.id === editId)) // cannot pick self
      .filter((m) => {
        if (!q) return true;
        return norm(`${m.firstName} ${m.lastName} ${m.email}`).includes(q);
      })
      .slice(0, 8);
  }, [allManagers, managerQuery, isEdit, editId]);

  const deptMatches = React.useMemo(() => {
    const q = norm(deptQuery);
    return allDepts
      .filter((d) => {
        if (!q) return true;
        return norm(d.name).includes(q);
      })
      .slice(0, 8);
  }, [allDepts, deptQuery]);

  function pickManager(id: string | null) {
    setValues((v) => ({ ...v, managerId: id }));
    setManagerModalOpen(false);
    setManagerQuery("");
  }

  function toggleDept(id: string) {
    setValues((v) => {
      const has = v.departmentIds.includes(id);
      return {
        ...v,
        departmentIds: has
          ? v.departmentIds.filter((x) => x !== id)
          : [...v.departmentIds, id],
      };
    });
  }

  function clearDepts() {
    setValues((v) => ({ ...v, departmentIds: [] }));
  }

  function openManagerModal() {
    setManagerModalOpen(true);
    setManagerQuery("");
  }

  function openDeptModal() {
    setDeptModalOpen(true);
    setDeptQuery("");
  }

  function submitManagerFromEnter() {
    if (managersQ.isLoading || managersQ.isError) return;
    const typed = norm(managerQuery);
    if (!typed) return;

    const exactEmail = allManagers.find((m) => norm(m.email) === typed);
    if (exactEmail && !(isEdit && exactEmail.id === editId)) {
      pickManager(exactEmail.id);
      return;
    }

    const top = managerMatches[0];
    if (top) pickManager(top.id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // non-admin can only submit self edits
    if (!isHRAdmin && !isSelfEdit) return;

    const basePayload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      telephone: values.telephone,
    };

    if (isEdit) {
      await updateM.mutateAsync({
        id: editId!,
        ...basePayload,

        // only hradmin is allowed to send these (backend enforces too)
        status: isHRAdmin ? values.status : undefined,
        managerId: isHRAdmin
          ? values.managerId?.trim()
            ? values.managerId
            : null
          : undefined,
        departmentIds: isHRAdmin ? values.departmentIds : undefined,
      });
    } else {
      // create is hradmin only
      if (!isHRAdmin) return;

      await createM.mutateAsync({
        ...basePayload,
        status: values.status,
        managerId: values.managerId?.trim() ? values.managerId : undefined,
        departmentIds: values.departmentIds.length ? values.departmentIds : undefined,
      });
    }

    await utils.employees.list.invalidate();
    router.push("/employees");
    router.refresh();
  }

  // loading gate
  if (meQ.isLoading) return <div className="text-sm">Loading…</div>;

  // forbid non-admin viewing/editing other employees
  if (!canOpenThisForm) {
    return (
      <div className="rounded-md border p-4 text-sm">
        You can only edit your own profile.
      </div>
    );
  }

  if (isEdit && employeeQ.isLoading) {
    return <div className="text-sm">Loading employee…</div>;
  }

  const showHRFields = isHRAdmin;

  return (
    <>
      <form onSubmit={onSubmit} className="max-w-lg space-y-4">
        <input
          value={values.firstName}
          onChange={(e) =>
            setValues((v) => ({ ...v, firstName: e.target.value }))
          }
          placeholder="First name"
          className="h-10 w-full rounded-md border px-3"
        />

        <input
          value={values.lastName}
          onChange={(e) =>
            setValues((v) => ({ ...v, lastName: e.target.value }))
          }
          placeholder="Last name"
          className="h-10 w-full rounded-md border px-3"
        />

        <input
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          placeholder="Email"
          className="h-10 w-full rounded-md border px-3"
          disabled={isEdit && showHRFields} // hradmin edit keeps email locked (your original rule)
        />

        <input
          value={values.telephone}
          onChange={(e) =>
            setValues((v) => ({ ...v, telephone: e.target.value }))
          }
          placeholder="Telephone"
          className="h-10 w-full rounded-md border px-3"
        />

        {/* hradmin only fields */}
        {showHRFields && isEdit && (
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              value={values.status}
              onChange={(e) =>
                setValues((v) => ({ ...v, status: e.target.value as Status }))
              }
              className="bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        )}

        {showHRFields && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Departments</label>

            <div
              className={cx(
                "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                "hover:bg-muted/20 cursor-pointer",
              )}
              onClick={() => {
                if (departmentsQ.isError || departmentsQ.isLoading) return;
                openDeptModal();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (departmentsQ.isError || departmentsQ.isLoading) return;
                  openDeptModal();
                }
              }}
              aria-label="Select departments"
            >
              <div className="min-w-0">
                <div className="text-sm">{selectedDeptLabel}</div>
                <div className="text-muted-foreground text-xs">
                  {values.departmentIds.length ? "Selected" : "None"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearDepts();
                  }}
                  className={cx(
                    "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  disabled={departmentsQ.isLoading || departmentsQ.isError}
                  title="Clear departments"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeptModal();
                  }}
                  className={cx(
                    "hover:bg-muted/40 h-9 rounded-md border px-3 text-sm",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  disabled={departmentsQ.isLoading || departmentsQ.isError}
                >
                  Change
                </button>
              </div>
            </div>

            {departmentsQ.isError && (
              <p className="text-destructive text-xs">
                Unable to load departments for selection.
              </p>
            )}
          </div>
        )}

        {showHRFields && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Manager</label>

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
                  {values.managerId ? "Selected" : "None"}
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
                  disabled={managersQ.isLoading || managersQ.isError}
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
                  disabled={managersQ.isLoading || managersQ.isError}
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
        )}

        <button
          type="submit"
          className="h-10 rounded-md border px-4 text-sm"
          disabled={isSubmitting}
        >
          {isEdit ? "Save changes" : "Create employee"}
        </button>
      </form>

      {/* departments modal (multi-select) */}
      {showHRFields && deptModalOpen && (
        <div
          className="fixed inset-0 z-50"
          aria-modal="true"
          role="dialog"
          aria-label="Select departments"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setDeptModalOpen(false)}
          />

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
                  <div className="text-sm font-medium">Select departments</div>
                  <div className="text-xs text-gray-500">
                    type to filter, click to toggle
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="h-8 rounded-md border px-3 text-xs hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <input
                ref={deptInputRef}
                value={deptQuery}
                onChange={(e) => setDeptQuery(e.target.value)}
                placeholder="Start typing…"
                className="h-10 w-full rounded-md border px-3 text-sm"
                disabled={departmentsQ.isLoading}
              />

              <div className="text-xs text-gray-500">
                {departmentsQ.isLoading
                  ? "Loading departments…"
                  : departmentsQ.isError
                    ? "Cannot load departments."
                    : deptQuery.trim()
                      ? `Top matches: ${deptMatches.length}`
                      : "Tip: click items to select."}
              </div>

              <div className="max-h-56 space-y-1 overflow-y-auto pt-1">
                {!departmentsQ.isLoading &&
                  !departmentsQ.isError &&
                  (deptQuery.trim() ? deptMatches : allDepts).map((d) => {
                    const checked = values.departmentIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDept(d.id)}
                        className={cx(
                          "w-full rounded-md border px-3 py-2 text-left text-sm",
                          "hover:bg-gray-100",
                          checked && "bg-gray-50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{d.name}</span>
                          <span className="text-xs text-gray-500">
                            {checked ? "Selected" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* manager modal */}
      {showHRFields && managerModalOpen && (
        <div
          className="fixed inset-0 z-50"
          aria-modal="true"
          role="dialog"
          aria-label="Select manager"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setManagerModalOpen(false)}
          />

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
                            `${m.firstName} ${m.lastName}`.trim() ||
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
                                values.managerId === m.id && "bg-gray-50",
                              )}
                            >
                              <div className="truncate">{label}</div>
                              {m.email ? (
                                <div className="truncate text-xs text-gray-500">
                                  {m.email}
                                </div>
                              ) : null}
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
