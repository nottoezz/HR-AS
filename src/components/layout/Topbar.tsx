"use client";

import { signOut } from "next-auth/react";

export default function Topbar() {
  return (
    <header className="bg-background flex h-14 items-center justify-between border-b px-6">
      <div className="text-muted-foreground text-sm">Dashboard</div>

      <button
        className="rounded-md border px-3 py-1 text-sm"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Logout
      </button>
    </header>
  );
}
