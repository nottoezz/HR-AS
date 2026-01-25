import "dotenv/config";
import { db } from "@/server/db";
import { appRouter } from "@/server/api/root";

type Role = "HRADMIN" | "MANAGER" | "EMPLOYEE";

function callerFor(role: Role, employeeId: string | null) {
  // minimal ctx shape used by your routers
  const ctx = {
    db,
    session: {
      user: {
        id: `${role.toLowerCase()}-user-id`,
        role,
        employeeId,
      },
    },
  } as any;

  return appRouter.createCaller(ctx);
}

// minimal helpers
async function expectCodes<T>(
  label: string,
  p: Promise<T>,
  allowed: Array<string>,
) {
  try {
    await p;
    throw new Error(`Expected ${allowed.join(" or ")} but passed: ${label}`);
  } catch (e: any) {
    const code = e?.code ?? e?.data?.code;
    if (!allowed.includes(code)) {
      console.log("⚠️ unexpected error:", code, "-", e?.message ?? e);
      throw e;
    }
    console.log(`✅ blocked (${code}):`, label);
  }
}

async function expectPass<T>(label: string, p: Promise<T>) {
  await p;
  console.log(`✅ pass: ${label}`);
}

async function main() {
  // ---- PREP: pick some real IDs from your DB ----
  const allEmployees = await db.employee.findMany({
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const allDepts = await db.department.findMany({
    select: { id: true, name: true, managerId: true },
    orderBy: { name: "asc" },
  });

  console.log("Employees:", allEmployees);
  console.log("Departments:", allDepts);

  // choose an employee to act as EMPLOYEE
  const employeeSelf = allEmployees[0];
  if (!employeeSelf) {
    throw new Error(
      "No employees found. Run your dev fixtures script (npm run db:fixtures) before smoke tests.",
    );
  }

  const otherEmployee = allEmployees[1];

  // choose a manager employeeId:
  const managerEmployeeId =
    allDepts.find((d) => d.managerId)?.managerId ?? employeeSelf.id;

  const hr = callerFor("HRADMIN", null);
  const mgr = callerFor("MANAGER", managerEmployeeId);
  const emp = callerFor("EMPLOYEE", employeeSelf.id);

  // find a real out-of-scope employee for manager (preferred)
  // (employee exists but is not in any department managed by managerEmployeeId)
  const outOfScope = await db.employee.findFirst({
    where: {
      departments: {
        none: { department: { managerId: managerEmployeeId } },
      },
      NOT: { id: managerEmployeeId },
    },
    select: { id: true },
  });

  // -------------------------------
  // HRADMIN: can list everything
  // -------------------------------
  console.log("\n[HRADMIN] employees.list");
  await expectPass("hr employees.list", hr.employees.list());

  console.log("\n[HRADMIN] departments.list");
  await expectPass("hr departments.list", hr.departments.list());

  // -------------------------------
  // EMPLOYEE: self-only view/edit (restricted fields blocked)
  // -------------------------------
  console.log("\n[EMPLOYEE] employees.getById(self) should PASS");
  await expectPass(
    "employee get self",
    emp.employees.getById({ id: employeeSelf.id }),
  );

  console.log("\n[EMPLOYEE] employees.getById(other) should FAIL");
  if (otherEmployee) {
    await expectCodes(
      "employee get other",
      emp.employees.getById({ id: otherEmployee.id }),
      ["FORBIDDEN"],
    );
  } else {
    console.log("⚠️ skipped: need at least 2 employees to test self-only get");
  }

  console.log(
    "\n[EMPLOYEE] employees.update(self, allowed fields) should PASS",
  );
  await expectPass(
    "employee update self allowed field",
    emp.employees.update({ id: employeeSelf.id, telephone: "0000000000" }),
  );

  console.log("\n[EMPLOYEE] employees.update(self, status) should FAIL");
  await expectCodes(
    "employee update status",
    emp.employees.update({ id: employeeSelf.id, status: "INACTIVE" as any }),
    ["FORBIDDEN"],
  );

  console.log("\n[EMPLOYEE] employees.update(self, managerId) should FAIL");
  await expectCodes(
    "employee update managerId",
    emp.employees.update({
      id: employeeSelf.id,
      managerId: managerEmployeeId,
    }),
    ["FORBIDDEN"],
  );

  console.log("\n[EMPLOYEE] employees.update(self, departmentIds) should FAIL");
  await expectCodes(
    "employee update departmentIds",
    emp.employees.update({
      id: employeeSelf.id,
      departmentIds: allDepts[0] ? [allDepts[0].id] : [],
    }),
    ["FORBIDDEN"],
  );

  // -------------------------------
  // MANAGER: can read scoped employees, cannot edit employees
  // -------------------------------
  console.log("\n[MANAGER] employees.list should PASS (scoped)");
  await expectPass("manager employees.list", mgr.employees.list());

  // manager cannot update employees (spec)
  console.log("\n[MANAGER] employees.update(other) should FAIL");
  const managerOtherTarget =
    allEmployees.find((e) => e.id !== managerEmployeeId)?.id ?? null;

  if (!managerOtherTarget) {
    console.log(
      "⚠️ skipped: need at least 2 employees to test manager update other",
    );
  } else {
    await expectCodes(
      "manager update other employee",
      mgr.employees.update({ id: managerOtherTarget, telephone: "1111111111" }),
      ["FORBIDDEN"],
    );
  }

  // manager cannot deactivate employees (spec)
  console.log("\n[MANAGER] employees.deactivate should FAIL");
  await expectCodes(
    "manager deactivate employee",
    mgr.employees.deactivate({ id: employeeSelf.id }),
    ["FORBIDDEN"],
  );

  // manager cannot access out-of-scope employee (strict RBAC check)
  console.log(
    "\n[MANAGER] employees.getById(out of scope) should FAIL (FORBIDDEN)",
  );
  if (outOfScope) {
    await expectCodes(
      "manager get out-of-scope employee",
      mgr.employees.getById({ id: outOfScope.id }),
      ["FORBIDDEN"],
    );
  } else {
    console.log(
      "⚠️ skipped: no out-of-scope employee found. Ensure fixtures create at least one employee outside the manager’s managed departments.",
    );
  }

  // -------------------------------
  // HRADMIN: employee create/update/deactivate
  // -------------------------------
  console.log("\n[HRADMIN] employees.create should PASS");
  const createdEmployee = await hr.employees.create({
    firstName: "Smoke",
    lastName: "Employee",
    telephone: "0123456789",
    email: `smoke+${Date.now()}@test.com`,
    status: "ACTIVE" as any,
    managerId: managerEmployeeId,
    departmentIds: allDepts[0] ? [allDepts[0].id] : undefined,
  });

  const createdEmployeeId = createdEmployee.employee?.id;
  if (!createdEmployeeId) {
    throw new Error(
      "employees.create did not return { employee: { id } }. Update smoke test to match your return shape.",
    );
  }
  console.log("✅ created employee:", createdEmployeeId);

  console.log(
    "\n[HRADMIN] employees.update (status/manager/departmentIds) should PASS",
  );
  await expectPass(
    "hr update employee admin fields",
    hr.employees.update({
      id: createdEmployeeId,
      status: "INACTIVE" as any,
      managerId: null,
      departmentIds: [],
    }),
  );

  console.log("\n[HRADMIN] employees.deactivate should PASS");
  await expectPass(
    "hr deactivate employee",
    hr.employees.deactivate({ id: createdEmployeeId }),
  );

  // -------------------------------
  // Departments: HRADMIN-only mutations + non-admin blocked
  // -------------------------------
  console.log("\n[HRADMIN] departments.create should PASS");
  const createdDept = await hr.departments.create({
    name: `Dept Smoke ${Date.now()}`,
    status: "ACTIVE" as any,
  });

  console.log("\n[MANAGER] departments.create should FAIL");
  await expectCodes(
    "manager create department",
    mgr.departments.create({ name: "Should Fail", status: "ACTIVE" as any }),
    ["FORBIDDEN"],
  );

  console.log("\n[EMPLOYEE] departments.create should FAIL");
  await expectCodes(
    "employee create department",
    emp.departments.create({ name: "Should Fail", status: "ACTIVE" as any }),
    ["FORBIDDEN"],
  );

  console.log("\n[HRADMIN] departments.update(status INACTIVE) should PASS");
  await expectPass(
    "hr update department status",
    hr.departments.update({ id: createdDept.id, status: "INACTIVE" as any }),
  );

  if (typeof (hr.departments as any).deactivate === "function") {
    console.log("\n[HRADMIN] departments.deactivate should PASS");
    await expectPass(
      "hr deactivate department",
      (hr.departments as any).deactivate({ id: createdDept.id }),
    );
  } else {
    console.log(
      "⚠️ skipped: departments.deactivate not found on router (add it if spec requires it).",
    );
  }

  // -------------------------------
  // Minimal validation check (Zod)
  // -------------------------------
  console.log("\n[VALIDATION] departments.create empty name should FAIL");
  await expectCodes(
    "department create empty name",
    hr.departments.create({ name: "", status: "ACTIVE" as any }),
    ["BAD_REQUEST"],
  );

  console.log("\n✅ Smoke tests complete");
}

main()
  .catch((e) => {
    console.error("❌ Smoke test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
