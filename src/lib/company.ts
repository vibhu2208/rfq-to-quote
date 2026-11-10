import {
  GST_STATE_CODES,
  getStateCode,
  getStateName,
} from "@/lib/accounting/states";
import { DEFAULT_QUOTE_SERVICES, DEFAULT_QUOTE_TAGLINE } from "@/lib/quote-format";

function sellerStateCodeFromGstin(gstin: string): string | null {
  const raw = gstin.trim().toUpperCase();
  if (raw.length < 2) return null;
  const code = raw.slice(0, 2);
  return GST_STATE_CODES[code] ? code : null;
}

function sellerStateCodeFromAddress(address: string): string | null {
  const hay = address.toLowerCase();
  if (!hay.trim()) return null;
  // Longer names first so "Himachal Pradesh" wins over "Pradesh" fragments.
  const names = Object.values(GST_STATE_CODES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (hay.includes(name.toLowerCase())) {
      return getStateCode(name);
    }
  }
  return null;
}

export function getCompanyConfig() {
  const sellerStateCode = getSellerStateCode();
  const sellerState =
    getStateName(sellerStateCode) ||
    process.env.SELLER_STATE?.trim() ||
    "Maharashtra";

  return {
    name: process.env.COMPANY_NAME || "Your Company",
    tagline: process.env.COMPANY_TAGLINE || DEFAULT_QUOTE_TAGLINE,
    services: process.env.COMPANY_SERVICES || DEFAULT_QUOTE_SERVICES,
    address: process.env.COMPANY_ADDRESS || "",
    gstin: process.env.COMPANY_GSTIN || "",
    email: process.env.COMPANY_EMAIL || "",
    phone: process.env.COMPANY_PHONE || "",
    mobile: process.env.COMPANY_MOBILE || process.env.COMPANY_PHONE || "",
    website: process.env.COMPANY_WEBSITE || "",
    signatory: process.env.COMPANY_SIGNATORY || "Gopal Agrawal",
    paymentTerms: process.env.COMPANY_PAYMENT_TERMS || "Against Delivery",
    bankName: process.env.COMPANY_BANK_NAME || "",
    bankBranch: process.env.COMPANY_BANK_BRANCH || "",
    bankIfsc: process.env.COMPANY_BANK_IFSC || "",
    bankAccount: process.env.COMPANY_BANK_ACCOUNT || "",
    bankAccountType: process.env.COMPANY_BANK_ACCOUNT_TYPE || "",
    sellerState,
    sellerStateCode,
  };
}

/**
 * Resolve seller GST state code for Auto IGST/CGST.
 * Prefer COMPANY_GSTIN (location of supplier), then SELLER_STATE, then address.
 * Never let a missing SELLER_STATE default to Maharashtra when GSTIN says otherwise.
 */
export function getSellerStateCode(): string {
  const fromGstin = sellerStateCodeFromGstin(process.env.COMPANY_GSTIN || "");
  if (fromGstin) return fromGstin;

  const fromEnv = getStateCode((process.env.SELLER_STATE || "").trim());
  if (fromEnv) return fromEnv;

  const fromAddress = sellerStateCodeFromAddress(process.env.COMPANY_ADDRESS || "");
  if (fromAddress) return fromAddress;

  return "27";
}

/** Optional async enrichment from DEFAULT org context — keeps env fallback. */
export async function getCompanyConfigWithContext() {
  const envConfig = getCompanyConfig();

  try {
    const { getDefaultOrgContext } = await import("@/lib/accounting/context");
    const ctx = await getDefaultOrgContext();

    return {
      ...envConfig,
      name: ctx.organisationName || envConfig.name,
      gstin: ctx.gstin || envConfig.gstin,
      sellerState: getStateName(ctx.stateCode) || envConfig.sellerState,
      sellerStateCode: ctx.stateCode,
      organisationId: ctx.organisationId,
      gstRegistrationId: ctx.gstRegistrationId,
      warehouseId: ctx.warehouseId,
      legalEntityId: ctx.legalEntityId,
    };
  } catch {
    return envConfig;
  }
}

export { INDIAN_STATES } from "@/lib/states";
