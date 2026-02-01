"use client";

/**
 * shared selected employee state for the employees page
 * provider holds the selected id
 * hook enforces correct usage inside the provider
 */

import * as React from "react";

type EmployeesSelectionState = {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
};

const EmployeesSelectionContext =
  React.createContext<EmployeesSelectionState | null>(null);

export function EmployeesSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // store the selected row id so other components can react to it
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // memoize to avoid re-render churn in consumers
  const value = React.useMemo(
    () => ({ selectedId, setSelectedId }),
    [selectedId],
  );

  return (
    <EmployeesSelectionContext.Provider value={value}>
      {children}
    </EmployeesSelectionContext.Provider>
  );
}

export function useEmployeesSelection() {
  // read selection from context
  const ctx = React.useContext(EmployeesSelectionContext);

  // fail fast if someone forgets the provider
  if (!ctx) {
    throw new Error(
      "useEmployeesSelection must be used within EmployeesSelectionProvider",
    );
  }

  return ctx;
}
