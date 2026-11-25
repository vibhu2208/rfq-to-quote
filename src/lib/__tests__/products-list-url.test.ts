import { describe, expect, it } from "vitest";
import {
  parseProductsPageParam,
  shouldResetProductsPageOnSearch,
} from "@/lib/products-list-url";

describe("products list url", () => {
  it("KAN-144: reads page from search params without coercion to 1", () => {
    expect(parseProductsPageParam("2")).toBe(2);
    expect(parseProductsPageParam(null)).toBe(1);
    expect(parseProductsPageParam("0")).toBe(1);
  });

  it("only resets pagination when debounced search actually changes", () => {
    expect(shouldResetProductsPageOnSearch("", "")).toBe(false);
    expect(shouldResetProductsPageOnSearch("", "cable")).toBe(true);
    expect(shouldResetProductsPageOnSearch("cable", "cable")).toBe(false);
  });
});