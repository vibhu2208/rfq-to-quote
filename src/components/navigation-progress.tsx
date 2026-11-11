"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { AppPageSkeleton } from "@/components/page-skeleton";

type SkeletonVariant = "default" | "dashboard" | "table" | "detail";

type RouteTransitionContextValue = {
  pendingHref: string | null;
  isPending: boolean;
};

type RouteTransitionStartDetail = {
  href: string;
  navigationType?: string;
};

const RouteTransitionContext = createContext<RouteTransitionContextValue>({
  pendingHref: null,
  isPending: false,
});

export function useRouteTransition() {
  return useContext(RouteTransitionContext);
}

function skeletonVariantFor(href: string): SkeletonVariant {
  const path = href.split("?")[0] || href;
  if (path === "/dashboard") return "dashboard";
  if (
    path === "/leads" ||
    path.startsWith("/leads/") ||
    path === "/quotes" ||
    path === "/proformas" ||
    path === "/invoices" ||
    path === "/clients" ||
    path === "/vendors" ||
    path === "/products" ||
    path === "/inventory" ||
    path === "/inbox" ||
    path === "/accounting" ||
    path === "/gst" ||
    path === "/knowledge" ||
    path.startsWith("/admin/")
  ) {
    return "table";
  }
  if (
    path === "/quotes/new" ||
    path === "/quotes/generate" ||
    path.startsWith("/quotes/") ||
    path.startsWith("/rfq/") ||
    path.startsWith("/proformas/") ||
    path.startsWith("/invoices/") ||
    path.includes("/[") ||
    /\/[^/]+\/[a-z0-9-]{8,}/i.test(path)
  ) {
    return "detail";
  }
  return "default";
}

function isInternalNavClick(e: MouseEvent): string | null {
  if (e.defaultPrevented) return null;
  if (e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;

  const anchor = (e.target as HTMLElement | null)?.closest("a");
  if (!anchor) return null;

  const href = anchor.getAttribute("href");
  if (!href) return null;
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:")
  ) {
    return null;
  }
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return null;

  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  ) {
    return null;
  }

  return `${url.pathname}${url.search}`;
}

function paintPendingHref(href: string, setPendingHref: (href: string) => void) {
  // Soft nav runs inside startTransition. A normal setState in the same click
  // can be deferred with that transition and never paint until the destination
  // is ready — leaving the previous page on screen. flushSync forces the
  // skeleton into the DOM before Next continues the navigation.
  //
  // Always schedule via a microtask: router.replace/push from a useEffect (e.g.
  // filter URL sync) invokes onRouterTransitionStart while React is still
  // committing, and flushSync is illegal in that window.
  queueMicrotask(() => {
    flushSync(() => {
      setPendingHref(href);
    });
  });
}

function isPathnameChange(href: string): boolean {
  const nextPath = href.split("?")[0] || href;
  return nextPath !== window.location.pathname;
}

/**
 * Shows a destination-page skeleton + top progress bar immediately on in-app
 * navigation — before the RSC payload arrives. Needed because (app)/layout is
 * force-dynamic and React transitions keep the previous page painted until the
 * next route commits.
 */
export function RouteTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const href = isInternalNavClick(e);
      // Query-only updates stay on the same page — no full-route skeleton.
      if (!href || !isPathnameChange(href)) return;
      paintPendingHref(href, setPendingHref);
    }

    function onRouterStart(e: Event) {
      const href = (e as CustomEvent<RouteTransitionStartDetail>).detail?.href;
      if (!href || !isPathnameChange(href)) return;
      paintPendingHref(href, setPendingHref);
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("qf:route-transition-start", onRouterStart);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("qf:route-transition-start", onRouterStart);
    };
  }, []);

  // Safety: clear if navigation stalls (e.g. aborted soft nav).
  useEffect(() => {
    if (!pendingHref) return;
    const timer = window.setTimeout(() => setPendingHref(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  const value = useMemo(
    () => ({
      pendingHref,
      isPending: pendingHref != null,
    }),
    [pendingHref]
  );

  return (
    <RouteTransitionContext.Provider value={value}>
      {children}
    </RouteTransitionContext.Provider>
  );
}

/** Top progress bar while a soft navigation is in flight. */
export function NavigationProgress() {
  const { isPending } = useRouteTransition();
  if (!isPending) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-dark-secondary/20"
      role="progressbar"
      aria-label="Loading page"
      aria-busy="true"
    >
      <div className="nav-progress-bar h-full w-1/3 bg-mid-green" />
    </div>
  );
}

/**
 * Covers the main content area with the destination skeleton as soon as a
 * nav link is clicked, so the user never stares at a frozen previous page.
 */
export function RouteTransitionOverlay() {
  const { pendingHref } = useRouteTransition();
  if (!pendingHref) return null;

  return (
    <div
      className="absolute inset-0 z-20 overflow-y-auto bg-background px-3 py-3 sm:px-4 lg:px-5"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-[110rem]">
        <AppPageSkeleton variant={skeletonVariantFor(pendingHref)} />
      </div>
    </div>
  );
}

/** Pathname for nav highlighting — uses the clicked destination while loading. */
export function useOptimisticPathname() {
  const pathname = usePathname();
  const { pendingHref } = useRouteTransition();
  const pendingPath = pendingHref?.split("?")[0] ?? null;
  return pendingPath || pathname;
}
