/*
 * Seed script for the HR Admin System
 * ---------------------------------------------------------
 * - Create an initial HR Administrator account
 * -> username: hradming@test.com
 * -> password: TestPass1234
 *
 * - Batch create employees (not apart of spec)
 */

// Imports
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "bcryptjs";

// Prisma Client
// ------------------------------------------------------
const createPrismaClient = () => {
  const databaseURL = process.env.DATABASE_URL;

  if (!databaseURL) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaBetterSqlite3({
    url: databaseURL.replace("file:", ""),
  });

  return new PrismaClient({
    adapter,
  });
};

// Main seed function
// ------------------------------------------------------

/*
set dedicated HRADMIN accn
Admins are not employees
*/
