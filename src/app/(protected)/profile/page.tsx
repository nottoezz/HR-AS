import { redirect } from "next/navigation";
import EmployeeFormClient from "../employees/EmployeeFormClient";
import { api } from "@/trpc/server";

export default async function ProfilePage() {
  const me = await api.employees.me();

  // if a user somehow has no linked employee record, send them away
  if (!me.employeeId) redirect("/employees");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Update your personal details.
        </p>
      </div>

      <EmployeeFormClient mode="edit" id={me.employeeId} />
    </div>
  );
}
