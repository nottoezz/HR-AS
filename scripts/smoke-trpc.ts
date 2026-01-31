import "dotenv/config";
import { db } from "@/server/db";
import { appRouter } from "@/server/api/root";

type Role = "HRADMIN" | "MANAGER" | "EMPLOYEE";

function callerFor(role: Role, employeeId: string | null) {
  // minimal ctx shape used by your routers
  // best practice: keep the shape aligned with createTRPCContext expectations
  const ctx = {
    db,
    session: {
      user: {
        id: `smoke-${role.toLowerCase()}-user-id`,
        role,
        employeeId,
      },
    },
  } as any;

  return appRouter.createCaller(ctx);
}

async function expectBlocked<T>(
  label: string,
  p: Promise<T>,
  allowedCodes: Array<string>,
) {
  try {
    await p;
    throw new Error(
      `expected ${allowedCodes.join(" or ")} but passed: ${label}`,
    );
  } catch (e: any) {
    const code = e?.code ?? e?.data?.code;
    if (!allowedCodes.includes(code)) {
      console.log("unexpected error:", code, "-", e?.message ?? e);
      throw e;
    }
    console.log(`blocked (${code}): ${label}`);
  }
}

async function expectPass<T>(label: string, p: Promise<T>) {
  await p;
  console.log(`pass: ${label}`);
}

async function main() {
  // load base data
  const allEmployees = await db.employee.findMany({
    select: { id: true, email: true, managerId: true },
    orderBy: { createdAt: "asc" },
  });

  const allDepts = await db.department.findMany({
    select: { id: true, name: true, managerId: true, status: true },
    orderBy: { name: "asc" },
  });

  if (!allEmployees.length) {
    throw new Error(
      "no employees found. run your fixtures script before smoke tests.",
    );
  }

  // pick a manager employee id from department managerId if available
  const managerEmployeeId =
    allDepts.find((d) => d.managerId)?.managerId ?? allEmployees[0]!.id;

  // pick an employee that is not the manager
  const employeeSelf =
    allEmployees.find((e) => e.id !== managerEmployeeId) ?? allEmployees[0]!;

  const otherEmployee =
    allEmployees.find((e) => e.id !== employeeSelf.id) ?? null;

  // find an out-of-scope employee for manager:
  // employee exists but is not in any department managed by managerEmployeeId, and is not manager self
  const outOfScope = await db.employee.findFirst({
    where: {
      departments: { none: { department: { managerId: managerEmployeeId } } },
      NOT: { id: managerEmployeeId },
    },
    select: { id: true, email: true },
  });

  console.log("smoke inputs:");
  console.log(
    "- employees:",
    allEmployees.map((e) => `${e.email} (${e.id})`),
  );
  console.log(
    "- departments:",
    allDepts.map(
      (d) => `${d.name} (${d.id}) managerId=${d.managerId ?? "null"}`,
    ),
  );
  console.log("- manager employeeId:", managerEmployeeId);
  console.log("- employee self:", employeeSelf.email, employeeSelf.id);
  console.log(
    "- out of scope:",
    outOfScope ? `${outOfScope.email} (${outOfScope.id})` : "none",
  );

  const hr = callerFor("HRADMIN", null);
  const mgr = callerFor("MANAGER", managerEmployeeId);
  const emp = callerFor("EMPLOYEE", employeeSelf.id);

  // hradmin
  console.log("\n[hradmin] employees.list");
  await expectPass("hr employees.list", hr.employees.list());

  console.log("\n[hradmin] departments.list");
  await expectPass("hr departments.list", hr.departments.list());

  // employee self-only
  console.log(
    "\n[employee] employees.list should return only self (or scoped)",
  );
  const employeeList = await emp.employees.list();
  await expectPass("employee employees.list", Promise.resolve(employeeList));
  if (!employeeList.some((e: any) => e.id === employeeSelf.id)) {
    throw new Error(
      "employee list did not include self; check session employeeId mapping",
    );
  }

  console.log("\n[employee] employees.getById(self) should pass");
  await expectPass(
    "employee get self",
    emp.employees.getById({ id: employeeSelf.id }),
  );

  if (otherEmployee) {
    console.log("\n[employee] employees.getById(other) should be forbidden");
    await expectBlocked(
      "employee get other",
      emp.employees.getById({ id: otherEmployee.id }),
      ["FORBIDDEN"],
    );
  }

  console.log("\n[employee] employees.update(self, allowed field) should pass");
  await expectPass(
    "employee update self telephone",
    emp.employees.update({ id: employeeSelf.id, telephone: "0000000000" }),
  );

  console.log(
    "\n[employee] employees.update(self, status) should be forbidden",
  );
  await expectBlocked(
    "employee update status",
    emp.employees.update({ id: employeeSelf.id, status: "INACTIVE" as any }),
    ["FORBIDDEN"],
  );

  // manager scoped read-only
  console.log("\n[manager] employees.list should pass (scoped)");
  await expectPass("manager employees.list", mgr.employees.list());

  console.log("\n[manager] employees.update should be forbidden (spec)");
  const managerOtherTarget =
    allEmployees.find((e) => e.id !== managerEmployeeId)?.id ?? null;

  if (managerOtherTarget) {
    await expectBlocked(
      "manager update other employee",
      mgr.employees.update({ id: managerOtherTarget, telephone: "1111111111" }),
      ["FORBIDDEN"],
    );
  }

  console.log("\n[manager] employees.deactivate should be forbidden (spec)");
  await expectBlocked(
    "manager deactivate employee",
    mgr.employees.deactivate({ id: employeeSelf.id }),
    ["FORBIDDEN"],
  );

  if (outOfScope) {
    console.log(
      "\n[manager] employees.getById(out-of-scope) should be forbidden",
    );
    await expectBlocked(
      "manager get out-of-scope employee",
      mgr.employees.getById({ id: outOfScope.id }),
      ["FORBIDDEN"],
    );
  } else {
    console.log(
      "\n[manager] out-of-scope check skipped: no out-of-scope employee found",
    );
    console.log(
      "hint: ensure fixtures create an operations-only employee not in manager managed departments",
    );
  }

  // hradmin create/update/deactivate
  console.log("\n[hradmin] employees.create should pass");
  const created = await hr.employees.create({
    firstName: "Smoke",
    lastName: "Employee",
    telephone: "0123456789",
    email: `smoke+${Date.now()}@test.com`,
    status: "ACTIVE" as any,
    managerId: managerEmployeeId,
    departmentIds: allDepts[0] ? [allDepts[0].id] : undefined,
  });

  const createdEmployeeId = created.employee?.id;
  if (!createdEmployeeId) {
    throw new Error(
      "employees.create did not return { employee: { id } }. update smoke test to match router return shape.",
    );
  }

  console.log("\n[hradmin] employees.update admin fields should pass");
  await expectPass(
    "hr update employee admin fields",
    hr.employees.update({
      id: createdEmployeeId,
      status: "INACTIVE" as any,
      managerId: null,
      departmentIds: [],
    }),
  );

  console.log("\n[hradmin] employees.deactivate should pass");
  await expectPass(
    "hr deactivate employee",
    hr.employees.deactivate({ id: createdEmployeeId }),
  );

  console.log("\nsmoke tests complete");
}

main()
  .catch((e) => {
    console.error("smoke test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
