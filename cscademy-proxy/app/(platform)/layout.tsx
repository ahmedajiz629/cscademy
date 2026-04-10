"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import ParticipantNotifications from "@/components/ParticipantNotifications";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "student";
}

export default function DashboardLayout({
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
      .then((d) => setUser(d.user))
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

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "⊞" },
    { href: "/tracks", label: "Tracks", icon: "▤" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[#111127] border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <Link href="/dashboard" className="text-lg font-bold text-white">
            Ajiz Tech Challenge
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname.startsWith(item.href)
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {user.role === "admin" && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>⚙</span>
              Admin
            </Link>
          )}
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

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {user.role === "student" && (
          <ParticipantNotifications userId={user.id as Id<"users">} />
        )}
        {children}
      </main>
    </div>
  );
}
