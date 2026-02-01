import type { EmployeeStatus } from "../../../../generated/prisma";

type SortDir = "asc" | "desc";

export type EmployeesListFilters = {
  firstName?: string;
  lastName?: string;
  email?: string;

  // only one status at a time
  status?: EmployeeStatus;

  departmentIds?: string[];
  managerId?: string;
};

export type EmployeesListSort = {
  field:
    | "firstName"
    | "lastName"
    | "email"
    | "status"
    | "createdAt"
    | "manager"
    | "depts"
    | "reports";
  direction: SortDir;
};

// split a csv param into ["a", "b", "c"]
function splitCsv(v: string | null) {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// turn a query string into a clean value or undefined
function strOrUndef(v: string | null) {
  if (!v) return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

// parse status, but only allow a single value
function statusOrUndef(v: string | null): EmployeeStatus | undefined {
  const s = strOrUndef(v);
  if (!s) return undefined;
  if (s === "ACTIVE" || s === "INACTIVE") return s;
  return undefined;
}

// parse filters from the current url search params
export function filtersFromSearchParams(
  sp: URLSearchParams,
): EmployeesListFilters | undefined {
  const firstName = strOrUndef(sp.get("firstName"));
  const lastName = strOrUndef(sp.get("lastName"));
  const email = strOrUndef(sp.get("email"));

  // allow either `status=ACTIVE` / `status=INACTIVE`
  // and also tolerate old urls like `status=ACTIVE,INACTIVE` by taking the first valid one
  const statusDirect = statusOrUndef(sp.get("status"));
  const statusFromCsv = splitCsv(sp.get("status"))
    .map((x) =>
      x === "ACTIVE" || x === "INACTIVE" ? (x as EmployeeStatus) : null,
    )
    .find((x): x is EmployeeStatus => Boolean(x));
  const status = statusDirect ?? statusFromCsv;

  const departmentIds = splitCsv(sp.get("departmentIds"));
  const managerId = strOrUndef(sp.get("managerId"));

  const filters: EmployeesListFilters = {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(email ? { email } : {}),
    ...(status ? { status } : {}),
    ...(departmentIds.length ? { departmentIds } : {}),
    ...(managerId ? { managerId } : {}),
  };

  // no active filters
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

// set or remove a csv filter param and reset paging
export function withFilterCsv(
  sp: URLSearchParams,
  key: string,
  values: string[],
) {
  const next = new URLSearchParams(sp);

  if (!values.length) next.delete(key);
  else next.set(key, values.join(","));

  // anytime filters change, reset paging
  next.set("page", "1");

  return next;
}
