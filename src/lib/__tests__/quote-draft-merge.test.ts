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

  it("matches legacy rows without rfqLineId by product and client wording", () => {
    const legacyOnly = [
      {
        id: "legacy-1",
        rfqLineId: null,
        productId: "prod-1",
        aliasName: "16-port switch",
        description: "",
        qty: 3,
        unit: "nos",
        unitPrice: 4500,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 0,
      },
      {
        id: "legacy-2",
        rfqLineId: null,
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
    ];
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
    const first = mergeDraftQuoteLines(legacyOnly, incoming);
    expect(first.changes.some((change) => change.kind === "add")).toBe(false);
    const second = mergeDraftQuoteLines(
      first.lines
        .filter((line) => line.id)
        .map((line) => ({
          id: line.id!,
          rfqLineId: line.rfqLineId ?? null,
          productId: line.productId,
          aliasName: line.aliasName,
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          taxRate: line.taxRate,
          sortOrder: line.sortOrder,
          customItem: line.customItem,
        })),
      incoming
    );
    expect(draftMergeActionableChanges(second.changes)).toHaveLength(0);
    expect(second.lines).toHaveLength(2);
  });

  it("KAN-151: second sync with legacy unmatched rows is a no-op when rfq/workspace aligns", () => {
    const existing = [
      {
        id: "q1",
        rfqLineId: 1,
        productId: "sw-16",
        aliasName: "16-port switch",
        description: "",
        qty: 3,
        unit: "nos",
        unitPrice: 4500,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 0,
      },
      {
        id: "q2",
        rfqLineId: 2,
        productId: "patch-1m",
        aliasName: "CAT6 patch cord 1 m",
        description: "",
        qty: 50,
        unit: "pcs",
        unitPrice: 120,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 1,
      },
      {
        id: "q3",
        rfqLineId: 3,
        productId: "panel-24",
        aliasName: "24-port patch panel",
        description: "",
        qty: 2,
        unit: "pcs",
        unitPrice: 890,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 2,
      },
      {
        id: "q4",
        rfqLineId: 4,
        productId: "ups-1k",
        aliasName: "1000 VA / 1 kVA UPS",
        description: "",
        qty: 5,
        unit: "pcs",
        unitPrice: 6200,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 3,
      },
      {
        id: "q5",
        rfqLineId: 5,
        productId: "mon-24",
        aliasName: "24-inch FHD IPS monitor",
        description: "",
        qty: 15,
        unit: "pcs",
        unitPrice: 9800,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 4,
      },
      {
        id: "q6",
        rfqLineId: 6,
        productId: "mon-27",
        aliasName: "27-inch QHD monitor",
        description: "",
        qty: 4,
        unit: "pcs",
        unitPrice: 14500,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 5,
      },
      {
        id: "legacy-ups-monitor",
        rfqLineId: null,
        productId: "ups-1k",
        aliasName: "UPS + monitor bundle (legacy)",
        description: "",
        qty: 1,
        unit: "pcs",
        unitPrice: 9000,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 7,
      },
      {
        id: "legacy-spare",
        rfqLineId: null,
        productId: "spare-cat",
        aliasName: "Misc networking spare",
        description: "",
        qty: 1,
        unit: "pcs",
        unitPrice: 500,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 8,
      },
      {
        id: "legacy-manual",
        rfqLineId: null,
        productId: null,
        aliasName: "On-site cabling labour",
        description: "",
        qty: 1,
        unit: "pcs",
        unitPrice: 2500,
        discountPercent: 0,
        taxRate: 18,
        sortOrder: 9,
        customItem: true,
      },
    ];
    const incoming = [
      {
        rfqLineId: 1,
        productId: "sw-16",
        aliasName: "16-port switch x3",
        qty: 3,
        unit: "pcs",
      },
      {
        rfqLineId: 2,
        productId: "patch-1m",
        aliasName: "CAT6 patch cord 1 m x50",
        qty: 50,
        unit: "pcs",
      },
      {
        rfqLineId: 3,
        productId: "panel-24",
        aliasName: "24-port patch panel x2",
        qty: 2,
        unit: "pcs",
      },
      {
        rfqLineId: 4,
        productId: "ups-1k",
        aliasName: "1000 VA / 1 kVA UPS x 5",
        qty: 5,
        unit: "nos",
      },
      {
        rfqLineId: 5,
        productId: "mon-24",
        aliasName: "24-inch FHD IPS monitor, qty 15",
        qty: 15,
        unit: "pcs",
      },
      {
        rfqLineId: 6,
        productId: "mon-27",
        aliasName: "27-inch QHD monitor x 4",
        qty: 4,
        unit: "pcs",
      },
    ];
    const { changes, unmatchedExisting } = mergeDraftQuoteLines(existing, incoming);
    expect(unmatchedExisting).toBe(2);
    expect(draftMergeActionableChanges(changes)).toHaveLength(0);
    const again = mergeDraftQuoteLines(
      existing.map((row) => ({ ...row })),
      incoming
    );
    expect(draftMergeActionableChanges(again.changes)).toHaveLength(0);
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