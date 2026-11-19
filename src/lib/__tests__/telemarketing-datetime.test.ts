import { describe, expect, it } from "vitest";
import {
  buildCallLoggedTimelineBody,
  formatFollowUpTimelineBody,
  formatTelemarketingInstant,
  validateFutureDateTime,
} from "@/lib/telemarketing/datetime";

describe("telemarketing datetime (IST)", () => {
  it("formats instants with time in IST", () => {
    const iso = "2026-11-02T03:30:00.000Z";
    expect(formatTelemarketingInstant(iso, { withTime: true })).toBe(
      "2 Nov 2026, 9:00 AM"
    );
  });

  it("formats follow-up timeline copy without raw ISO", () => {
    const body = formatFollowUpTimelineBody(new Date("2026-11-02T03:30:00.000Z"));
    expect(body).toContain("2 Nov 2026, 9:00 AM");
    expect(body).not.toContain("T03:30");
  });

  it("includes call note in logged call timeline body", () => {
    expect(buildCallLoggedTimelineBody("CONNECTED", "Spoke about boards")).toBe(
      "Call outcome: Connected\nSpoke about boards"
    );
  });

  it("rejects past follow-up times", () => {
    const past = new Date(Date.now() - 60_000);
    expect(validateFutureDateTime(past)).toBe("Follow-up must be in the future");
    const future = new Date(Date.now() + 60_000);
    expect(validateFutureDateTime(future)).toBeNull();
  });
});