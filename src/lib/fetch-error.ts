function errorName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String(err.name) : "";
}

function isRetryableNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(err.message);
}

/** Turn a thrown fetch/network error into copy the form can show. */
export function userFacingFetchError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  if (errorName(err) === "AbortError" || /aborted/i.test(message)) {
    return "The request timed out. Try a smaller file, or try again.";
  }
  if (isRetryableNetworkError(err)) {
    return "The app server dropped this request. Wait a moment and try again.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** fetch() with a timeout and one retry when the dev server drops the first POST. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: { timeoutMs?: number; retries?: number }
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const retries = opts?.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (!isRetryableNetworkError(err) || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}

/**
 * Read JSON from an API response. HTML 404 pages from a missing route
 * (Turbopack dropping nested handlers) must not be parsed as JSON.
 */
export async function parseApiJson<T = unknown>(res: Response, fallback: string): Promise<T> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(
      res.status === 404
        ? "Catalog search and parse are not loaded. Refresh the page and try again."
        : fallback
    );
  }
  return (await res.json()) as T;
}
