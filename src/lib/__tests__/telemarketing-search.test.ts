import { describe, expect, it } from "vitest";
import { escapeLikePattern, telemarketingSearchPattern } from "@/lib/telemarketing/search";
import { formatTelemarketingTimelineText } from "@/lib/telemarketing/timeline-text";
import { isTelemarketingBoardTag } from "@/lib/telemarketing/tag-groups";

describe("telemarketing search", () => {
  it("escapes LIKE metacharacters", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(telemarketingSearchPattern("%")).toBe("%\\%%");
  });
});

describe("telemarketing timeline text", () => {
  it("formats embedded ISO timestamps", () => {
    const body = "Callback at 2026-11-02T03:30:00.000Z";
    const out = formatTelemarketingTimelineText(body);
    expect(out).not.toContain("2026-11-02T03:30:00.000Z");
    expect(out).toContain("Callback at");
  });
});

describe("telemarketing tag groups", () => {
  it("classifies board tags", () => {
    expect(isTelemarketingBoardTag("CBSE")).toBe(true);
    expect(isTelemarketingBoardTag("agra")).toBe(false);
  });
});