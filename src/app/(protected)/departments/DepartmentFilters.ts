import type { DepartmentStatus } from "../../../../generated/prisma";

type SortDir = "asc" | "desc";

export type DepartmentsListFilters = {
  name?: string;
  status?: DepartmentStatus;
  managerId?: string;
};

export type DepartmentsListSort = {
  field: "name" | "manager" | "status";
  direction: SortDir;
};

// turn a query string into a clean value or undefined
function strOrUndef(v: string | null) {
  if (!v) return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

// parse status, but only allow a single value
function statusOrUndef(v: string | null): DepartmentStatus | undefined {
  const s = strOrUndef(v);
  if (!s) return undefined;
  if (s === "ACTIVE" || s === "INACTIVE") return s;
  return undefined;
}

// parse filters from the current url search params
export function filtersFromSearchParams(
  sp: URLSearchParams,
): DepartmentsListFilters | undefined {
  const name = strOrUndef(sp.get("name"));
  const status = statusOrUndef(sp.get("status"));
  const managerId = strOrUndef(sp.get("managerId"));

  const filters: DepartmentsListFilters = {
    ...(name ? { name } : {}),
    ...(status ? { status } : {}),
    ...(managerId ? { managerId } : {}),
  };

  return Object.keys(filters).length ? filters : undefined;
}

// set or remove a single filter param and reset paging
export function withFilterParam(
  sp: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const next = new URLSearchParams(sp);

  if (!value) next.delete(key);
  else next.set(key, value);

  // anytime filters change, reset paging
  next.set("page", "1");

  return next;
}
