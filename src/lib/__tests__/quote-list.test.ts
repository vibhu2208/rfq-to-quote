import { describe, expect, it } from "vitest";
import { parseQuoteListFilters, quoteListHasFilters, quoteListWhere } from "@/lib/quote-list";

describe("quoteListWhere", () => {
  it("searches quote name, number, client, and product from a single q", () => {
    const where = quoteListWhere(
      parseQuoteListFilters({ q: "testing" }),
    ) as { AND: Array<{ OR?: unknown[] }> };

    expect(where.AND).toHaveLength(1);
    const or = where.AND[0]?.OR ?? [];
    expect(or).toEqual(
      expect.arrayContaining([
        { quoteNumber: { contains: "testing", mode: "insensitive" } },
        { quoteName: { contains: "testing", mode: "insensitive" } },
        { buyerCompany: { contains: "testing", mode: "insensitive" } },
        expect.objectContaining({ lineItems: expect.any(Object) }),
      ]),
    );
  });

  it("does not treat an empty search as a filter", () => {
    const filters = parseQuoteListFilters({ q: "  " });
    expect(quoteListHasFilters(filters)).toBe(false);
    expect(quoteListWhere(filters)).toEqual({});
  });
});
