export function partyInitials(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0] || "")
    .join("")
    .toLowerCase();
}

export function looksLikeInitials(q: string): boolean {
  return /^[a-zA-Z0-9]{2,8}$/.test(q.trim());
}

export function scorePartySearchHit(
  party: { legalName: string; tradeName: string | null; code: string; gstin: string | null },
  q: string
): number {
  const ql = q.toLowerCase().trim();
  if (!ql) return 0;

  const legal = party.legalName.toLowerCase();
  const trade = (party.tradeName || "").toLowerCase();
  const code = (party.code || "").toLowerCase();
  const gstin = (party.gstin || "").toLowerCase();
  const legalInitials = partyInitials(party.legalName);
  const tradeInitials = partyInitials(party.tradeName || "");

  let score = 0;
  if (legal === ql || trade === ql) score += 200;
  else if (legal.startsWith(ql) || trade.startsWith(ql)) score += 140;
  else if (legal.includes(ql) || trade.includes(ql)) score += 90;

  if (legalInitials === ql || tradeInitials === ql) score += 170;
  else if (legalInitials.startsWith(ql) || tradeInitials.startsWith(ql)) score += 120;

  if (code === ql) score += 80;
  else if (code.includes(ql)) score += 40;
  if (gstin.includes(ql)) score += 50;

  return score;
}

export function rankPartiesByQuery<
  T extends { legalName: string; tradeName: string | null; code: string; gstin: string | null },
>(parties: T[], q: string): T[] {
  const trimmed = q.trim();
  if (!trimmed) return parties;
  return [...parties].sort((a, b) => {
    const diff = scorePartySearchHit(b, trimmed) - scorePartySearchHit(a, trimmed);
    if (diff !== 0) return diff;
    return a.legalName.localeCompare(b.legalName);
  });
}
