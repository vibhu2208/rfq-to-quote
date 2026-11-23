/** Space always reserved for the compact-menu control in the width budget. */
export const NAV_HAMBURGER_RESERVE_PX = 36;

/** Expand inline nav only when the full link row fits with this extra slack. */
export const NAV_COLLAPSE_HYSTERESIS_PX = 48;

export function navLinksAvailableWidth(
  barClientWidth: number,
  brandWidth: number,
  userSlotWidth: number,
  gapPx = 12
): number {
  return (
    barClientWidth -
    brandWidth -
    userSlotWidth -
    gapPx * 2 -
    NAV_HAMBURGER_RESERVE_PX
  );
}

export function nextNavCompactState(
  compact: boolean,
  neededWidth: number,
  availableWidth: number
): boolean {
  if (compact) {
    return neededWidth + NAV_COLLAPSE_HYSTERESIS_PX < availableWidth
      ? false
      : true;
  }
  return neededWidth > availableWidth;
}