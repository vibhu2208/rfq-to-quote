import { searchFlipkartApify, searchIndiaMartApify } from "@/lib/marketplace/apify";
import { searchAmazonIndia } from "@/lib/marketplace/serpapi";
import type { MarketplaceListing } from "@/lib/marketplace/types";

export type MarketplaceSearchResult = {
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
  errors: string[];
};

const SOURCE_TIMEOUT_MS = 12_000;

async function withSourceTimeout<T>(
  run: (signal: AbortSignal) => Promise<{ data: T; error?: string }>,
  empty: T,
  timeoutMs: number
): Promise<{ data: T; error?: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ data: T; error: string }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        data: empty,
        error: `timed out after ${Math.round(timeoutMs / 1000)}s`,
      });
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch (err) {
    return {
      data: empty,
      error: err instanceof Error ? err.message : "request failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function searchMarketplaces(
  query: string,
  options?: { timeoutMs?: number }
): Promise<MarketplaceSearchResult> {
  const timeoutMs = options?.timeoutMs ?? SOURCE_TIMEOUT_MS;
  const [amazonResult, flipkartResult, indiamartResult] = await Promise.all([
    withSourceTimeout((signal) => searchAmazonIndia(query, signal), [], timeoutMs),
    withSourceTimeout((signal) => searchFlipkartApify(query, signal), [], timeoutMs),
    withSourceTimeout((signal) => searchIndiaMartApify(query, signal), [], timeoutMs),
  ]);

  const errors: string[] = [];
  if (amazonResult.error) errors.push(`Amazon: ${amazonResult.error}`);
  if (flipkartResult.error) errors.push(`Flipkart: ${flipkartResult.error}`);
  if (indiamartResult.error) errors.push(`IndiaMART: ${indiamartResult.error}`);

  return {
    amazon: amazonResult.data ?? [],
    flipkart: flipkartResult.data ?? [],
    indiamart: indiamartResult.data ?? [],
    errors,
  };
}
