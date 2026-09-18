/** Safely parse JSON from a fetch Response (handles empty / non-JSON bodies). */
export async function readJsonResponse<T = unknown>(
  res: Response
): Promise<{ data: T | null; rawText: string; parseError: string | null }> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    return {
      data: null,
      rawText: "",
      parseError: res.ok ? null : `Empty response (HTTP ${res.status})`,
    };
  }
  try {
    return { data: JSON.parse(rawText) as T, rawText, parseError: null };
  } catch {
    return {
      data: null,
      rawText,
      parseError: `Invalid JSON (HTTP ${res.status})`,
    };
  }
}

export function errorMessageFromJson(
  data: unknown,
  fallback: string
): string {
  if (!data || typeof data !== "object") return fallback;
  const obj = data as Record<string, unknown>;
  if (typeof obj.error === "string") return obj.error;
  if (obj.error && typeof obj.error === "object") return fallback;
  if (typeof obj.message === "string") return obj.message;
  return fallback;
}
