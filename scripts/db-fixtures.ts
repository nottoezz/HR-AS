import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "bcryptjs";

type Role = "HRADMIN" | "MANAGER" | "EMPLOYEE";
type Status = "ACTIVE" | "INACTIVE";

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD ?? "Password1234#";

function createPrismaClient() {
  const databaseURL = process.env.DATABASE_URL;
  if (!databaseURL) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaBetterSqlite3({
    url: databaseURL.replace("file:", ""),
  });

  return new PrismaClient({ adapter });
}

async function ensureDepartment(prisma: PrismaClient, name: string) {
  return prisma.department.upsert({
    where: { name },
    update: {},
    create: { name, status: "ACTIVE" },
    select: { id: true, name: true, managerId: true },
  });
}

async function ensureEmployeeByEmail(
  prisma: PrismaClient,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    telephone: string;
    status?: Status;
    managerId?: string | null;
  },
) {
  const existing = await prisma.employee.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, userId: true },
  });

  if (existing) return existing;

  return prisma.employee.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      telephone: input.telephone,
      email: input.email,
      status: input.status ?? "ACTIVE",
      managerId: input.managerId ?? null,
    },
    select: { id: true, email: true, userId: true },
  });
}

async function ensureUserByEmail(
  prisma: PrismaClient,
  input: {
    email: string;
    role: Role;
    employeeId: string | null;
    updatePassword?: boolean;
  },
) {
  // best practice: avoid rotating passwords on every fixtures run unless you explicitly want it
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, role: true, employeeId: true },
  });

  if (!existing) {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        employeeId: input.employeeId,
      },
      select: { id: true, email: true, role: true, employeeId: true },
    });
  }

  return prisma.user.update({
    where: { email: input.email },
    data: {
      role: input.role,
      employeeId: input.employeeId,
      ...(input.updatePassword ? { passwordHash } : {}),
    },
    select: { id: true, email: true, role: true, employeeId: true },
  });
}

async function ensureEmployeeUserLink(
  prisma: PrismaClient,
  employeeId: string,
  userId: string,
) {
  // ensure employee.userId is set
  await prisma.employee.update({
    where: { id: employeeId },
    data: { userId },
  });

  // ensure user.employeeId is set (if user exists)
  await prisma.user.update({
    where: { id: userId },
    data: { employeeId },
  });
}

async function ensureMembership(
  prisma: PrismaClient,
  employeeId: string,
  departmentId: string,
) {
  await prisma.employeeDepartment.upsert({
    where: { employeeId_departmentId: { employeeId, departmentId } },
    update: {},
    create: { employeeId, departmentId },
  });
}

async function ensureEmployeeForExistingUserEmployeeId(
  prisma: PrismaClient,
  userEmail: string,
) {
  // if a user already exists with employeeId, validate the employee still exists
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true, employeeId: true },
  });

  if (!user?.employeeId) return null;

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { id: true, email: true, userId: true },
  });

  // if employee was deleted but user still has employeeId, treat as broken and return null
  return employee ?? null;
}

async function main() {
  const prisma = createPrismaClient();

  try {
    console.log("creating dev fixtures...");

    // departments
    const engineering = await ensureDepartment(prisma, "Engineering");
    const operations = await ensureDepartment(prisma, "Operations");

    // hr admin (user only; may not have an employee record)
    const hrAdminEmail = "hradmin@test.com";
    await ensureUserByEmail(prisma, {
      email: hrAdminEmail,
      role: "HRADMIN",
      employeeId: null,
      updatePassword: false,
    });

    // manager: ensure employee + user are linked
    const managerEmail = "manager@test.com";

    // if an existing manager user points to an employee, validate it; otherwise create a new employee
    const existingManagerEmployee =
      await ensureEmployeeForExistingUserEmployeeId(prisma, managerEmail);

    const managerEmployee =
      existingManagerEmployee ??
      (await ensureEmployeeByEmail(prisma, {
        email: managerEmail,
        firstName: "Manny",
        lastName: "Manager",
        telephone: "0100000000",
        status: "ACTIVE",
        managerId: null,
      }));

    const managerUser = await ensureUserByEmail(prisma, {
      email: managerEmail,
      role: "MANAGER",
      employeeId: managerEmployee.id,
      updatePassword: false,
    });

    await ensureEmployeeUserLink(prisma, managerEmployee.id, managerUser.id);

    // assign engineering manager
    await prisma.department.update({
      where: { id: engineering.id },
      data: { managerId: managerEmployee.id },
    });

    // employees: 2 in engineering (managed), 1 in operations only (out of scope for manager), 1 in both
    const employees = [
      {
        email: "employee1@test.com",
        firstName: "Eve",
        lastName: "Employee",
        telephone: "0200000000",
        managerId: managerEmployee.id,
        departments: [engineering.id],
      },
      {
        email: "employee2@test.com",
        firstName: "Ed",
        lastName: "Employee",
        telephone: "0200000001",
        managerId: managerEmployee.id,
        departments: [engineering.id, operations.id],
      },
      {
        // out-of-scope employee for engineering manager
        email: "employee3@test.com",
        firstName: "Olly",
        lastName: "Ops",
        telephone: "0200000002",
        managerId: null,
        departments: [operations.id],
      },
    ] as const;

    for (const e of employees) {
      const existingUser = await prisma.user.findUnique({
        where: { email: e.email },
        select: { id: true, employeeId: true },
      });

      let employeeId: string;

      if (existingUser?.employeeId) {
        // validate existing employeeId still exists; otherwise recreate the employee record
        const existingEmp = await prisma.employee.findUnique({
          where: { id: existingUser.employeeId },
          select: { id: true },
        });

        if (existingEmp) {
          employeeId = existingUser.employeeId;
        } else {
          const created = await ensureEmployeeByEmail(prisma, {
            email: e.email,
            firstName: e.firstName,
            lastName: e.lastName,
            telephone: e.telephone,
            status: "ACTIVE",
            managerId: e.managerId ?? null,
          });
          employeeId = created.id;
        }
      } else {
        const created = await ensureEmployeeByEmail(prisma, {
          email: e.email,
          firstName: e.firstName,
          lastName: e.lastName,
          telephone: e.telephone,
          status: "ACTIVE",
          managerId: e.managerId ?? null,
        });
        employeeId = created.id;
      }

      const user = await ensureUserByEmail(prisma, {
        email: e.email,
        role: "EMPLOYEE",
        employeeId,
        updatePassword: false,
      });

      await ensureEmployeeUserLink(prisma, employeeId, user.id);

      for (const deptId of e.departments) {
        await ensureMembership(prisma, employeeId, deptId);
      }
    }

    console.log("fixtures summary:");
    console.log(`- hr admin: ${hrAdminEmail}`);
    console.log(
      `- manager:  ${managerEmail} (employeeId: ${managerEmployee.id})`,
    );
    console.log(`- departments: ${engineering.name}, ${operations.name}`);
    console.log("- employees:");
    for (const e of employees) console.log(`  - ${e.email}`);
    console.log(`- default password: ${DEFAULT_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("fixture creation failed:", e);
  process.exit(1);
});
