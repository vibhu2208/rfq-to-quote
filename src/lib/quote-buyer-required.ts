/** Buyer fields required before generating or sending a quote PDF. */
export type BuyerRequiredFields = {
  buyerCompany?: string | null;
  buyerAddress?: string | null;
  buyerState?: string | null;
};

export class BuyerRequiredError extends Error {
  readonly gaps: string[];

  constructor(gaps: string[]) {
    super(buyerRequiredMessage(gaps));
    this.name = "BuyerRequiredError";
    this.gaps = gaps;
  }
}

/** Labels matching the quote editor buyer-gap copy. */
export function buyerRequiredGaps(buyer: BuyerRequiredFields): string[] {
  const gaps: string[] = [];
  if (!buyer.buyerCompany?.trim()) gaps.push("company name");
  if (!buyer.buyerAddress?.trim()) gaps.push("address");
  if (!buyer.buyerState?.trim()) gaps.push("state");
  return gaps;
}

export function buyerRequiredMessage(gaps: string[]): string {
  if (gaps.length === 0) return "";
  return `Fill ${gaps.join(", ")} before continuing.`;
}

/** Throws BuyerRequiredError when company, address, or state is blank. */
export function assertBuyerReadyForExport(buyer: BuyerRequiredFields): void {
  const gaps = buyerRequiredGaps(buyer);
  if (gaps.length > 0) throw new BuyerRequiredError(gaps);
}
