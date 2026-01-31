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
        "block rounded-md px-3 py-2 text-sm",
        active ? "bg-muted font-medium" : "hover:bg-muted/50",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
