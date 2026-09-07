import { QuoteBuilder } from "@/components/quote-builder";
import { getCompanyConfig } from "@/lib/company";

export default function NewQuotePage() {
  const company = getCompanyConfig();
  return <QuoteBuilder sellerState={company.sellerState} />;
}
