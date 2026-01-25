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
// apply filters to the base where clause
function applyFilters(
  baseWhere: Prisma.DepartmentWhereInput,
  filters?: ListFilters,
): Prisma.DepartmentWhereInput {
  if (!filters) return baseWhere;

  const and: Prisma.DepartmentWhereInput[] = [];

  if (filters.name) and.push({ name: { contains: filters.name } });
  if (filters.status?.length)
    and.push({ status: { in: filters.status as DepartmentStatus[] } });
  if (filters.managerId) and.push({ managerId: filters.managerId });

  if (!and.length) return baseWhere;

  return { AND: [baseWhere, ...and] };
}

// build prisma orderBy from the ui sort object
function buildOrderBy(
  sort?: ListSort,
): Prisma.DepartmentOrderByWithRelationInput[] {
  if (sort) {
    return [
      {
        [sort.field]: sort.direction,
      } as Prisma.DepartmentOrderByWithRelationInput,
    ];
  }
  return [{ name: "asc" }];
}

// router
// ------------------------------------------------------
export const departmentsRouter = createTRPCRouter({
  // list departments (scoped by rbac + filtered + sorted)
  list: protectedProcedure
    .input(listInputSchema)
    .query(async ({ ctx, input }) => {
      const baseWhere = await buildAccessWhere(ctx);
      const where = applyFilters(baseWhere, input?.filters);
      const orderBy = buildOrderBy(input?.sort);

      return ctx.db.department.findMany({
        where,
        orderBy,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          manager: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { employees: true } },
        },
      });
    }),

  // getById (scoped by rbac)
  getById: protectedProcedure
    .input(idInputSchema)
    .query(async ({ ctx, input }) => {
      const baseWhere = await buildAccessWhere(ctx);

      // enforce access by requiring the department to also match the scope
      const department = await ctx.db.department.findFirst({
        where: { AND: [baseWhere, { id: input.id }] },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          manager: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          employees: {
            select: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  telephone: true,
                  status: true,
                },
              },
            },
            orderBy: { employee: { lastName: "asc" } },
          },
          _count: { select: { employees: true } },
        },
      });

      if (!department) throw new TRPCError({ code: "NOT_FOUND" });
      return department;
    }),

  // create department (hradmin only)
  create: protectedProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sessionUser = getSessionUser(ctx);
      assertHRAdmin(sessionUser.role);

      const name = input.name.trim();

      // unique name
      const existing = await ctx.db.department.findUnique({ where: { name } });
      if (existing) throw new TRPCError({ code: "CONFLICT" });

      // validate manager if provided
      if (input.managerId) {
        const manager = await ctx.db.employee.findUnique({
          where: { id: input.managerId },
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, role: true } },
          },
        });
        if (!manager) throw new TRPCError({ code: "BAD_REQUEST" });

        // if manager has a user, ensure role is MANAGER
        if (manager.user && manager.user.role !== "MANAGER") {
          await ctx.db.user.update({
            where: { id: manager.user.id },
            data: { role: "MANAGER" },
          });
        }
      }

      return ctx.db.department.create({
        data: {
          name,
          status: input.status,
          managerId: input.managerId ?? null,
        },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    }),

  // update department (hradmin only)
  update: protectedProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sessionUser = getSessionUser(ctx);
      assertHRAdmin(sessionUser.role);

      const existing = await ctx.db.department.findUnique({
        where: { id: input.id },
        select: { id: true, name: true, managerId: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const nextName = input.name?.trim();

      // unique name check if changed
      if (nextName && nextName !== existing.name) {
        const conflict = await ctx.db.department.findUnique({
          where: { name: nextName },
        });
        if (conflict) throw new TRPCError({ code: "CONFLICT" });
      }

      // validate manager if provided (note: null allowed to clear)
      if (input.managerId) {
        const manager = await ctx.db.employee.findUnique({
          where: { id: input.managerId },
          select: { id: true, user: { select: { id: true, role: true } } },
        });
        if (!manager) throw new TRPCError({ code: "BAD_REQUEST" });

        if (manager.user && manager.user.role !== "MANAGER") {
          await ctx.db.user.update({
            where: { id: manager.user.id },
            data: { role: "MANAGER" },
          });
        }
      }

      return ctx.db.department.update({
        where: { id: input.id },
        data: {
          name: nextName,
          status: input.status,
          managerId: input.managerId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { employees: true } },
        },
      });
    }),

  // delete department (hradmin only, must be empty)
  delete: protectedProcedure
    .input(idInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sessionUser = getSessionUser(ctx);
      assertHRAdmin(sessionUser.role);

      const dept = await ctx.db.department.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          _count: { select: { employees: true } },
        },
      });
      if (!dept) throw new TRPCError({ code: "NOT_FOUND" });

      if (dept._count.employees > 0) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      await ctx.db.department.delete({ where: { id: input.id } });

      return {
        success: true,
        message: `Department "${dept.name}" has been deleted`,
        deletedDepartment: { id: dept.id, name: dept.name },
      };
    }),
});
