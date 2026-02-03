"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        // base
        "block rounded-xl px-3 py-2.5 text-sm font-medium transition",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        "focus-visible:ring-[rgb(var(--ring))] focus-visible:ring-offset-[rgb(var(--background))]",
        // states
        active
          ? "bg-[rgb(var(--surface-2))] text-slate-900"
          : "text-slate-700 hover:bg-[rgb(var(--surface-2))]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
