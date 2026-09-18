"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ClipboardList,
  FileText,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Receipt,
  Sparkles,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const overview: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/copilot", label: "Copilot", icon: Sparkles },
];

const sales: NavItem[] = [
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/proformas", label: "Proformas", icon: ClipboardList },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
];

const operations: NavItem[] = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/vendors", label: "Vendors", icon: Truck },
  { href: "/inventory", label: "Inventory", icon: Warehouse },
  { href: "/knowledge", label: "Knowledge", icon: BookMarked },
];

const finance: NavItem[] = [
  { href: "/accounting", label: "Books", icon: BookOpen },
  { href: "/gst", label: "GST", icon: Landmark },
];

const desktopLinks: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  ...sales,
  ...operations,
  ...finance,
];

const groups = [
  { title: "Overview", items: overview },
  { title: "Sales", items: sales },
  { title: "Operations", items: operations },
  { title: "Finance", items: finance },
];

function isActive(pathname: string, href: string) {
  return (
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === "/inbox" && pathname.startsWith("/rfq/"))
  );
}

function initialsFromEmail(email?: string | null) {
  if (!email) return "Q";
  const name = email.split("@")[0] || email;
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function NavLink({
  item,
  pathname,
  onClick,
  compact = false,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const featured = item.href === "/copilot";

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-lg transition ${
        compact ? "w-full px-3 py-2.5 text-sm" : "px-2.5 py-1.5 text-[13px]"
      } ${
        active
          ? "bg-background/15 text-background shadow-[inset_0_0_0_1px_rgba(245,241,232,0.08)]"
          : featured
            ? "text-background/90 hover:bg-background/10"
            : "text-light-green hover:bg-background/10 hover:text-background"
      }`}
    >
      <Icon className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.6} />
      {item.label}
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const { data } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setUserOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setUserOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const email = data?.user?.email ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-dark-secondary/95 text-background backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-5">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-light-green hover:bg-background/10 hover:text-background lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.6} />
        </button>

        <Link href="/dashboard" className="mr-1 flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mid-green text-sm font-semibold tracking-tight">
            Q
          </span>
          <span className="text-[15px] font-semibold tracking-tight">QuoteFlow</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden">
          {desktopLinks.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/copilot"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium sm:px-3 ${
              isActive(pathname, "/copilot")
                ? "bg-light-green text-dark-primary"
                : "bg-mid-green text-background hover:bg-light-green hover:text-dark-primary"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="hidden sm:inline">Copilot</span>
          </Link>

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-background/10"
              aria-expanded={userOpen}
              aria-haspopup="menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-light-green/25 text-xs font-semibold text-background">
                {initialsFromEmail(email)}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm text-light-green md:inline">
                {email}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-light-green transition ${userOpen ? "rotate-180" : ""}`}
              />
            </button>
            {userOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-dark-primary/10 bg-background py-1 text-dark-primary shadow-[0_12px_40px_rgba(11,43,38,0.18)]"
              >
                <div className="border-b border-dark-primary/8 px-3 py-2.5">
                  <p className="text-xs text-mid-green">Signed in</p>
                  <p className="truncate text-sm font-medium">{email || "Account"}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-dark-primary/5"
                >
                  <LogOut className="h-4 w-4 text-mid-green" strokeWidth={1.6} />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-dark-primary/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-80 max-w-[85vw] flex-col bg-dark-secondary shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <span className="flex items-center gap-2.5 text-[15px] font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mid-green text-sm">
                  Q
                </span>
                QuoteFlow
              </span>
              <button
                type="button"
                className="rounded-lg p-2 text-light-green hover:bg-background/10 hover:text-background"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {groups.map((group) => (
                <div key={group.title} className="mb-5">
                  <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-light-green/70">
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        compact
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-white/10 p-3">
              <p className="truncate px-3 pb-2 text-xs text-light-green">{email}</p>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-light-green hover:bg-background/10 hover:text-background"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.6} />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
