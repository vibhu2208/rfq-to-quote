const MIN_COMPANY_NAME = 4;

export type ClientIdentity = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  gstin?: string | null;
  email?: string | null;
};

export const CLIENT_BOOKS_BALANCE_NOTE =
  "Opening balance is the figure stored on the client master. A running balance and transaction history depend on Books, which is not available yet.";

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

/** Company names long enough to match quotes and leads without colliding. */
export function clientMatchNames(
  client: Pick<ClientIdentity, "legalName" | "tradeName">
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [client.legalName, client.tradeName]) {
    const name = clean(raw);
    if (name.length < MIN_COMPANY_NAME) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function equalsFold(left: string | null | undefined, right: string | null | undefined) {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  return Boolean(a) && a === b;
}

export function quoteMatchesClient(
  quote: {
    buyerCompany?: string | null;
    buyerGstin?: string | null;
    buyerEmail?: string | null;
    rfqPartyId?: string | null;
  },
  client: ClientIdentity
): boolean {
  if (quote.rfqPartyId && quote.rfqPartyId === client.id) return true;
  if (equalsFold(quote.buyerGstin, client.gstin)) return true;
  if (equalsFold(quote.buyerEmail, client.email)) return true;
  return clientMatchNames(client).some((name) =>
    equalsFold(quote.buyerCompany, name)
  );
}

export function leadMatchesClient(
  lead: {
    partyId?: string | null;
    customerCompany?: string | null;
    customerEmail?: string | null;
  },
  client: ClientIdentity
): boolean {
  if (lead.partyId && lead.partyId === client.id) return true;
  if (equalsFold(lead.customerEmail, client.email)) return true;
  return clientMatchNames(client).some((name) =>
    equalsFold(lead.customerCompany, name)
  );
}
