import { describe, expect, it } from "vitest";
import { ADMIN_TOOL_DEFINITIONS } from "@/lib/ai/admin-tools";

describe("catalog_search tool", () => {
  it("KAN-21: exposes a catalog search that is not stock balances", () => {
    const tool = ADMIN_TOOL_DEFINITIONS.find((entry) => entry.function.name === "catalog_search");
    expect(tool).toBeTruthy();
    expect(tool?.function.description.toLowerCase()).toContain("catalog");
    expect(tool?.function.description.toLowerCase()).toContain("not stock");
    const stock = ADMIN_TOOL_DEFINITIONS.find((entry) => entry.function.name === "stock_balances");
    expect(stock?.function.description.toLowerCase()).toContain("catalog_search");
  });
});
