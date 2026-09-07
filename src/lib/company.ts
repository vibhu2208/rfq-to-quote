export function getCompanyConfig() {
  return {
    name: process.env.COMPANY_NAME || "Your Company",
    address: process.env.COMPANY_ADDRESS || "",
    gstin: process.env.COMPANY_GSTIN || "",
    email: process.env.COMPANY_EMAIL || "",
    phone: process.env.COMPANY_PHONE || "",
    sellerState: process.env.SELLER_STATE || "Maharashtra",
  };
}

export { INDIAN_STATES } from "@/lib/states";
