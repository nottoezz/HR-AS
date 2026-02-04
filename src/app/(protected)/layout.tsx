import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import AppShell from "@/components/layout/AppShell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const role = session.user?.role ?? null;
  return <AppShell userRole={role}>{children}</AppShell>;
}
