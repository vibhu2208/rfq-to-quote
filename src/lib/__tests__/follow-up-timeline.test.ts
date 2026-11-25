import { describe, expect, it } from "vitest";
import {
  followUpCompletedTimelineTitle,
  followUpScheduledTimelineTitle,
} from "@/lib/leads/follow-up-timeline";

describe("follow-up timeline copy", () => {
  it("KAN-141: builds scheduled and completed optimistic titles", () => {
    const due = new Date("2026-11-25T15:30:00.000Z");
    expect(followUpScheduledTimelineTitle("CALL", due)).toMatch(
      /^Call scheduled — due .+/
    );
    expect(followUpCompletedTimelineTitle("CALL")).toBe("Call completed");
  });
});