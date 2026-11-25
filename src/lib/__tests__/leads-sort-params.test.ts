import { describe, expect, it } from "vitest";
import { buildLeadsSearchParams } from "@/lib/leads/query";

describe("buildLeadsSearchParams sort", () => {
  it("sends created + asc so the API can reorder by created", () => {
    const params = buildLeadsSearchParams({
      sort: "created",
      dir: "asc",
    });
    expect(params.get("sort")).toBe("created");
    expect(params.get("dir")).toBe("asc");
  });
});