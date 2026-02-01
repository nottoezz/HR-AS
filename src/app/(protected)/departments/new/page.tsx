import DepartmentFormClient from "../DepartmentFormClient";

export default function NewDepartmentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Create department</h1>
      </div>

      <DepartmentFormClient mode="create" />
    </div>
  );
}
