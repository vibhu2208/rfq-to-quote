function errorName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String(err.name) : "";
}

function isRetryableNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(err.message);
}

/**
 * Provider failures (OpenRouter 429, raw JSON) must not land in the RFQ banner.
 * Short messages we wrote ourselves are kept.
 */
export function userFacingParseError(message: string | null | undefined): string {
  const raw = String(message || "").trim();
  if (!raw) return "";
  const busy = /429|rate[- ]limit|too many requests|temporarily rate-limited|high traffic/i.test(raw);
  const provider = /openrouter|provider returned error|"error"\s*:/i.test(raw);
  if (busy) {
    return "AI parsing is temporarily unavailable because the provider is busy. Wait a moment and use Re-parse.";
  }
  if (provider || /^\s*[{[]/.test(raw) || raw.length > 180) {
    return "AI parsing is temporarily unavailable. Wait a moment and use Re-parse.";
  }
  return raw;
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
