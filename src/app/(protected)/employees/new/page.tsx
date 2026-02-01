import EmployeeFormClient from "../EmployeeFormClient"

// page for creating a new employee
export default function NewEmployeePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Create employee</h1>
        <p className="text-muted-foreground text-sm">
          Add a new employee and create a login user
        </p>
      </div>

      <EmployeeFormClient mode="create" />
    </div>
  )
}
