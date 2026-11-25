"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  navLinksAvailableWidth,
  nextNavCompactState,
} from "@/components/nav-collapse";
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
  Megaphone,
  NotebookTabs,
  Package,
  PhoneCall,
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
  { href: "/telemarketing", label: "Telemarketing", icon: PhoneCall },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
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

const desktopNavLinks: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/telemarketing", label: "Telemarketing", icon: PhoneCall },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  ...sales,
  ...operations,
  ...finance,
];

function isAdminActive(pathname: string) {
  return admin.some((item) => isActive(pathname, item.href));
}

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
      prefetch={false}
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
    // Menus render in a body portal, so the pointer often leaves this wrapper before
    // it reaches the menu — don't auto-close on hover leave (KAN-142).
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
          >
            {items.map((item) => {
              const Icon = item.icon;
              const itemActive = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
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
    <div className="relative shrink-0">
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
  const [compactNav, setCompactNav] = useState(false);
  const [navLayoutReady, setNavLayoutReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const compactRef = useRef(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const navMeasureRef = useRef<HTMLDivElement>(null);
  const userSlotMeasureRef = useRef<HTMLDivElement>(null);
  const userSlotRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = navMeasureRef.current;
    const brand = brandRef.current;
    const userSlotMeasure = userSlotMeasureRef.current;
    if (!bar || !measure || !brand || !userSlotMeasure) return;

    const sync = () => {
      const available = navLinksAvailableWidth(
        bar.clientWidth,
        brand.offsetWidth,
        userSlotMeasure.offsetWidth
      );
      const needed = measure.scrollWidth;
      const next = nextNavCompactState(compactRef.current, needed, available);
      if (next !== compactRef.current) {
        compactRef.current = next;
        setCompactNav(next);
      }
      setNavLayoutReady(true);
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    sync();
    const ro = new ResizeObserver(schedule);
    ro.observe(bar);
    ro.observe(measure);
    ro.observe(brand);
    ro.observe(userSlotMeasure);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // Insert Ledger after Invoices on desktop.
  const ledgerInsertAfter = "/invoices";
  const showInlineNav = !navLayoutReady || !compactNav;

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-white/10 bg-dark-secondary/95 text-background backdrop-blur-md">
      <div
        ref={barRef}
        className="flex h-14 min-w-0 items-center gap-1.5 overflow-x-hidden px-2 sm:gap-2 sm:px-4 lg:px-5"
      >
        {navLayoutReady && compactNav ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-light-green outline-none ring-mid-green/60 hover:bg-background/10 hover:text-background focus-visible:ring-2"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="app-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" strokeWidth={1.6} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.6} />
            )}
          </button>
        ) : null}

        <Link
          ref={brandRef}
          href="/dashboard"
          className="mr-0.5 flex min-w-0 shrink items-center gap-2 sm:mr-1 sm:shrink-0 sm:gap-2.5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mid-green text-sm font-semibold tracking-tight">
            Q
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight max-[400px]:sr-only">
            QuoteFlow
          </span>
        </Link>

        <nav
          className={`min-w-0 flex-1 items-center gap-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            showInlineNav ? "flex" : "pointer-events-none invisible absolute h-0 w-0 overflow-hidden"
          }`}
        >
          {desktopNavLinks.map((item) => (
            <span key={item.href} className="contents">
              <NavLink item={item} pathname={pathname} />
              {item.href === ledgerInsertAfter ? (
                <LedgerDropdown pathname={pathname} />
              ) : null}
            </span>
          ))}
          <NavDropdown
            pathname={pathname}
            label="Admin"
            icon={Settings2}
            items={admin}
            active={isAdminActive(pathname)}
          />
        </nav>

        <div
          aria-hidden
          className="pointer-events-none invisible absolute -left-[9999px] top-0 flex w-max items-center gap-0.5"
          ref={navMeasureRef}
        >
          {desktopNavLinks.map((item) => (
            <span key={item.href} className="contents">
              <NavLink item={item} pathname={pathname} />
              {item.href === ledgerInsertAfter ? (
                <LedgerDropdown pathname={pathname} />
              ) : null}
            </span>
          ))}
          <NavDropdown
            pathname={pathname}
            label="Admin"
            icon={Settings2}
            items={admin}
            active={isAdminActive(pathname)}
          />
        </div>

        <div
          aria-hidden
          ref={userSlotMeasureRef}
          className="pointer-events-none invisible absolute -left-[9999px] top-0 flex w-max shrink-0 items-center gap-1.5 pl-1"
        >
          <span className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-light-green/25 text-xs font-semibold">
              {initialsFromEmail(userEmail)}
            </span>
            <span className="max-w-[12rem] truncate text-sm text-light-green sm:inline">
              {userEmail}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-light-green" />
          </span>
        </div>

        <div
          ref={userSlotRef}
          className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 bg-dark-secondary pl-1"
        >
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none ring-mid-green/60 hover:bg-background/10 focus-visible:ring-2"
              aria-expanded={userOpen}
              aria-haspopup="menu"
              aria-label={`Account menu for ${userEmail}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-light-green/25 text-xs font-semibold text-background">
                {initialsFromEmail(userEmail)}
              </span>
              {showInlineNav ? (
                <span className="hidden max-w-[12rem] truncate text-sm text-light-green sm:inline">
                  {userEmail}
                </span>
              ) : null}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-light-green transition ${userOpen ? "rotate-180" : ""}`}
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

      {mounted && mobileOpen && navLayoutReady && compactNav
        ? createPortal(
            <div className="fixed inset-0 z-[200]">
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-dark-primary/60"
                onClick={() => setMobileOpen(false)}
              />
              <aside
                id="app-mobile-nav"
                role="dialog"
                aria-modal="true"
                aria-label="Main menu"
                className="relative flex h-dvh w-80 max-w-[min(85vw,20rem)] flex-col bg-dark-secondary text-background shadow-2xl"
              >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
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
                <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                  {groups.map((group) => (
                    <div key={group.title} className="mb-5">
                      <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-light-green/70">
                        {group.title}
                      </p>
                      <div className="flex flex-col gap-0.5">
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
                <div className="shrink-0 border-t border-white/10 p-3">
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
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
