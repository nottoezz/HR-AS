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
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const departmentsRouter = createTRPCRouter({});

// zod schemas
// ------------------------------------------------------

// rbac helpers
// ------------------------------------------------------

// access scope builder
// ------------------------------------------------------

// query helpers
// ------------------------------------------------------

// router
// ------------------------------------------------------