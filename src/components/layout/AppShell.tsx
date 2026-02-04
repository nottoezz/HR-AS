import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({
  children,
  userRole = null,
}: {
  children: React.ReactNode;
  userRole?: string | null;
}) {
  return (
    <div className="ui-page text-[rgb(var(--text))]">
      {/* fixed chrome */}
      <Sidebar userRole={userRole} />
      <Topbar />

      {/* content */}
      <main className="min-h-screen px-4 pb-10 pt-10 md:pl-[18rem] md:pr-8">
        <div className="ui-fade-in w-full">{children}</div>
      </main>
    </div>
  );
}
