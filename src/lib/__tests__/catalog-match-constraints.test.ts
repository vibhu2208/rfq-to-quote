import { describe, expect, it } from "vitest";
import type { Product } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  catalogBindingLooksMismatched,
  extractMatchConstraints,
  matchProductsToRfqItems,
  shouldAutoBindCatalogMatch,
} from "@/lib/product-match";

function fakeProduct(
  partial: Partial<Product> & Pick<Product, "id" | "code" | "name">
): Product {
  return {
    description: "",
    unit: "pcs",
    uqc: "NOS",
    hsnCode: null,
    productType: "GOODS",
    sourceProductId: null,
    modelNo: null,
    partNo: null,
    commCode: null,
    category: null,
    subCategory: null,
    brand: null,
    batchNo: null,
    popularCode: null,
    photoPath: null,
    gstTaxName: null,
    mrp: null,
    lastPrice: null,
    lastPricedAt: null,
    openingStock: new Decimal(0),
    isStockable: true,
    sourceGender: null,
    masterData: {},
    basePrice: new Decimal(100),
    offerPrice: new Decimal(100),
    taxRate: new Decimal(18),
    taxCategory: "GST18",
    active: true,
    organisationId: "org1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

const catalog = [
  fakeProduct({
    id: "disp50",
    code: "148968",
    name: "50 inch Samsung Display",
    category: "LED Display Samsung",
    description: "50 inch Samsung LED display panel",
  }),
  fakeProduct({
    id: "cord1",
    code: "151900",
    name: "CAT6 PATCH CORD 1 MTR COMMSCOPE",
    category: "CABLE",
    description: "Cat6 patch cord 1 meter",
  }),
  fakeProduct({
    id: "panel24",
    code: "147529",
    name: "CAT6 PATCH PENAL - 24PORT D-LINK",
    category: "CABLE",
    brand: "D-Link",
    description: "Cat6 patch panel 24 port D-Link",
  }),
  fakeProduct({
    id: "cord-dl",
    code: "147690",
    name: "D-LINK PATCH CORD 1MTR",
    category: "CABLE",
    brand: "D-Link",
    description: "D-Link Cat6 patch cord 1m",
  }),
  fakeProduct({
    id: "ups1",
    code: "UPS-1KVA",
    name: "UPS 1KVA Online",
    category: "UPS",
    description: "1 kVA online UPS",
  }),
  fakeProduct({
    id: "ups2",
    code: "151044",
    name: "APC 2KVA UPS",
    category: "UPS",
    brand: "APC",
    description: "APC 2 kVA UPS",
  }),
  fakeProduct({
    id: "sw16",
    code: "151041",
    name: "16 PORT SWITCH",
    category: "NETWORKING",
    description: "16 port gigabit switch",
  }),
  fakeProduct({
    id: "sw16poe",
    code: "151936",
    name: "CP PLUS POE SWITCH 16 PORT",
    category: "NETWORKING",
    description: "CP Plus PoE switch 16 port",
  }),
  fakeProduct({
    id: "mon24",
    code: "MON-24-DP",
    name: "24 inch FHD IPS Monitor HDMI DisplayPort",
    category: "TFT",
    description: "24 inch IPS FHD monitor, HDMI + DisplayPort, 75Hz",
  }),
  fakeProduct({
    id: "mon32",
    code: "MON-32-4K",
    name: "32 inch 4K Monitor",
    category: "TFT",
    description: "32 inch 4K UHD monitor, HDMI/DP",
  }),
  fakeProduct({
    id: "sw24",
    code: "SW-24-DL",
    name: "24 PORT D-LINK SWITCH",
    category: "NETWORKING",
    brand: "D-Link",
    description: "24 port gigabit switch D-Link",
  }),
  fakeProduct({
    id: "ram8",
    code: "RAM-DDR4-8",
    name: "8GB DDR4 Desktop RAM",
    category: "RAM",
    description: "8 GB DDR4 desktop memory",
  }),
  fakeProduct({
    id: "ram16",
    code: "RAM-DDR4-16",
    name: "16GB DDR4 Desktop RAM",
    category: "RAM",
    description: "16 GB DDR4 desktop memory stick",
  }),
];

describe("extractMatchConstraints", () => {
  it("reads screen size, cable length, kVA, port count, and RAM", () => {
    expect(extractMatchConstraints("24-inch FHD monitor").screenInches).toBe(24);
    expect(extractMatchConstraints('24" Full HD IPS display').screenInches).toBe(
      24
    );
    expect(extractMatchConstraints("Cat6 patch cord 1 m").cableMeters).toBe(1);
    expect(extractMatchConstraints("1 kVA UPS").capacityKva).toBe(1);
    expect(extractMatchConstraints("16-port switch").portCount).toBe(16);
    expect(extractMatchConstraints("Sixteen-port network switch").portCount).toBe(
      16
    );
    expect(extractMatchConstraints("24-port patch panel").typeFamily).toBe(
      "patch_panel"
    );
    expect(extractMatchConstraints("Short CAT-6 jumper leads").typeFamily).toBe(
      "patch_cord"
    );
    expect(
      extractMatchConstraints("16 GB DDR4 desktop memory stick").capacityGb
    ).toBe(16);
  });
});

describe("catalog auto-match constraints", () => {
  it("does not prefer a 50-inch display for CAT6 1m patch cords", () => {
    const matches = matchProductsToRfqItems(catalog, {
      parsedSpecs: {
        items: [
          {
            description: "50 CAT6 1 m patch cords",
            quantity: 50,
            unit: "pcs",
            category: "CABLE",
          },
        ],
      },
    });
    expect(matches[0]?.matches[0]?.product.code).toBe("151900");
    expect(
      matches[0]?.matches.every((m) => m.product.code !== "148968")
    ).toBe(true);
  });

  it("prefers D-Link patch panel over patch cord", () => {
    const matches = matchProductsToRfqItems(catalog, {
      parsedSpecs: {
        items: [
          {
            description: "24-port D-Link patch panel",
            quantity: 1,
            unit: "pcs",
            brand: "D-Link",
            category: "CABLE",
          },
        ],
      },
    });
    expect(matches[0]?.matches[0]?.product.code).toBe("147529");
  });

  it("prefers 1kVA UPS over 2kVA", () => {
    const matches = matchProductsToRfqItems(catalog, {
      parsedSpecs: {
        items: [
          {
            description: "1 kVA UPS",
            quantity: 1,
            unit: "pcs",
            category: "UPS",
          },
        ],
      },
    });
    expect(matches[0]?.matches[0]?.product.code).toBe("UPS-1KVA");
  });

  it("prefers non-PoE 16-port switch when RFQ does not ask for PoE", () => {
    const matches = matchProductsToRfqItems(catalog, {
      parsedSpecs: {
        items: [
          {
            description: "16-port switch",
            quantity: 1,
            unit: "pcs",
            category: "NETWORKING",
          },
        ],
      },
    });
    expect(matches[0]?.matches[0]?.product.code).toBe("151041");
  });

  it("rejects 32-inch monitor for a 24-inch DisplayPort RFQ", () => {
    const matches = matchProductsToRfqItems(catalog, {
      parsedSpecs: {
        items: [
          {
            description: "24-inch FHD IPS monitor HDMI+DisplayPort",
            quantity: 15,
            unit: "pcs",
            category: "TFT",
          },
        ],
      },
    });
    expect(matches[0]?.matches[0]?.product.code).toBe("MON-24-DP");
    expect(
      matches[0]?.matches.every((m) => m.product.code !== "MON-32-4K")
    ).toBe(true);
  });

  it("flags mismatched bindings and blocks weak auto-bind", () => {
    expect(
      catalogBindingLooksMismatched(
        "50 CAT6 1 m patch cords",
        "50 inch Samsung Display"
      )
    ).toBe(true);

    const wrong = {
      score: 40,
      product: {
        id: "x",
        code: "148968",
        name: "50 inch Samsung Display",
        description: "50 inch panel",
        unit: "pcs",
        offerPrice: 1,
        lastPrice: null,
        taxRate: 28,
      },
    };
    expect(shouldAutoBindCatalogMatch(wrong, "50 CAT6 1 m patch cords")).toBe(
      false
    );
  });

  it("KAN-15: real Pune RFQ lines do not bind on quantity/size collisions", () => {
    const lines = [
      {
        description: "Sixteen-port network switch for the office floor",
        quantity: 3,
        unit: "pcs",
        category: "NETWORKING",
        expectCode: "151041",
        // PoE 16-port may still appear as an alt; 24-port must never.
        rejectCodes: ["SW-24-DL"],
      },
      {
        description: "Short CAT-6 jumper leads",
        quantity: 50,
        unit: "pcs",
        category: "CABLE",
        expectCode: "151900",
        rejectCodes: ["148968"],
      },
      {
        description: "24-port Cat6 patch panel",
        quantity: 2,
        unit: "pcs",
        brand: "D-Link",
        category: "NETWORKING",
        expectCode: "147529",
        rejectCodes: ["SW-24-DL", "147690"],
      },
      {
        description: '24" Full HD IPS display, must have a DisplayPort input',
        quantity: 10,
        unit: "pcs",
        category: "TFT",
        expectCode: "MON-24-DP",
        rejectCodes: ["MON-32-4K"],
      },
      {
        description: "16 GB DDR4 desktop memory stick",
        quantity: 12,
        unit: "pcs",
        category: "RAM",
        expectCode: "RAM-DDR4-16",
        rejectCodes: ["RAM-DDR4-8"],
      },
    ] as const;

    for (const line of lines) {
      const matches = matchProductsToRfqItems(catalog, {
        parsedSpecs: {
          items: [
            {
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              brand: "brand" in line ? line.brand : null,
              category: line.category,
            },
          ],
        },
      });
      expect(matches[0]?.matches[0]?.product.code, line.description).toBe(
        line.expectCode
      );
      for (const code of line.rejectCodes) {
        expect(
          matches[0]?.matches.every((m) => m.product.code !== code),
          `${line.description} should not suggest ${code}`
        ).toBe(true);
      }
      expect(
        shouldAutoBindCatalogMatch(matches[0]?.matches[0], line.description)
      ).toBe(true);
    }
  });
});
