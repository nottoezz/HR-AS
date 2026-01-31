"use client";

/**
 * header actions for the employees page
 * edit uses the currently selected row id
 * create always goes to the new employee route
 * actions are only visible to HRADMIN users
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useEmployeesSelection } from "./EmployeesSelectionContext";
import { api } from "@/trpc/react";

// tiny class join helper
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function EmployeesHeaderActions() {
  // next router for programmatic nav
  const router = useRouter();

  // selection comes from the table context
  const { selectedId } = useEmployeesSelection();

  // fetch current user (cached, cheap)
  const meQ = api.employees.me.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // only hr admins can see actions
  const isHRAdmin = meQ.data?.role === "HRADMIN";

  // edit only makes sense when something is selected
  const canEdit = Boolean(selectedId);

  // jump to the edit page for the selected employee
  const onEdit = React.useCallback(() => {
    if (!selectedId) return;
    router.push(`/employees/${selectedId}`);
  }, [router, selectedId]);

  // hide everything until we know the role
  if (meQ.isLoading || !isHRAdmin) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        disabled={!canEdit}
        className={cx(
          "hover:bg-muted/40 inline-flex h-9 items-center rounded-md border px-3 text-sm",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        title={
          !canEdit ? "select an employee to edit" : "edit selected employee"
        }
        aria-disabled={!canEdit}
      >
        Edit employee
      </button>

      <Link
        href="/employees/new"
        className="hover:bg-muted/40 inline-flex h-9 items-center rounded-md border px-3 text-sm"
      >
        Create employee
      </Link>
    </div>
  );
}
