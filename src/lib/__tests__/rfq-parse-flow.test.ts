import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeParsedItemsForRfq } from "@/lib/rfq-items";

const KAN_140_RAW = `Please quote: 16-port unmanaged switch x 3; CAT6 patch cord 1 m x 50; 24-port CAT6 patch panel (D-Link) x 2; 1000 VA / 1 kVA UPS x 5; 24-inch FHD IPS monitor with HDMI and DisplayPort, qty 15; 27-inch QHD monitor x 4. Prices inclusive of GST, delivery within 7 days to Mathura, 3 year warranty.`;

const aiFivePrefixed = [
  { description: "Please quote: 16-port unmanaged switch", quantity: 3, unit: "pcs" },
  { description: "CAT6 patch cord 1 m", quantity: 50, unit: "pcs" },
  { description: "24-port CAT6 patch panel (D-Link)", quantity: 2, unit: "pcs" },
  { description: "1000 VA / 1 kVA UPS", quantity: 5, unit: "pcs" },
  {
    description: "24-inch FHD IPS monitor with HDMI and DisplayPort",
    quantity: 15,
    unit: "pcs",
  },
];

describe("finalizeParsedItemsForRfq", () => {
  it("KAN-140: six items from AI five + composite text", () => {
    const items = finalizeParsedItemsForRfq(aiFivePrefixed, KAN_140_RAW);
    expect(items).toHaveLength(6);
    expect(items[0].description).toBe("16-port unmanaged switch");
    expect(items[0].quantity).toBe(3);
    expect(items[5]).toMatchObject({
      description: "27-inch QHD monitor",
      quantity: 4,
    });
  });
});

const prismaUpdateMock = vi.fn();
const prismaFindMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rfq: {
      findUniqueOrThrow: (...args: unknown[]) => prismaFindMock(...args),
      update: (...args: unknown[]) => prismaUpdateMock(...args),
    },
  },
}));

const parseAiMock = vi.fn();

vi.mock("@/lib/ai/parse-rfq", () => ({
  parseRfqWithAi: (...args: unknown[]) => parseAiMock(...args),
  statusFromConfidence: () => "PARSED" as const,
}));

describe("parseAndUpdateRfq", () => {
  beforeEach(() => {
    prismaUpdateMock.mockReset();
    prismaFindMock.mockReset();
    parseAiMock.mockReset();
  });

  it("persists six finalized items after mocked AI returns five prefixed lines", async () => {
    const { parseAndUpdateRfq } = await import("@/lib/rfq");
    prismaFindMock.mockResolvedValue({
      id: "rfq-kan-140",
      rawText: KAN_140_RAW,
      subject: "",
      status: "PARSED",
      parsedCategory: "Misc",
      parsedSpecs: { items: aiFivePrefixed },
      productSelections: null,
    });
    parseAiMock.mockResolvedValue({
      productCategory: "NETWORKING",
      specs: {},
      items: aiFivePrefixed,
      language: "English",
      confidence: 0.9,
      summary: "Hardware RFQ",
    });
    prismaUpdateMock.mockImplementation(async ({ data }) => ({
      id: "rfq-kan-140",
      ...data,
      messages: [],
      quotes: [],
    }));

    const result = await parseAndUpdateRfq("rfq-kan-140");

    const specs = result.parsedSpecs as { items: Array<{ description: string }> };
    expect(specs.items).toHaveLength(6);
    expect(specs.items[0].description).toBe("16-port unmanaged switch");
    expect(specs.items[5].description).toBe("27-inch QHD monitor");
    expect(prismaUpdateMock).toHaveBeenCalledOnce();
  });
});