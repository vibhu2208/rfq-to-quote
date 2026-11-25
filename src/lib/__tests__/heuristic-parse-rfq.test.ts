import { describe, expect, it } from "vitest";
import { parseRfqHeuristic } from "@/lib/heuristic-parse-rfq";

const SAMPLE = `Please quote:
• 16-port switch – 3 nos
• CAT6 patch cord 1 m – 50 pcs
• 24-port patch panel – 2 nos
• UPS – 5 nos
• 24" monitor – 15 nos
• 27" monitor – 4 nos`;

describe("parseRfqHeuristic", () => {
  it("extracts every bullet line with quantities", () => {
    const parsed = parseRfqHeuristic(SAMPLE, "Networking RFQ");
    expect(parsed.items.length).toBe(6);
    expect(parsed.items.find((i) => /switch/i.test(i.description || ""))?.quantity).toBe(3);
    expect(parsed.items.find((i) => /patch cord/i.test(i.description || ""))?.quantity).toBe(
      50
    );
  });

  it("parses comma-separated six-item enquiries", () => {
    const parsed = parseRfqHeuristic(
      `Please quote for: 16-port switch ×3, CAT6 patch cord 1 m ×50, 24-port patch panel ×2, UPS ×5, 24" monitor – 15 nos, 27" monitor – 4 nos`,
      "Networking RFQ"
    );
    expect(parsed.items.length).toBe(6);
  });

  it("KAN-140: heuristic parse keeps six semicolon lines with exact quantities", () => {
    const text =
      "16-port switch x3; CAT6 patch cord 1 m x50; 24-port patch panel x2; 1000 VA / 1 kVA UPS x5; 24-inch FHD IPS monitor, qty 15; 27-inch QHD monitor x4";
    const parsed = parseRfqHeuristic(text, "Networking RFQ");
    expect(parsed.items.length).toBe(6);
    expect(parsed.items.map((row) => row.quantity)).toEqual([3, 50, 2, 5, 15, 4]);
  });

  it("parses × counts and qty suffixes in plain lines", () => {
    const parsed = parseRfqHeuristic(
      `Requirements:\n24-port switch ×3\nCAT6 patch cord 1 m ×50\n- UPS 5 nos\nqty: 2 patch panels`,
      "Networking"
    );
    expect(parsed.items.length).toBeGreaterThanOrEqual(4);
    expect(parsed.items.find((i) => /switch/i.test(i.description || ""))?.quantity).toBe(3);
    expect(parsed.items.find((i) => /patch cord/i.test(i.description || ""))?.quantity).toBe(50);
  });
});