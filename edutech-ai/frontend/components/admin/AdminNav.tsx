"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/usage", label: "Sử dụng AI" },
];

/** Tab chuyển giữa các trang quản trị. */
export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200" aria-label="Quản trị">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
