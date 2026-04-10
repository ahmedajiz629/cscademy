"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.role !== "admin") router.push("/dashboard");
        else setUser(d.user);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  if (!user) {
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
    <div className="min-h-screen bg-[#0a0a0a] flex">
      <aside className="w-56 bg-[#111127] border-r border-gray-800 flex flex-col">
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

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
