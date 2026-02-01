import { notFound } from "next/navigation";
import DepartmentFormClient from "../DepartmentFormClient";

// page for editing an employee
export default async function EditDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    notFound();
  }

  // render the edit employee form
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Edit employee</h1>
        <p className="text-muted-foreground text-sm">Update employee details</p>
      </div>

      <DepartmentFormClient mode="edit" id={id} />
    </div>
  );
}
