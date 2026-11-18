import { describe, expect, it } from "vitest";
import { buildMarketplaceLineQueries, buildMarketplaceQuery } from "@/lib/marketplace/query";
import {
  displayCatalogComparator,
  listingRelevantToQuery,
  lowestPositivePrice,
  relevantListings,
} from "@/lib/marketplace/relevance";
import type { MarketplaceListing } from "@/lib/marketplace/types";

const listing = (title: string, price: number | null): MarketplaceListing => ({
  source: "amazon",
  title,
  price,
  currency: "INR",
  link: "https://example.com",
});

describe("marketplace line queries", () => {
  it("searches each requested line instead of the whole email", () => {
    const lines = buildMarketplaceLineQueries({
      parsedCategory: "NETWORKING",
      parsedSpecs: {
        items: [
          { description: "ceiling-mount Wi-Fi 6 access point", quantity: 6, unit: "pcs" },
          { description: "24-port gigabit switch", quantity: 2, unit: "pcs" },
        ],
      },
      rawText: "Also need 50 inch display and a TV wall mount and energy monitor",
      subject: "Office RFQ",
    });
    expect(lines.map((line) => line.query)).toEqual([
      "ceiling-mount Wi-Fi 6 access point",
      "24-port gigabit switch",
    ]);
    const many = buildMarketplaceLineQueries({
      parsedSpecs: {
        items: [1, 2, 3, 4, 5].map((n) => ({
          description: `Product line ${n}`,
          quantity: 1,
          unit: "pcs",
        })),
      },
    });
    expect(many).toHaveLength(5);
    expect(
      buildMarketplaceQuery({
        parsedSpecs: {
          items: [
            { description: "ceiling-mount Wi-Fi 6 access point", quantity: 1, unit: "pcs" },
          ],
        },
        rawText: "50 inch tv mount",
      })
    ).toBe("ceiling-mount Wi-Fi 6 access point");
  });
});

describe("listing relevance", () => {
  const query = "ceiling-mount Wi-Fi 6 access point";

  it("KAN-42: drops mounts and energy monitors from an access-point search", () => {
    const kept = relevantListings(
      [
        listing("Wi-Fi 6 ceiling access point", 4500),
        listing("TV wall mount", 3500),
        listing("Speaker mount", 775),
        listing("Monitor arm", 2353),
        listing("Energy monitor", 999),
      ],
      query
    );
    expect(kept.map((row) => row.title)).toEqual(["Wi-Fi 6 ceiling access point"]);
  });

  it("hides a ₹0 unrelated catalog comparator", () => {
    expect(
      displayCatalogComparator({
        query,
        catalogPrice: 0,
        catalogProductName: "CP PLUS 10-port PoE device",
      })
    ).toEqual({ price: null, name: null });
    expect(
      displayCatalogComparator({
        query,
        catalogPrice: 4200,
        catalogProductName: "CP PLUS 10-port PoE switch",
      }).price
    ).toBeNull();
  });

  it("marks a single lowest comparable price, not each row", () => {
    expect(lowestPositivePrice([3500, 775, 4500, 0, null])).toBe(775);
    expect(listingRelevantToQuery("Speaker mount", query)).toBe(false);
    expect(listingRelevantToQuery("Wi-Fi 6 ceiling access point", query)).toBe(true);
  });
});
