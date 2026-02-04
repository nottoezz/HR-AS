"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

function titleFromPath(pathname: string) {
  if (pathname.startsWith("/employees")) return "Employees";
  if (pathname.startsWith("/departments")) return "Departments";
  if (pathname.startsWith("/profile")) return "Profile";
  return "Dashboard";
}

export default function Topbar() {
  const pathname = usePathname();
  const title = titleFromPath(pathname);

  return (
    <header className="fixed top-0 z-20 h-16 w-full border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[var(--shadow-1)]">
      <div className="flex h-full w-full items-center justify-between px-4 md:pl-[18rem] md:pr-8">
        {/* left */}
        <div className="text-sm font-semibold tracking-tight">{title}</div>

        {/* right */}
        <button
          className="ui-btn ui-btn-primary w-auto px-4 py-2 bg-red-500"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
