import { Suspense } from "react";
import EmployeesClient from "./EmployeesClient";
import EmployeesHeaderActions from "./EmployeesHeaderActions";
import { EmployeesSelectionProvider } from "./EmployeesSelectionContext";

// fallback component for employees page
function EmployeesFallback() {
  return (
    <div className="bg-background rounded-lg border p-6">
      <p className="text-muted-foreground text-sm">Loading employees…</p>
    </div>
  );
}

// employees page component
export default function EmployeesPage() {
  return (
    <EmployeesSelectionProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Employees</h1>
          <EmployeesHeaderActions />
        </div>

        <Suspense fallback={<EmployeesFallback />}>
          <EmployeesClient />
        </Suspense>
      </div>
    </EmployeesSelectionProvider>
  );
}
