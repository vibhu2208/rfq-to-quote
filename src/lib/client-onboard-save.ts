import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import {
  ensureOnePrimaryContact,
  partyContactOrderBy,
  syncPartyFromPrimaryContact,
} from "@/lib/party-contacts";
import type { OnboardContact, PartyOnboardPayload } from "@/lib/client-onboard";

function decimalOrZero(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "0";
}

export async function applyPartyOnboardPayload(partyId: string, payload: PartyOnboardPayload) {
  const existing = await prisma.party.findUnique({
    where: { id: partyId },
    select: { masterData: true, sourceClientId: true },
  });
  const previous =
    existing?.masterData && typeof existing.masterData === "object" && !Array.isArray(existing.masterData)
      ? (existing.masterData as Record<string, unknown>)
      : {};

  await prisma.party.update({
    where: { id: partyId },
    data: {
      sourceClientId: payload.sourceClientId ?? existing?.sourceClientId ?? null,
      legalName: payload.legalName || undefined,
      tradeName: payload.tradeName,
      clientTypeName: payload.clientTypeName,
      gstin: payload.gstin,
      pan: payload.pan,
      tin: payload.tin,
      stNumber: payload.stNumber,
      aadhaar: payload.aadhaar,
      placeOfSupplyCode: payload.placeOfSupplyCode,
      email: payload.email,
      phone: payload.phone,
      phone2: payload.phone2,
      fax: payload.fax,
      website: payload.website,
      ledgerCode: payload.ledgerCode,
      ledgerGroup: payload.ledgerGroup,
      primaryGroup: payload.primaryGroup,
      openingBalance: decimalOrZero(payload.openingBalance),
      openingDrCr: payload.openingDrCr,
      managedByName: payload.managedByName,
      remarks: payload.remarks,
      bankName: payload.bankName,
      bankBranch: payload.bankBranch,
      bankIfsc: payload.bankIfsc,
      bankAccountNo: payload.bankAccountNo,
      bankAccountType: payload.bankAccountType,
      bankAccountName: payload.bankAccountName,
      micrCode: payload.micrCode,
      isVendor: payload.isVendor,
      masterData: { ...previous, ...payload.masterData } as Prisma.InputJsonValue,
    },
  });

  if (payload.address) {
    const existing = await prisma.address.findFirst({
      where: { partyId, type: "BILLING" },
      orderBy: { isDefault: "desc" },
    });
    const addr = {
      addressLine1: payload.address.addressLine1,
      addressLine2: payload.address.addressLine2,
      city: payload.address.city,
      district: payload.address.district,
      state: payload.address.state,
      stateCode: payload.address.stateCode,
      postalCode: payload.address.postalCode,
      countryCode: payload.address.countryCode || "IN",
      isDefault: true,
    };
    if (existing) {
      await prisma.address.update({ where: { id: existing.id }, data: addr });
    } else {
      await prisma.address.create({
        data: { partyId, type: "BILLING", label: "Billing", ...addr },
      });
    }
  }

  await saveOnboardContacts(partyId, payload.contacts);
}

export async function createPartyFromOnboard(payload: PartyOnboardPayload) {
  const ctx = await getDefaultOrgContext();
  const count = await prisma.party.count({ where: { organisationId: ctx.organisationId } });
  const created = await prisma.party.create({
    data: {
      organisationId: ctx.organisationId,
      code: `C-${String(count + 1).padStart(4, "0")}`,
      type: "CUSTOMER",
      legalName: payload.legalName,
      tradeName: payload.tradeName,
      sourceClientId: payload.sourceClientId,
      clientTypeName: payload.clientTypeName,
      gstin: payload.gstin,
      pan: payload.pan,
      tin: payload.tin,
      stNumber: payload.stNumber,
      aadhaar: payload.aadhaar,
      placeOfSupplyCode: payload.placeOfSupplyCode,
      email: payload.email,
      phone: payload.phone,
      phone2: payload.phone2,
      fax: payload.fax,
      website: payload.website,
      ledgerCode: payload.ledgerCode,
      ledgerGroup: payload.ledgerGroup,
      primaryGroup: payload.primaryGroup,
      openingBalance: decimalOrZero(payload.openingBalance),
      openingDrCr: payload.openingDrCr,
      managedByName: payload.managedByName,
      remarks: payload.remarks,
      bankName: payload.bankName,
      bankBranch: payload.bankBranch,
      bankIfsc: payload.bankIfsc,
      bankAccountNo: payload.bankAccountNo,
      bankAccountType: payload.bankAccountType,
      bankAccountName: payload.bankAccountName,
      micrCode: payload.micrCode,
      isVendor: payload.isVendor,
      masterData: payload.masterData as Prisma.InputJsonValue,
      ...(payload.address
        ? {
            addresses: {
              create: {
                type: "BILLING" as const,
                label: "Billing",
                addressLine1: payload.address.addressLine1,
                addressLine2: payload.address.addressLine2,
                city: payload.address.city,
                district: payload.address.district,
                state: payload.address.state,
                stateCode: payload.address.stateCode,
                postalCode: payload.address.postalCode,
                countryCode: payload.address.countryCode || "IN",
                isDefault: true,
              },
            },
          }
        : {}),
    },
  });

  await saveOnboardContacts(created.id, payload.contacts);

  return created.id;
}

export async function saveOnboardContacts(partyId: string, contacts: OnboardContact[]) {
  const rows = contacts.filter((c) => c.name || c.email || c.phone);
  if (rows.length === 0) return;

  const existing = await prisma.partyContact.findMany({ where: { partyId } });
  if (existing.length === 0) {
    await prisma.partyContact.createMany({
      data: rows.map((c, i) => ({
        partyId,
        name: c.name || "Contact",
        designation: c.designation,
        email: c.email,
        phone: c.phone,
        isPrimary: c.isPrimary || i === 0,
      })),
    });
    await ensureOnePrimaryContact(partyId);
    await syncPartyFromPrimaryContact(partyId);
    return;
  }

  const seen = new Set(
    existing.map((c) => `${c.name.trim().toLowerCase()}|${c.email.trim().toLowerCase()}`)
  );
  for (const row of rows) {
    const key = `${row.name.trim().toLowerCase()}|${row.email.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.partyContact.create({
      data: {
        partyId,
        name: row.name || "Contact",
        designation: row.designation,
        email: row.email,
        phone: row.phone,
        isPrimary: false,
      },
    });
  }
  await ensureOnePrimaryContact(partyId);
}

export async function loadOnboardedParty(partyId: string) {
  return prisma.party.findUniqueOrThrow({
    where: { id: partyId },
    include: { addresses: true, contacts: { orderBy: partyContactOrderBy } },
  });
}
