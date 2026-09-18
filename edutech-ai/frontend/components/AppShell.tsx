"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { apiGet, clearToken, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import Logo from "./Logo";

const UserContext = createContext<User | null>(null);
export function useCurrentUser() {
  return useContext(UserContext);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    apiGet<{ user?: User } & User>("/me")
      .then((data: any) => {
        setUser((data && (data.user || data)) as User);
        setLoading(false);
      })
      .catch(() => {
        // 401 already redirects inside api()
        setLoading(false);
      });
  }, [router]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMenuOpen(false)}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-6">
              <Link href="/projects" aria-label="Về danh sách dự án">
                <Logo />
              </Link>
              <nav className="hidden items-center gap-1 sm:flex">
                {navLink("/projects", "Dự án")}
                {navLink("/cai-dat", "Cài đặt")}
                {user?.role === "admin" && navLink("/admin", "Quản trị")}
              </nav>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              {user && (
                <span className="text-sm text-slate-600">
                  Xin chào,{" "}
                  <span className="font-semibold text-slate-900">
                    {user.name}
                  </span>
                </span>
              )}
              <button onClick={logout} className="btn-secondary !py-2">
                Đăng xuất
              </button>
            </div>
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {menuOpen && (
            <div className="border-t border-slate-200 bg-white px-4 py-3 sm:hidden">
              <div className="flex flex-col gap-1">
                {navLink("/projects", "Dự án")}
                {navLink("/cai-dat", "Cài đặt")}
                {user?.role === "admin" && navLink("/admin", "Quản trị")}
                <button
                  onClick={logout}
                  className="mt-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Đăng xuất{user ? ` (${user.name})` : ""}
                </button>
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {loading ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </UserContext.Provider>
  );
}

export function Spinner({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-indigo-600 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
