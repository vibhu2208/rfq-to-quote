"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOptimisticPathname } from "@/components/navigation-progress";
import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ClipboardList,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookTabs,
  Package,
  Receipt,
  Settings2,
  Target,
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
  { href: "/leads", label: "Leads", icon: Target },
];

const sales: NavItem[] = [
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/proformas", label: "Proformas", icon: ClipboardList },
  { href: "/invoices", label: "Invoices", icon: Receipt },
];

const ledger: NavItem[] = [
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/vendors", label: "Vendors", icon: Truck },
];

const operations: NavItem[] = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Warehouse },
  { href: "/knowledge", label: "Knowledge", icon: BookMarked },
];

const finance: NavItem[] = [
  { href: "/accounting", label: "Books", icon: BookOpen },
  { href: "/gst", label: "GST", icon: Landmark },
];

const admin: NavItem[] = [
  { href: "/admin/vendors", label: "Vendor mapping", icon: Settings2 },
];

const desktopLinks: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Target },
  ...sales,
  ...operations,
  ...finance,
  ...admin,
];

const groups = [
  { title: "Overview", items: overview },
  { title: "Sales", items: sales },
  { title: "Ledger", items: ledger },
  { title: "Operations", items: operations },
  { title: "Finance", items: finance },
  { title: "Admin", items: admin },
];

function isActive(pathname: string, href: string) {
  return (
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === "/leads" &&
      (pathname.startsWith("/leads") ||
        pathname.startsWith("/rfq/") ||
        pathname === "/inbox"))
  );
}

function isLedgerActive(pathname: string) {
  return ledger.some((item) => isActive(pathname, item.href));
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

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-lg transition ${
        compact ? "w-full px-3 py-2.5 text-sm" : "px-2.5 py-1.5 text-[13px]"
      } ${
        active
          ? "bg-background/15 text-background shadow-[inset_0_0_0_1px_rgba(245,241,232,0.08)]"
          : "text-light-green hover:bg-background/10 hover:text-background"
      }`}
    >
      <Icon className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.6} />
      {item.label}
    </Link>
  );
}

function NavDropdown({
  pathname,
  onNavigate,
  label,
  icon: GroupIcon,
  items,
  active,
}: {
  pathname: string;
  onNavigate?: () => void;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function clearCloseTimer() {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: Math.max(8, rect.left),
    });
  }

  function openMenu() {
    clearCloseTimer();
    updatePosition();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    function onReposition() {
      updatePosition();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      clearCloseTimer();
    };
  }, [open]);

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[100] max-h-[70vh] min-w-[13rem] overflow-y-auto overflow-x-hidden rounded-xl border border-dark-primary/10 bg-white py-1 text-dark-primary shadow-[0_12px_40px_rgba(11,43,38,0.22)]"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const itemActive = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm transition ${
                    itemActive
                      ? "bg-dark-primary/8 font-medium text-dark-primary"
                      : "text-dark-primary/90 hover:bg-dark-primary/5"
                  }`}
                >
                  <Icon className="h-4 w-4 text-mid-green" strokeWidth={1.6} />
                  {item.label}
                </Link>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          openMenu();
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition ${
          active || open
            ? "bg-background/15 text-background shadow-[inset_0_0_0_1px_rgba(245,241,232,0.08)]"
            : "text-light-green hover:bg-background/10 hover:text-background"
        }`}
      >
        <GroupIcon className="h-3.5 w-3.5" strokeWidth={1.6} />
        {label}
        <ChevronDown
          className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`}
          strokeWidth={1.8}
        />
      </button>
      {menu}
    </div>
  );
}

function LedgerDropdown({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <NavDropdown
      pathname={pathname}
      onNavigate={onNavigate}
      label="Ledger"
      icon={NotebookTabs}
      items={ledger}
      active={isLedgerActive(pathname)}
    />
  );
}

export function AppNav({ email: userEmail }: { email: string }) {
  const pathname = useOptimisticPathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  const userMenuRef = useRef<HTMLDivElement>(null);

  if (pathname !== menuPath) {
    setMenuPath(pathname);
    setMobileOpen(false);
    setUserOpen(false);
  }

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

  // Insert Ledger after Invoices on desktop.
  const ledgerInsertAfter = "/invoices";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-white/10 bg-dark-secondary/95 text-background backdrop-blur-md">
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

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-visible lg:flex">
          {desktopLinks.map((item) => (
            <span key={item.href} className="contents">
              <NavLink item={item} pathname={pathname} />
              {item.href === ledgerInsertAfter ? (
                <LedgerDropdown pathname={pathname} />
              ) : null}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-background/10"
              aria-expanded={userOpen}
              aria-haspopup="menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-light-green/25 text-xs font-semibold text-background">
                {initialsFromEmail(userEmail)}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm text-light-green md:inline">
                {userEmail}
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
                  <p className="truncate text-sm font-medium">{userEmail || "Account"}</p>
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
              <p className="truncate px-3 pb-2 text-xs text-light-green">{userEmail}</p>
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
