import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "bcryptjs";

const createPrismaClient = () => {
  const databaseURL = process.env.DATABASE_URL;
  if (!databaseURL) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaBetterSqlite3({
    url: databaseURL.replace("file:", ""),
  });

  return new PrismaClient({ adapter });
};

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD ?? "Password1234#";

async function ensureUser(
  prisma: PrismaClient,
  email: string,
  role: "HRADMIN" | "MANAGER" | "EMPLOYEE",
  employeeId: string | null,
) {
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);

  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, role, employeeId },
    create: { email, passwordHash, role, employeeId },
    select: { id: true, email: true, role: true, employeeId: true },
  });
}

async function main() {
  const prisma = createPrismaClient();

  try {
    console.log("Creating dev fixtures...");

    // 1) Departments
    const deptA = await prisma.department.upsert({
      where: { name: "Engineering" },
      update: {},
      create: { name: "Engineering", status: "ACTIVE" },
      select: { id: true, name: true },
    });

    const deptB = await prisma.department.upsert({
      where: { name: "Operations" },
      update: {},
      create: { name: "Operations", status: "ACTIVE" },
      select: { id: true, name: true },
    });

    // 2) Manager employee + user
    const managerEmail = "manager@test.com";
    let managerUser = await prisma.user.findUnique({
      where: { email: managerEmail },
    });

    // ensure employee exists for manager
    const managerEmployee = managerUser?.employeeId
      ? await prisma.employee.findUnique({
          where: { id: managerUser.employeeId },
          select: { id: true, email: true },
        })
      : null;

    const manager =
      managerEmployee ??
      (await prisma.employee.create({
        data: {
          firstName: "Manny",
          lastName: "Manager",
          telephone: "0100000000",
          email: managerEmail,
          status: "ACTIVE",
          managerId: null,
          // userId linked after user create
        },
        select: { id: true, email: true },
      }));

    // ensure manager user exists + link to employee
    const mgrUser = await ensureUser(
      prisma,
      managerEmail,
      "MANAGER",
      manager.id,
    );

    // backfill employee.userId if missing
    await prisma.employee.update({
      where: { id: manager.id },
      data: { userId: mgrUser.id },
    });

    // set Engineering department managerId to manager employeeId
    await prisma.department.update({
      where: { id: deptA.id },
      data: { managerId: manager.id },
    });

    // 3) A couple employees
    const employeesToCreate = [
      { email: "employee1@test.com", firstName: "Eve", lastName: "Employee" },
      { email: "employee2@test.com", firstName: "Ed", lastName: "Employee" },
    ];

    for (const e of employeesToCreate) {
      // find existing user -> employee if already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: e.email },
      });

      let empId: string;

      if (existingUser?.employeeId) {
        empId = existingUser.employeeId;
      } else {
        const emp = await prisma.employee.create({
          data: {
            firstName: e.firstName,
            lastName: e.lastName,
            telephone: "0200000000",
            email: e.email,
            status: "ACTIVE",
            managerId: manager.id, // reporting manager
          },
          select: { id: true },
        });
        empId = emp.id;
      }

      const user = await ensureUser(prisma, e.email, "EMPLOYEE", empId);

      // link employee.userId (if not linked)
      await prisma.employee.update({
        where: { id: empId },
        data: { userId: user.id },
      });

      // assign departments
      await prisma.employeeDepartment.upsert({
        where: {
          employeeId_departmentId: {
            employeeId: empId,
            departmentId: deptA.id,
          },
        },
        update: {},
        create: { employeeId: empId, departmentId: deptA.id },
      });

      // optionally also place employee2 in Operations
      if (e.email === "employee2@test.com") {
        await prisma.employeeDepartment.upsert({
          where: {
            employeeId_departmentId: {
              employeeId: empId,
              departmentId: deptB.id,
            },
          },
          update: {},
          create: { employeeId: empId, departmentId: deptB.id },
        });
      }
    }

    console.log("✅ Dev fixtures created:");
    console.log("- Departments:", deptA, deptB);
    console.log("- Manager:", managerEmail);
    console.log(
      "- Employees:",
      employeesToCreate.map((x) => x.email),
    );
    console.log(
      `- Default password (from DEFAULT_PASSWORD): ${DEFAULT_PASSWORD}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌ Fixture creation failed:", e);
  process.exit(1);
});
