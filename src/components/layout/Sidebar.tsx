import NavLink from "./NavLink";

const items = [
  { href: "/profile", label: "Profile" },
  { href: "/employees", label: "Employees" },
  { href: "/departments", label: "Departments" },
];

export default function Sidebar() {
  return (
    <aside className="bg-background w-64 border-r p-4">
      <div className="mb-6 text-lg font-semibold">HR Admin</div>

      <nav className="space-y-1">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
