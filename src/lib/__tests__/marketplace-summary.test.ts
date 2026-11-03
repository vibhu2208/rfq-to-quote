import { describe, expect, it } from "vitest";
import type { MarketplaceListing } from "@/lib/marketplace/types";
import {
  bestMarketplacePricesForProduct,
  bestPricedListing,
  listingsMatchingProduct,
  marketplaceQueryFromText,
} from "@/lib/marketplace/summary";

const listing = (
  source: MarketplaceListing["source"],
  title: string,
  price: number | null
): MarketplaceListing => ({
  source,
  title,
  price,
  currency: "INR",
  link: `https://example.com/${source}`,
});

describe("marketplaceQueryFromText", () => {
  it("uses the first usable product name", () => {
    expect(marketplaceQueryFromText("", "HP 15s Laptop", "ignored")).toBe("HP 15s Laptop");
  });
});

describe("bestPricedListing", () => {
  it("returns the lowest priced listing", () => {
    const best = bestPricedListing([
      listing("amazon", "A", 12999),
      listing("amazon", "B", 11490),
      listing("amazon", "C", null),
    ]);
    expect(best?.title).toBe("B");
  });
});

describe("listingsMatchingProduct", () => {
  it("keeps listings whose title matches that product", () => {
    const matched = listingsMatchingProduct(
      [
        listing("amazon", "HP 15s Intel Core i5 Laptop", 41890),
        listing("amazon", "Samsung 24 inch monitor", 8900),
      ],
      "HP 15s Laptop"
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].title).toContain("HP 15s");
  });
});

describe("bestMarketplacePricesForProduct", () => {
  it("picks marketplace prices for that product only", () => {
    const best = bestMarketplacePricesForProduct(
      {
        amazon: [
          listing("amazon", "HP 15s Laptop 8GB", 42000),
          listing("amazon", "Dell Monitor 24", 9000),
        ],
        flipkart: [listing("flipkart", "HP 15s 8GB RAM", 39990)],
        indiamart: [listing("indiamart", "Office monitor 24 inch", 8500)],
      },
      "HP 15s Laptop"
    );
    expect(best.amazon?.price).toBe(42000);
    expect(best.flipkart?.price).toBe(39990);
    expect(best.indiamart).toBeNull();
  });
});
