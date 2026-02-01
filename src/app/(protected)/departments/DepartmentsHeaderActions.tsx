"use client";

/**
 * create and edit buttons for departments list
 * edit requires a selected row id
 * actions are only visible to HRADMIN users
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useDepartmentsSelection } from "./DepartmentsSelectionContext";
import { api } from "@/trpc/react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function DepartmentsHeaderActions() {
  const router = useRouter();
  const { selectedId } = useDepartmentsSelection();

  // fetch current user (cached, cheap)
  // we use employees.me since thats what we added to the router
  const meQ = api.employees.me.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const isHRAdmin = meQ.data?.role === "HRADMIN";

  const canEdit = Boolean(selectedId);

  const onEdit = React.useCallback(() => {
    if (!selectedId) return;
    router.push(`/departments/${selectedId}`);
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
        title={canEdit ? "edit selected department" : "select a department first"}
        aria-disabled={!canEdit}
      >
        Edit department
      </button>

      <Link
        href="/departments/new"
        className="hover:bg-muted/40 inline-flex h-9 items-center rounded-md border px-3 text-sm"
      >
        Create department
      </Link>
    </div>
  );
}
