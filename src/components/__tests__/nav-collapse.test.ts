import { describe, expect, it } from "vitest";
import {
  NAV_COLLAPSE_HYSTERESIS_PX,
  NAV_HAMBURGER_RESERVE_PX,
  navLinksAvailableWidth,
  nextNavCompactState,
} from "@/components/nav-collapse";

describe("nav-collapse", () => {
  it("always reserves hamburger width in the link budget", () => {
    const available = navLinksAvailableWidth(1164, 120, 200, 12);
    expect(available).toBe(1164 - 120 - 200 - 24 - NAV_HAMBURGER_RESERVE_PX);
  });

  it("collapses when needed exceeds available and expands only with hysteresis slack", () => {
    const available = 900;
    const needed = 901;
    expect(nextNavCompactState(false, needed, available)).toBe(true);
    expect(nextNavCompactState(true, needed, available)).toBe(true);

    expect(
      nextNavCompactState(
        true,
        available - NAV_COLLAPSE_HYSTERESIS_PX - 1,
        available
      )
    ).toBe(false);
  });

  it("stays stable across repeated measure/sync cycles near 110% zoom (~1164px)", () => {
    const bar = 1164;
    const brand = 148;
    const user = 220;
    const available = navLinksAvailableWidth(bar, brand, user, 12);
  const roomyNeeded = available - NAV_COLLAPSE_HYSTERESIS_PX - 4;

    let compact = false;
    for (let i = 0; i < 24; i++) {
      compact = nextNavCompactState(compact, roomyNeeded, available);
    }
    expect(compact).toBe(false);

    const tightNeeded = available + 1;
    compact = false;
    for (let i = 0; i < 24; i++) {
      compact = nextNavCompactState(compact, tightNeeded, available);
    }
    expect(compact).toBe(true);
  });
});