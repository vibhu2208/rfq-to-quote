import { describe, expect, it } from "vitest";
import {
  parseQuoteListFilters,
  QUOTE_LIST_PAGE_SIZE,
  quoteListCsv,
  quoteListExportHref,
  quoteListHasFilters,
  quoteListOrderBy,
  quoteListQuery,
  quoteListSortQuery,
  quoteListWhere,
} from "@/lib/quote-list";

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

  it("filters by client and grand total range", () => {
    const filters = parseQuoteListFilters({
      client: "Acme",
      min: "1000",
      max: "5000",
    });
    expect(quoteListHasFilters(filters)).toBe(true);
    const where = quoteListWhere(filters) as {
      AND: Array<Record<string, unknown>>;
    };
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { buyerCompany: { contains: "Acme", mode: "insensitive" } },
            { buyerName: { contains: "Acme", mode: "insensitive" } },
            { buyerGstin: { contains: "Acme", mode: "insensitive" } },
          ],
        },
        { grandTotal: { gte: 1000, lte: 5000 } },
      ])
    );
  });

  it("ignores an unknown sort and paginates in pages of 25", () => {
    expect(parseQuoteListFilters({ sort: "nope", dir: "asc" }).sort).toBe("");
    expect(QUOTE_LIST_PAGE_SIZE).toBe(25);
    expect(quoteListOrderBy(parseQuoteListFilters({ sort: "total", dir: "asc" }))).toEqual([
      { grandTotal: "asc" },
      { updatedAt: "desc" },
    ]);
  });

  it("builds sort and export links without dropping filters", () => {
    const filters = parseQuoteListFilters({ q: "panel", sort: "buyer", dir: "asc", page: "3" });
    expect(quoteListQuery(filters, 2)).toBe("/quotes?q=panel&sort=buyer&dir=asc&page=2");
    expect(quoteListSortQuery(filters, "total")).toBe(
      "/quotes?q=panel&sort=total&dir=desc"
    );
    expect(quoteListExportHref(filters)).toBe(
      "/api/quotes/export?q=panel&sort=buyer&dir=asc"
    );
  });
});

describe("quoteListCsv", () => {
  it("quotes commas in the buyer name", () => {
    const csv = quoteListCsv([
      {
        quoteNumber: "Q-1",
        quoteName: "Site, phase 1",
        buyer: "Acme, Indore",
        status: "DRAFT",
        updated: "2026-11-12",
        grandTotal: 106023,
        withGst: true,
      },
    ]);
    expect(csv.split("\n")[0]).toBe("Quote,Name,Buyer,Status,Updated,Total,GST");
    expect(csv).toContain('"Acme, Indore"');
    expect(csv).toContain("106023");
  });
});
