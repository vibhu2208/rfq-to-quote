/** Reject datetimes in the past (30s grace for clock skew). */
export function validateFutureDateTime(d: Date, now: Date = new Date()): string | null {
  if (d.getTime() < now.getTime() - 30_000) {
    return "Follow-up must be in the future";
  }
  return null;
}