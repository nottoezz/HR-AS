/*
 * Departments Router
 * ------------------------------------------------------
 *
 * Goal
 * - match employees.ts structure
 * - keep rbac logic in one place
 * - list/get scoped by role
 * - mutations HRADMIN only
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type {
  Prisma,
  UserRole,
  DepartmentStatus,
} from "../../../../generated/prisma";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { createTRPCContext } from "@/server/api/trpc";

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// zod schemas
// ------------------------------------------------------

const departmentStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const sortDirectionSchema = z.enum(["asc", "desc"]);

const listInputSchema = z
  .object({
    filters: z
      .object({
        name: z.string().optional(),
        status: z.array(departmentStatusSchema).optional(),
        managerId: z.string().optional(),
      })
      .optional(),
    sort: z
      .object({
        field: z.enum(["name", "status", "createdAt"]),
        direction: sortDirectionSchema,
      })
      .optional(),
  })
  .optional();

type ListInput = z.infer<typeof listInputSchema>;
type ListFilters = NonNullable<ListInput>["filters"];
type ListSort = NonNullable<ListInput>["sort"];

const idInputSchema = z.object({ id: z.string() });

const createInputSchema = z.object({
  name: z.string().min(1),
  status: departmentStatusSchema.default("ACTIVE"),
  managerId: z.string().optional(),
});

const updateInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  status: departmentStatusSchema.optional(),
  managerId: z.string().nullable().optional(),
});

// rbac helpers
// ------------------------------------------------------
// minimal session shape used by rbac rules
type SessionUser = { id: string; role: UserRole; employeeId: string | null };

// pull the current user off the session and normalize types
function getSessionUser(ctx: Context): SessionUser {
  // note: ctx.session is expected via protectedProcedure
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

  const rawEmployeeId = (user as { employeeId?: unknown }).employeeId;
  const employeeId = typeof rawEmployeeId === "string" ? rawEmployeeId : null;

  return {
    id: user.id,
    role: user.role as UserRole,
    employeeId,
  };
}

// role checks
const isHRAdmin = (role: UserRole) => role === "HRADMIN";
const isManager = (role: UserRole) => role === "MANAGER";
const isEmployee = (role: UserRole) => role === "EMPLOYEE";

// require hradmin
function assertHRAdmin(role: UserRole) {
  if (!isHRAdmin(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

// access scope builder
// ------------------------------------------------------
/**
 * build base access scope
 * - hradmin: all employees
 * - manager: departments where managerId === sessionUser.employeeId
 * - employee: departments linked to their employeeDepartment memberships
 */
async function buildAccessWhere(
  ctx: Context,
): Promise<Prisma.DepartmentWhereInput> {
  const sessionUser = getSessionUser(ctx);

  // hradmin sees all
  if (isHRAdmin(sessionUser.role)) return {};

  // manager: only the depts they manage
  if (isManager(sessionUser.role)) {
    if (!sessionUser.employeeId) return { id: "__none__" };
    return { managerId: sessionUser.employeeId };
  }

  // employee: only depts they belong to
  if (isEmployee(sessionUser.role)) {
    if (!sessionUser.employeeId) return { id: "__none__" };
    return {
      employees: {
        some: { employeeId: sessionUser.employeeId },
      },
    };
  }

  // default deny
  return { id: "__none__" };
}

// query helpers
// ------------------------------------------------------

// router
// ------------------------------------------------------
export const departmentsRouter = createTRPCRouter({});
