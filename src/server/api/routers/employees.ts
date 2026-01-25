/*
 * Employees Router
 * ------------------------------------------------------
 *
 * Goal
 * - define api shape procedures inputs outputs
 * - keep rbac logic in one place hradmin manager employee
 * - add prisma queries after structure is clear
 */

import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { UserRole, type Session } from "../../../../generated/prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

// zod schemas
// ------------------------------------------------------

// shared enums
const employeeStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const sortDirectionSchema = z.enum(["asc", "desc"]);

// list + filter input for employee queries
const listInputSchema = z
  .object({
    // optional filter values
    filters: z
      .object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        status: z.array(employeeStatusSchema).optional(),
        departmentIds: z.array(z.string()).optional(),
        managerId: z.string().optional(),
      })
      .optional(),

    // optional sorting config
    sort: z
      .object({
        field: z.enum([
          "firstName",
          "lastName",
          "email",
          "status",
          "createdAt",
        ]),
        direction: sortDirectionSchema,
      })
      .optional(),
  })
  .optional();

// simple id input
const idInputSchema = z.object({ id: z.string() });

// input for creating a new employee
const createInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  telephone: z.string().min(1),
  email: z.string().email(),
  status: employeeStatusSchema.default("ACTIVE"),
  managerId: z.string().optional(),
  departmentIds: z.array(z.string()).optional(),
});

// input for updating an existing employee
const updateInputSchema = z.object({
  id: z.string(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  telephone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  status: employeeStatusSchema.optional(),
  managerId: z.string().nullable().optional(),
  departmentIds: z.array(z.string()).optional(),
});

// rbac helpers
// ------------------------------------------------------

// minimal session shape used by rbac rules
type SessionUser = { id: string; role: UserRole; employeeId: string | null };

// pull the current user off the session and normalize types
function getSessionUser(ctx: any): SessionUser {
  // note: ctx.session is expected via protectedProcedure
  const user = ctx.session.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

  return {
    id: user.id,
    role: user.role as UserRole,
    employeeId: user.employeeId,
  };
}

// role checks
const isHRAdmin = (role: UserRole) => role === UserRole.HRADMIN;
const isManager = (role: UserRole) => role === UserRole.MANAGER;
const isEmployee = (role: UserRole) => role === UserRole.EMPLOYEE;

// require hradmin
function assertHRAdmin(role: UserRole) {
  if (!isHRAdmin(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

// require the caller to be the same employee
function assertSelfEmployee(sessionUser: SessionUser, employeeId: string) {
  if (!sessionUser.employeeId || sessionUser.employeeId !== employeeId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

// require manager access to a given employee via managed departments
async function assertManagerCanAccessEmployee(
  ctx: any,
  targetEmployeeId: string,
) {
  // caller must be a manager employee record
  const sessionUser = getSessionUser(ctx);
  if (!sessionUser.employeeId) throw new TRPCError({ code: "FORBIDDEN" });

  // fetch target and its departments with managerId
  const target = await ctx.db.employee.findUnique({
    where: { id: targetEmployeeId },
    select: {
      id: true,
      departments: { select: { department: { select: { managerId: true } } } },
    },
  });

  if (!target) throw new TRPCError({ code: "NOT_FOUND" });

  // ok if any target department is managed by the caller
  const ok = target.departments.some(
    (ed: { department: { managerId: string } }) =>
      ed.department.managerId === sessionUser.employeeId,
  );

  if (!ok) throw new TRPCError({ code: "FORBIDDEN" });
}

// access scope builder
// ------------------------------------------------------

/**
 * build base access scope
 * - hradmin: all employees
 * - manager: employees in managed departments + self
 * - employee: self only
 */
async function buildAccessWhere(ctx: any) {
  const sessionUser = getSessionUser(ctx);

  // employee can only see self
  if (isEmployee(sessionUser.role)) {
    if (!sessionUser.employeeId) return { id: "__none__" };
    return { id: sessionUser.employeeId };
  }

  // manager can see self + anyone in departments they manage
  if (isManager(sessionUser.role) && sessionUser.employeeId) {
    // get departments managed by the manager (employeeId)
    const managed = await ctx.db.department.findMany({
      where: { managerId: sessionUser.employeeId },
      select: { id: true },
    });

    const deptIds = managed.map((d: { id: string }) => d.id);

    return {
      OR: [
        // always allow self
        { id: sessionUser.employeeId },
        // allow employees linked to managed departments
        { departments: { some: { departmentId: { in: deptIds } } } },
      ],
    };
  }

  // hradmin (or any other future elevated role) sees all
  return {};
}

// query helpers
// ------------------------------------------------------
function applyFilters(baseWhere: any, filters: any) {
  if (!filters) return baseWhere;

  const and: any[] = [];

  if (filters.firstName)
    and.push({ firstName: { contains: filters.firstName } });

  if (filters.lastName) and.push({ lastName: { contains: filters.lastName } });
  if (filters.email) and.push({ email: { contains: filters.email } });
  if (filters.status?.length) and.push({ status: { in: filters.status } });

  if (filters.departmentIds?.length) {
    and.push({
      departments: { some: { departmentId: { in: filters.departmentIds } } },
    });
  }

  if (filters.managerId) {
    and.push({
      OR: [
        { managerId: filters.managerId },
        {
          departments: {
            some: { department: { managerId: filters.managerId } },
          },
        },
      ],
    });
  }

  if (!and.length) return baseWhere;

  // combine base rbac scope + all filters
  return { AND: [baseWhere, ...and] };
}

// build prisma orderBy from the ui sort object
function buildOrderBy(sort: any) {
  if (sort) return [{ [sort.field]: sort.direction }];
  return [{ lastName: "asc" }, { firstName: "asc" }]; // default stable ordering for table
}

// router
// ------------------------------------------------------
export const employeesRouter = createTRPCRouter({
  // list employees (scoped by rbac + filtered + sorted)
  list: protectedProcedure
    .input(listInputSchema)
    .query(async ({ ctx, input }) => {
      // rbac scope first
      const baseWhere = await buildAccessWhere(ctx);

      // then ui filters + sort
      const where = applyFilters(baseWhere, input?.filters);
      const orderBy = buildOrderBy(input?.sort);

      // fetch list for ui table
      return ctx.db.employee.findMany({
        where,
        orderBy: orderBy as any, // dynamic orderBy keys
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          telephone: true,
          status: true,
          createdAt: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { departments: true, directReports: true } },
        },
      });
    }),
  // getById return one employee include relations
  getById: protectedProcedure
    .input(idInputSchema)
    .query(async ({ ctx, input }) => {
      // current authenticated user
      const sessionUser = getSessionUser(ctx);

      if (isEmployee(sessionUser.role)) {
        // employees can only access self
        assertSelfEmployee(sessionUser, input.id);
      }

      if (
        isManager(sessionUser.role) &&
        sessionUser.employeeId &&
        input.id !== sessionUser.employeeId
      ) {
        // manager scope check via departments
        await assertManagerCanAccessEmployee(ctx, input.id);
      }

      const employee = await ctx.db.employee.findUnique({
        // target employee
        where: { id: input.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          telephone: true,
          status: true,
          createdAt: true,
          manager: {
            // reporting manager
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          // linked auth user
          user: { select: { id: true, email: true, role: true } },
          departments: {
            select: {
              // assigned departments
              department: { select: { id: true, name: true, status: true } },
            },
          },
          directReports: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
            },
            // stable ordering for ui
            orderBy: { lastName: "asc" },
          },
        },
      });

      // invalid id
      if (!employee) throw new TRPCError({ code: "NOT_FOUND" });
      return employee;
    }),

  // current employee (hradmin only)
  create: protectedProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sessionUser = getSessionUser(ctx);
      assertHRAdmin(sessionUser.role);

      // normalize email
      const email = input.email.toLowerCase();

      // ensure email is unique across employee and user
      const [employeeEmail, userEmail] = await Promise.all([
        ctx.db.employee.findUnique({ where: { email } }),
        ctx.db.user.findUnique({ where: { email } }),
      ]);
      if (employeeEmail || userEmail) throw new TRPCError({ code: "CONFLICT" });

      // validate departments id
      if (input.departmentIds?.length) {
        const count = await ctx.db.department.count({
          where: { id: { in: input.departmentIds } },
        });
        if (count !== input.departmentIds.length)
          throw new TRPCError({ code: "BAD_REQUEST" });
      }

      // default pass
      const defaultPassword = process.env.DEFAULT_PASSWORD as string;
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      // create user + employee + links in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        // create login user for the employee
        const user = await tx.user.create({
          data: { email, passwordHash, role: "EMPLOYEE" },
          select: { id: true, email: true, role: true },
        });

        // create employee record
        const employee = await tx.employee.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            telephone: input.telephone,
            email,
            status: input.status,
            managerId: input.managerId ?? null,
            userId: user.id,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        });

        // link user to employee
        await tx.user.update({
          where: { id: user.id },
          data: { employeeId: employee.id },
        });

        // attach department memberships (optional)
        if (input.departmentIds?.length) {
          await tx.employeeDepartment.createMany({
            data: input.departmentIds.map((departmentId) => ({
              employeeId: employee.id,
              departmentId,
            })),
            skipDuplicates: true as never,
          });
        }

        return { user, employee };
      });

      // don't return default password
      return result;
    }),
  // update employee (admin full, non-admin self limited)
  update: protectedProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sessionUser = getSessionUser(ctx);

      // find existing employee and user
      const existing = await ctx.db.employee.findUnique({
        where: { id: input.id },
        select: { id: true, email: true, userId: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin = isHRAdmin(sessionUser.role);

      if (!isAdmin) {
        assertSelfEmployee(sessionUser, input.id);

        // manager can't update status, departments, or manager
        if (input.status !== undefined)
          throw new TRPCError({ code: "FORBIDDEN" });
        if (input.departmentIds !== undefined)
          throw new TRPCError({ code: "FORBIDDEN" });
        if (input.managerId !== undefined)
          throw new TRPCError({ code: "FORBIDDEN" });
      }

      // normalize email
      const nextEmail = input.email?.toLowerCase();

      if (nextEmail && nextEmail !== existing.email) {
        // ensure email is unique across employee and user
        const [employeeEmail, userEmail] = await Promise.all([
          ctx.db.employee.findUnique({ where: { email: nextEmail } }),
          ctx.db.user.findUnique({ where: { email: nextEmail } }),
        ]);
        if (employeeEmail || userEmail)
          throw new TRPCError({ code: "CONFLICT" });
      }

      // validate departments id
      if (isAdmin && input.departmentIds?.length) {
        const count = await ctx.db.department.count({
          where: { id: { in: input.departmentIds } },
        });
        if (count !== input.departmentIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
      }

      // update employee in a transaction
      const updated = await ctx.db.$transaction(async (tx) => {
        // update employee record
        const employee = await tx.employee.update({
          where: { id: input.id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            telephone: input.telephone,
            email: nextEmail,
            status: isAdmin ? input.status : undefined,
            managerId: isAdmin ? input.managerId : undefined,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        });

        // update user email if email changed
        if (nextEmail && existing.userId) {
          await tx.user.update({
            where: { id: existing.userId },
            data: { email: nextEmail },
          });
        }

        // update department memberships (hradmin only)
        if (isAdmin && input.departmentIds !== undefined) {
          await tx.employeeDepartment.deleteMany({
            where: { employeeId: input.id },
          });

          if (input.departmentIds.length) {
            await tx.employeeDepartment.createMany({
              data: input.departmentIds.map((departmentId) => ({
                employeeId: input.id,
                departmentId,
              })),
              skipDuplicates: true as never,
            });
          }
        }

        return employee;
      });

      return updated;
    }),
});
