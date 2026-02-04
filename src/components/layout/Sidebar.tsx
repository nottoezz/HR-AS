import NavLink from "./NavLink";

const allItems = [
  { href: "/profile", label: "Profile", employeesOnly: true },
  { href: "/employees", label: "Employees", employeesOnly: false },
  { href: "/departments", label: "Departments", employeesOnly: false },
];

export default function Sidebar({
  userRole = null,
}: {
  userRole?: string | null;
}) {
  const isHRAdmin = userRole === "HRADMIN";
  const items = allItems.filter(
    (item) => !item.employeesOnly || !isHRAdmin
  );

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 md:flex md:flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[var(--shadow-2)]">
      <div className="flex h-full flex-col p-6">
        {/* brand */}
        <div className="mb-6">
          <div className="text-2xl font-extrabold tracking-tight">
            HR Admin
          </div>
        </div>

        {/* nav */}
        <nav className="space-y-1">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
