import { describe, expect, it } from "vitest";
import {
  draftMergeActionableChanges,
  mergeDraftQuoteLines,
} from "@/lib/quote-draft-merge";

describe("mergeDraftQuoteLines", () => {
  const existing = [
    {
      id: "line-a",
      rfqLineId: 1,
      productId: "prod-1",
      aliasName: "16-port switch",
      description: "",
      qty: 2,
      unit: "nos",
      unitPrice: 4500,
      discountPercent: 0,
      taxRate: 18,
      sortOrder: 0,
    },
    {
      id: "line-b",
      rfqLineId: 2,
      productId: "prod-hdmi",
      aliasName: "QA test HDMI cable 3m x 5",
      description: "",
      qty: 5,
      unit: "pcs",
      unitPrice: 400,
      discountPercent: 0,
      taxRate: 18,
      sortOrder: 1,
    },
    {
      id: "line-c",
      rfqLineId: null,
      productId: null,
      aliasName: "Custom HDMI run",
      description: "",
      qty: 1,
      unit: "pcs",
      unitPrice: 1234.56,
      discountPercent: 0,
      taxRate: 18,
      sortOrder: 5,
      customItem: true,
    },
  ];

  it("matches by rfqLineId only and preserves client names", () => {
    const { lines, changes } = mergeDraftQuoteLines(existing, [
      {
        rfqLineId: 1,
        productId: "prod-1",
        aliasName: "16-port switch ×3",
        qty: 3,
      },
      {
        rfqLineId: 2,
        productId: "prod-patch-wrong",
        aliasName: "Cat6 patch cable 2 m, qty 10",
        qty: 10,
      },
    ]);
    expect(lines.find((l) => l.id === "line-a")?.aliasName).toBe("16-port switch");
    expect(lines.find((l) => l.id === "line-b")?.aliasName).toBe(
      "QA test HDMI cable 3m x 5"
    );
    expect(lines.find((l) => l.id === "line-b")?.productId).toBe("prod-patch-wrong");
    expect(lines.find((l) => l.id === "line-c")).toBeTruthy();
    expect(draftMergeActionableChanges(changes).some((c) => c.kind === "update")).toBe(
      true
    );
  });

  it("second sync with unchanged RFQ is a no-op in the preview", () => {
    const incoming = [
      {
        rfqLineId: 1,
        productId: "prod-1",
        aliasName: "16-port switch ×3",
        qty: 3,
      },
      {
        rfqLineId: 2,
        productId: "prod-hdmi",
        aliasName: "QA test HDMI cable 3m x 5",
        qty: 5,
      },
    ];
    const first = mergeDraftQuoteLines(existing, incoming);
    const pool = first.lines
      .filter((l) => l.id)
      .map((l) => ({
        id: l.id!,
        rfqLineId: l.rfqLineId ?? null,
        productId: l.productId,
        aliasName: l.aliasName,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxRate: l.taxRate,
        sortOrder: l.sortOrder,
        customItem: l.customItem,
      }));
    const syncedIncoming = incoming.map((row) => {
      if (row.rfqLineId === 2) {
        const line = first.lines.find((l) => l.rfqLineId === 2);
        return { ...row, productId: line?.productId ?? row.productId };
      }
      return row;
    });
    const second = mergeDraftQuoteLines(pool, syncedIncoming);
    expect(draftMergeActionableChanges(second.changes)).toHaveLength(0);
  });

  it("adds a new RFQ line once without duplicating", () => {
    const { lines } = mergeDraftQuoteLines(existing, [
      {
        rfqLineId: 1,
        productId: "prod-1",
        aliasName: "16-port switch",
        qty: 1,
      },
      {
        rfqLineId: 3,
        productId: "prod-9",
        aliasName: "CAT6 patch cord 1 m",
        qty: 50,
        unitPrice: 120,
      },
    ]);
    expect(lines.filter((l) => l.rfqLineId === 3)).toHaveLength(1);
    expect(lines.find((l) => l.rfqLineId === 3)?.aliasName).toContain("CAT6");
  });
});