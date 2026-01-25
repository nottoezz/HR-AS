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
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
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
const main = async () => {
  const prisma = createPrismaClient();

  // Seed HR Admin
  try {
    console.log("Starting seed...");
    const hashedPassword = await hash("TestPass1234", 12);
    const hrAdmin = await prisma.user.upsert({
      where: {
        email: "hradmin@test.com",
      },
      // Update existing HR Admin if they exist
      update: {
        passwordHash: hashedPassword,
        role: "HRADMIN",
        employeeId: null,
      },
      // Create new HR Admin if they don't exist
      create: {
        email: "hradmin@test.com",
        passwordHash: hashedPassword,
        role: "HRADMIN",
        employeeId: null,
      },
    });

    // Log success
    console.log("HR Admin successfully seeded!", {
      id: hrAdmin.id,
      email: hrAdmin.email,
      role: hrAdmin.role,
    });

    // Log error and exit
  } catch (error) {
    console.error("Error seeding HR Admin:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// Batch seed employees (TO-DO)
// ------------------------------------------------------
/*
 * not required for spec
 * used for testing and performance
 */

// Run the seed
// ------------------------------------------------------
main().catch((error) => {
  console.error("Fatal error during seed:", error);
  process.exit(1);
});