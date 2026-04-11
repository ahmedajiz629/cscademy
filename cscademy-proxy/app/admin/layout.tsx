"use client";

import { useCallback, useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (isLoading || user === undefined) {
      return;
    }

    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    if (user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router, user]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  if (isLoading || user === undefined || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const nav = [
    { href: "/admin", label: "Overview", exact: true },
    { href: "/admin/notifications", label: "Notifications" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/scores", label: "Scores" },
    { href: "/admin/tracks", label: "Tracks" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <button
        type="button"
        onClick={() => setSidebarOpen((current) => !current)}
        aria-label={sidebarOpen ? "Close admin menu" : "Open admin menu"}
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? "Close menu" : "Open menu"}
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-[#111127]/95 text-white shadow-lg shadow-black/30 backdrop-blur opacity-10 transition-[opacity,color,border-color,background-color] duration-200 hover:opacity-100 hover:border-blue-400/50 hover:bg-[#171735] focus-visible:opacity-100"
      >
        <span className="sr-only">
          {sidebarOpen ? "Close menu" : "Open menu"}
        </span>
        {sidebarOpen ? (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6L18 18" />
            <path d="M18 6L6 18" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M5 7H19" />
            <path d="M5 12H19" />
            <path d="M5 17H19" />
          </svg>
        )}
      </button>

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close admin menu overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/45 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-gray-800 bg-[#111127] transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-gray-800">
          <Link href="/admin" className="text-lg font-bold text-white">
            Ajiz Tech Challenge <span className="text-xs text-gray-500">Admin</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="pt-4 border-t border-gray-800 mt-4">
            <Link
              href="/dashboard"
              className="block px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              ← Student View
            </Link>
          </div>
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="px-3 py-2">
            <p className="text-sm text-white truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-left transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main
        className={`min-h-screen overflow-auto pt-16 lg:pt-0 transition-[padding] duration-200 ${
          sidebarOpen ? "lg:pl-56" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
