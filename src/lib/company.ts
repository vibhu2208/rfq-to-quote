import { getStateCode, getStateName } from "@/lib/accounting/states";

export function getCompanyConfig() {
  const sellerState = process.env.SELLER_STATE || "Maharashtra";

  return {
    name: process.env.COMPANY_NAME || "Your Company",
    address: process.env.COMPANY_ADDRESS || "",
    gstin: process.env.COMPANY_GSTIN || "",
    email: process.env.COMPANY_EMAIL || "",
    phone: process.env.COMPANY_PHONE || "",
    mobile: process.env.COMPANY_MOBILE || process.env.COMPANY_PHONE || "",
    website: process.env.COMPANY_WEBSITE || "",
    signatory: process.env.COMPANY_SIGNATORY || "",
    paymentTerms: process.env.COMPANY_PAYMENT_TERMS || "Against Delivery",
    bankName: process.env.COMPANY_BANK_NAME || "",
    bankBranch: process.env.COMPANY_BANK_BRANCH || "",
    bankIfsc: process.env.COMPANY_BANK_IFSC || "",
    bankAccount: process.env.COMPANY_BANK_ACCOUNT || "",
    bankAccountType: process.env.COMPANY_BANK_ACCOUNT_TYPE || "",
    sellerState,
    sellerStateCode: getSellerStateCode(),
  };
}

/** Resolve seller GST state code from env (DB context can be wired in later). */
export function getSellerStateCode(): string {
  const fromEnv = getStateCode(process.env.SELLER_STATE || "Maharashtra");
  return fromEnv ?? "27";
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
