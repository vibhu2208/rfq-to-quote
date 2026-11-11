/**
 * Fires as soon as Next.js begins a soft navigation (Link, router.push/replace,
 * or history traverse). RouteTransitionProvider listens and paints a skeleton
 * before the destination RSC/JS is ready — critical when cache is cold and
 * loading.tsx cannot swap in yet.
 */
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
) {
  try {
    const parsed = new URL(url, window.location.origin);
    const href = `${parsed.pathname}${parsed.search}`;
    if (
      parsed.origin !== window.location.origin ||
      (parsed.pathname === window.location.pathname &&
        parsed.search === window.location.search)
    ) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("qf:route-transition-start", {
        detail: { href, navigationType },
      })
    );
  } catch {
    // Ignore malformed URLs from the router hook.
  }
}
