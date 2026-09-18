import type { Prisma, PrismaClient } from "@prisma/client";
import { getStateCode } from "@/lib/accounting/states";

type DbClient = Prisma.TransactionClient | PrismaClient;

export async function findOrCreateCustomerFromBuyer(
  tx: DbClient,
  organisationId: string,
  buyer: {
    buyerName?: string;
    buyerCompany?: string;
    buyerEmail?: string;
    buyerPhone?: string;
    buyerState?: string;
    buyerAddress?: string;
    buyerGstin?: string;
  }
) {
  const legalName = (buyer.buyerCompany || buyer.buyerName || "Walk-in Customer").trim();
  const email = buyer.buyerEmail?.trim().toLowerCase() || null;
  const gstin = buyer.buyerGstin?.trim().toUpperCase() || null;
  const placeOfSupplyCode = buyer.buyerState ? getStateCode(buyer.buyerState) : null;

  if (gstin) {
    const byGstin = await tx.party.findFirst({
      where: { organisationId, gstin },
    });
    if (byGstin) return byGstin;
  }
  if (email) {
    const byEmail = await tx.party.findFirst({
      where: { organisationId, email, type: { in: ["CUSTOMER", "BOTH"] } },
    });
    if (byEmail) return byEmail;
  }

  const existing = await tx.party.findFirst({
    where: { organisationId, legalName, type: { in: ["CUSTOMER", "BOTH"] } },
  });
  if (existing) return existing;

  const count = await tx.party.count({ where: { organisationId } });
  const code = `C-${String(count + 1).padStart(4, "0")}`;

  return tx.party.create({
    data: {
      organisationId,
      code,
      type: "CUSTOMER",
      legalName,
      tradeName: buyer.buyerName || legalName,
      email,
      phone: buyer.buyerPhone || null,
      gstin,
      placeOfSupplyCode,
      addresses: {
        create: {
          type: "BILLING",
          addressLine1: buyer.buyerAddress || "Address not provided",
          city: "",
          state: buyer.buyerState || "",
          stateCode: placeOfSupplyCode || "",
          postalCode: "",
          countryCode: "IN",
          isDefault: true,
        },
      },
    },
  });
}

export function partyBillingSnapshot(party: {
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  placeOfSupplyCode: string | null;
  addresses?: Array<{
    type: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    stateCode: string;
    postalCode: string;
  }>;
}) {
  const billing = party.addresses?.find((a) => a.type === "BILLING") ?? party.addresses?.[0];
  return {
    legalName: party.legalName,
    tradeName: party.tradeName,
    gstin: party.gstin,
    email: party.email,
    phone: party.phone,
    placeOfSupplyCode: party.placeOfSupplyCode,
    address: billing
      ? {
          line1: billing.addressLine1,
          line2: billing.addressLine2,
          city: billing.city,
          state: billing.state,
          stateCode: billing.stateCode,
          postalCode: billing.postalCode,
        }
      : null,
  };
}

/** Alias matching quote-domain naming. */
export const findOrCreateCustomerFromQuoteBuyer = findOrCreateCustomerFromBuyer;
