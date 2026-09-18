import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { getGspConfig, getGspProvider, type GstinVerification } from "@/lib/accounting/gsp";
import { writeAuditEvent } from "@/lib/accounting/audit";
import { getStateCode, getStateName } from "@/lib/accounting/states";
import type { Prisma } from "@prisma/client";

export type ParsedGstAddress = {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  district?: string | null;
  state: string;
  stateCode: string;
  postalCode: string;
};

/** Pull principal place of business from Sandbox/GSTN raw payload when present. */
export function parseAddressFromVerification(
  verification: GstinVerification
): ParsedGstAddress | null {
  const raw = verification.raw;
  if (!raw) {
    if (!verification.address) return null;
    return {
      addressLine1: verification.address,
      city: "",
      state: verification.stateName || "",
      stateCode: verification.stateCode || "",
      postalCode: "",
    };
  }

  const dataRoot = (raw.data as Record<string, unknown> | undefined) || raw;
  const taxpayer =
    dataRoot.data && typeof dataRoot.data === "object"
      ? (dataRoot.data as Record<string, unknown>)
      : dataRoot;
  const pradr = taxpayer.pradr as { addr?: Record<string, unknown> } | undefined;
  const addr = pradr?.addr;
  if (!addr || typeof addr !== "object") {
    if (!verification.address) return null;
    return {
      addressLine1: verification.address,
      city: "",
      state: verification.stateName || "",
      stateCode: verification.stateCode || "",
      postalCode: "",
    };
  }

  const line1 = [addr.bno, addr.bnm, addr.flno]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(", ");
  const line2 = [addr.st, addr.locality, addr.landMark]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(", ");
  const city = String(addr.loc || addr.dst || "").trim();
  const stateName = String(addr.stcd || verification.stateName || "").trim();
  const stateCode =
    verification.stateCode ||
    getStateCode(stateName) ||
    verification.gstin.slice(0, 2);
  const postalCode = String(addr.pncd || "").trim();

  return {
    addressLine1: line1 || verification.address || "Address on GST record",
    addressLine2: line2 || null,
    city: city || "",
    district: typeof addr.dst === "string" ? addr.dst : null,
    state: stateName || getStateName(stateCode) || "",
    stateCode,
    postalCode,
  };
}

async function upsertBillingAddress(partyId: string, address: ParsedGstAddress) {
  const existing = await prisma.address.findFirst({
    where: { partyId, type: "BILLING", isDefault: true },
  });
  const data = {
    type: "BILLING" as const,
    label: "GST principal place of business",
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || null,
    city: address.city,
    district: address.district || null,
    state: address.state,
    stateCode: address.stateCode,
    postalCode: address.postalCode || "",
    countryCode: "IN",
    isDefault: true,
  };
  if (existing) {
    await prisma.address.update({ where: { id: existing.id }, data });
  } else {
    await prisma.address.create({ data: { partyId, ...data } });
  }
}

export async function verifyAndStorePartyGstin(input: {
  gstin: string;
  partyId?: string;
  createPartyIfMissing?: boolean;
  legalNameHint?: string;
  email?: string;
  phone?: string;
  userId?: string;
}): Promise<{
  verification: GstinVerification;
  partyId?: string;
  address?: ParsedGstAddress | null;
  party?: Awaited<ReturnType<typeof loadParty>>;
}> {
  const ctx = await getDefaultOrgContext();
  const verification = await getGspProvider().verifyGstin(input.gstin);
  if (!verification.valid) {
    return { verification };
  }

  const address = parseAddressFromVerification(verification);
  const placeOfSupplyCode =
    verification.stateCode ||
    address?.stateCode ||
    getStateCode(verification.stateName || "") ||
    null;

  let partyId = input.partyId;
  if (partyId) {
    await prisma.party.update({
      where: { id: partyId },
      data: {
        gstin: verification.gstin,
        gstinVerifiedAt: new Date(),
        gstinLegalName: verification.legalName || verification.tradeName || undefined,
        gstinStatus: verification.status || "VERIFIED",
        gstinRawResponse: (verification.raw ?? {}) as Prisma.InputJsonValue,
        placeOfSupplyCode: placeOfSupplyCode || undefined,
        ...(verification.legalName ? { legalName: verification.legalName } : {}),
        ...(verification.tradeName ? { tradeName: verification.tradeName } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
      },
    });
    if (address) await upsertBillingAddress(partyId, address);
  } else if (input.createPartyIfMissing !== false) {
    const existing = await prisma.party.findFirst({
      where: { organisationId: ctx.organisationId, gstin: verification.gstin },
    });
    if (existing) {
      partyId = existing.id;
      await prisma.party.update({
        where: { id: existing.id },
        data: {
          gstinVerifiedAt: new Date(),
          gstinLegalName: verification.legalName || existing.gstinLegalName,
          gstinStatus: verification.status || "VERIFIED",
          gstinRawResponse: (verification.raw ?? {}) as Prisma.InputJsonValue,
          placeOfSupplyCode: placeOfSupplyCode || existing.placeOfSupplyCode,
          ...(verification.legalName ? { legalName: verification.legalName } : {}),
          ...(verification.tradeName ? { tradeName: verification.tradeName } : {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
        },
      });
      if (address) await upsertBillingAddress(partyId, address);
    } else {
      const count = await prisma.party.count({ where: { organisationId: ctx.organisationId } });
      const created = await prisma.party.create({
        data: {
          organisationId: ctx.organisationId,
          code: `C-${String(count + 1).padStart(4, "0")}`,
          type: "CUSTOMER",
          legalName: verification.legalName || input.legalNameHint || verification.gstin,
          tradeName: verification.tradeName,
          gstin: verification.gstin,
          email: input.email || null,
          phone: input.phone || null,
          placeOfSupplyCode,
          gstinVerifiedAt: new Date(),
          gstinLegalName: verification.legalName,
          gstinStatus: verification.status || "VERIFIED",
          gstinRawResponse: (verification.raw ?? {}) as Prisma.InputJsonValue,
          ...(address
            ? {
                addresses: {
                  create: {
                    type: "BILLING",
                    label: "GST principal place of business",
                    addressLine1: address.addressLine1,
                    addressLine2: address.addressLine2 || null,
                    city: address.city,
                    district: address.district || null,
                    state: address.state,
                    stateCode: address.stateCode,
                    postalCode: address.postalCode || "",
                    countryCode: "IN",
                    isDefault: true,
                  },
                },
              }
            : {}),
        },
      });
      partyId = created.id;
    }
  }

  await writeAuditEvent({
    organisationId: ctx.organisationId,
    actorUserId: input.userId,
    action: "GSTIN_VERIFIED",
    entityType: "Party",
    entityId: partyId || verification.gstin,
    after: verification,
  });

  const party = partyId ? await loadParty(partyId) : undefined;
  return { verification, partyId, address, party };
}

async function loadParty(id: string) {
  return prisma.party.findUniqueOrThrow({
    where: { id },
    include: { addresses: { orderBy: { createdAt: "asc" } } },
  });
}

export function getGstConfigurationSummary() {
  const cfg = getGspConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    mode: cfg.mode,
    hasCredentials: cfg.hasCredentials,
    baseUrlConfigured: Boolean(cfg.baseUrl),
    baseUrl: cfg.baseUrl || null,
    einvoiceNicConfigured: Boolean(
      process.env.GSP_EINVOICE_USERNAME?.trim() && process.env.GSP_EINVOICE_PASSWORD?.trim()
    ),
    companyGstin: process.env.COMPANY_GSTIN || null,
    sellerState: process.env.SELLER_STATE || null,
    workflow: {
      requireProformaBeforeTaxInvoice: true,
      requirePaymentBeforeTaxInvoice: true,
      paymentRule: "any_positive_payment_unlocks_conversion",
    },
  };
}

export { loadParty };
