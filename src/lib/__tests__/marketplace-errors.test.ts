import { describe, expect, it } from "vitest";
import { friendlyMarketplaceSourceError } from "@/lib/marketplace/errors";

describe("marketplace errors", () => {
  it("KAN-42: hides Apify concurrent-runs JSON", () => {
    const msg = friendlyMarketplaceSourceError(
      "Flipkart",
      '{"error":"concurrent-runs-limit","message":"too many runs"}'
    );
    expect(msg).toMatch(/Flipkart is busy/i);
    expect(msg).not.toMatch(/concurrent-runs/);
  });
});