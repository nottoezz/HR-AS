/*
 * Employees Router
 * ------------------------------------------------------
 *
 * Goal
 * - define api shape procedures inputs outputs
 * - keep rbac logic in one place hradmin manager employee
 * - add prisma queries after structure is clear
 */

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

/*
 * Setup
 * - import zod trpc helpers prisma client
 */

/*
 * Schemas
 * - status enum
 * - list input filters sort paging
 * - create input
 * - update input
 * - id input
 */

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
