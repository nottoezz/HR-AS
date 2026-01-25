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

/*
 * RBAC helpers
 * - getSessionUser id role employeeId
 * - role checks isHRAdmin isManager isEmployee
 * - assertHRAdmin
 * - assertSelf
 * - assertManagerCanAccessEmployee
 * - buildAccessWhere sessionUser
 */

export const employeesRouter = createTRPCRouter({
  // (TODO)
});
/*
 * Procedures
 *
 * list
 * - apply access scope first
 * - apply filters sort paging
 * - return include shape used by ui
 *
 * getById
 * - enforce access rules
 * - return one employee include relations
 *
 * create hradmin only
 * - validate email unique in employee and user
 * - create user with default password
 * - create employee link userId
 * - link user employeeId
 * - attach departments if provided
 *
 * update
 * - hradmin can update all fields
 * - manager employee can update self basic fields only
 * - email change updates linked user email
 * - hradmin can update department assignments
 *
 * deactivate hradmin only
 * - set status inactive
 *
 * getStats optional
 * - same access rules as getById
 * - return derived manager and counts
 */
