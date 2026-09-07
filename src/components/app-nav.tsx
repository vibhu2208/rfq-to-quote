"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FileText,
  LogOut,
  Package,
  LayoutDashboard,
  Inbox,
  Truck,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/products", label: "Products", icon: Package },
  { href: "/vendors", label: "Vendors", icon: Truck },
  { href: "/quotes", label: "Quotes", icon: FileText },
];

export function AppNav() {
  const pathname = usePathname();
  const { data } = useSession();

  return (
    <header className="border-b border-light-green/30 bg-dark-secondary text-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            QuoteFlow
          </Link>
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href ||
                pathname.startsWith(`${href}/`) ||
                (href === "/inbox" && pathname.startsWith("/rfq/"));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-mid-green text-background"
                      : "text-light-green hover:bg-mid-green/40 hover:text-background"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-light-green">
          <span className="hidden sm:inline">{data?.user?.email}</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-mid-green/40 hover:text-background"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
