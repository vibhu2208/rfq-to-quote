import { describe, expect, it } from "vitest";
import {
  parseLocalDateTimeValue,
  toLocalDateTimeValue,
} from "@/components/ui/date-time-picker";

describe("local datetime values", () => {
  it("round-trips an instant through datetime-local without a timezone shift", () => {
    const instant = new Date("2026-11-20T04:30:00.000Z");
    const local = toLocalDateTimeValue(instant);
    const back = parseLocalDateTimeValue(local);
    expect(back?.toISOString()).toBe(instant.toISOString());
    if (instant.getTimezoneOffset() !== 0) {
      expect(local).not.toBe(instant.toISOString().slice(0, 16));
    }
  });
});
