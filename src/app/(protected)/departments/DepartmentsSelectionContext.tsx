"use client";

/**
 * shared selected department state for the departments page
 * provider holds the selected id
 * hook enforces correct usage inside the provider
 */

import * as React from "react";

type DepartmentsSelectionState = {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
};

const DepartmentsSelectionContext =
  React.createContext<DepartmentsSelectionState | null>(null);

export function DepartmentsSelectionProvider({
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
    <DepartmentsSelectionContext.Provider value={value}>
      {children}
    </DepartmentsSelectionContext.Provider>
  );
}

export function useDepartmentsSelection() {
  // read selection from context
  const ctx = React.useContext(DepartmentsSelectionContext);

  // fail fast if someone forgets the provider
  if (!ctx) {
    throw new Error(
      "useDepartmentsSelection must be used within DepartmentsSelectionProvider",
    );
  }

  return ctx;
}
