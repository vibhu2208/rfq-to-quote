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
});