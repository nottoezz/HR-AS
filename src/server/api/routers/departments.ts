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

// access scope builder
// ------------------------------------------------------

// query helpers
// ------------------------------------------------------

// router
// ------------------------------------------------------
export const departmentsRouter = createTRPCRouter({});
