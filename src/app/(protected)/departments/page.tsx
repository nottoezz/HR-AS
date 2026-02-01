import { Suspense } from "react";
import DepartmentsClient from "./DepartmentsClient";
import DepartmentsHeaderActions from "./DepartmentsHeaderActions";
import { DepartmentsSelectionProvider } from "./DepartmentsSelectionContext";

// fallback component for departments page
function DepartmentsFallback() {
  return (
    <div className="bg-background rounded-lg border p-6">
      <p className="text-muted-foreground text-sm">Loading departments…</p>
    </div>
  )
}

// departments page component
export default function DepartmentsPage() {
  return (
    <DepartmentsSelectionProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Departments</h1>
          <DepartmentsHeaderActions />
        </div>

        <Suspense fallback={<DepartmentsFallback />}>
          <DepartmentsClient />
        </Suspense>
      </div>
    </DepartmentsSelectionProvider>
  );
}
