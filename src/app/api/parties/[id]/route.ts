import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { verifyAndStorePartyGstin } from "@/lib/accounting/gstin";
import { getStateCode } from "@/lib/accounting/states";
import { decimalToNumber } from "@/lib/quotes";

type Params = { params: Promise<{ id: string }> };

function serializeParty(party: {
  id: string;
  code: string;
  type: string;
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  pan: string | null;
  tin: string | null;
  stNumber: string | null;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  fax: string | null;
  website: string | null;
  placeOfSupplyCode: string | null;
  gstinVerifiedAt: Date | null;
  gstinStatus: string | null;
  creditLimit: unknown;
  openingBalance: unknown;
  openingDrCr: string | null;
  clientTypeName: string | null;
  sourceClientId: string | null;
  ledgerGroup: string | null;
  ledgerCode: string | null;
  primaryGroup: string | null;
  remarks: string | null;
  bankName: string | null;
  bankIfsc: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  bankAccountType: string | null;
  bankBranch: string | null;
  micrCode: string | null;
  aadhaar: string | null;
  managedByName: string | null;
  isVendor: boolean;
  masterData: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  addresses: Array<{
    id: string;
    type: string;
    isDefault: boolean;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    district: string | null;
    state: string;
    stateCode: string;
    postalCode: string;
  }>;
}) {
  const billing =
    party.addresses.find((a) => a.type === "BILLING" && a.isDefault) ||
    party.addresses.find((a) => a.type === "BILLING") ||
    party.addresses[0] ||
    null;
  return {
    id: party.id,
    code: party.code,
    type: party.type,
    legalName: party.legalName,
    tradeName: party.tradeName,
    gstin: party.gstin,
    pan: party.pan,
    tin: party.tin,
    stNumber: party.stNumber,
    email: party.email,
    phone: party.phone,
    phone2: party.phone2,
    fax: party.fax,
    website: party.website,
    placeOfSupplyCode: party.placeOfSupplyCode,
    gstinVerifiedAt: party.gstinVerifiedAt,
    gstinStatus: party.gstinStatus,
    creditLimit: decimalToNumber(party.creditLimit),
    openingBalance: decimalToNumber(party.openingBalance),
    openingDrCr: party.openingDrCr,
    clientTypeName: party.clientTypeName,
    sourceClientId: party.sourceClientId,
    ledgerGroup: party.ledgerGroup,
    ledgerCode: party.ledgerCode,
    primaryGroup: party.primaryGroup,
    remarks: party.remarks,
    bankName: party.bankName,
    bankIfsc: party.bankIfsc,
    bankAccountNo: party.bankAccountNo,
    bankAccountName: party.bankAccountName,
    bankAccountType: party.bankAccountType,
    bankBranch: party.bankBranch,
    micrCode: party.micrCode,
    aadhaar: party.aadhaar,
    managedByName: party.managedByName,
    isVendor: party.isVendor,
    masterData: party.masterData,
    active: party.active,
    createdAt: party.createdAt,
    updatedAt: party.updatedAt,
    billingAddress: billing
      ? {
          id: billing.id,
          addressLine1: billing.addressLine1,
          addressLine2: billing.addressLine2,
          city: billing.city,
          district: billing.district,
          state: billing.state,
          stateCode: billing.stateCode,
          postalCode: billing.postalCode,
        }
      : null,
    addresses: party.addresses,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const party = await prisma.party.findUnique({
    where: { id },
    include: { addresses: true },
  });
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeParty(party));
}

const patchSchema = z.object({
  legalName: z.string().min(1).optional(),
  tradeName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  active: z.boolean().optional(),
  placeOfSupplyCode: z.string().optional().nullable(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional(),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  postalCode: z.string().optional(),
  reverifyGstin: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.party.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = parsed.data;
  if (data.reverifyGstin && existing.gstin) {
    const result = await verifyAndStorePartyGstin({
      gstin: existing.gstin,
      partyId: id,
      email: data.email || undefined,
      phone: data.phone || undefined,
      userId,
    });
    if (!result.verification.valid) {
      return NextResponse.json(
        { error: result.verification.message || "GSTIN re-verify failed", verification: result.verification },
        { status: 400 }
      );
    }
  }

  const stateCode =
    data.stateCode ||
    (data.state ? getStateCode(data.state) : null) ||
    existing.placeOfSupplyCode;

  await prisma.party.update({
    where: { id },
    data: {
      legalName: data.legalName,
      tradeName: data.tradeName === undefined ? undefined : data.tradeName,
      email: data.email === undefined ? undefined : data.email || null,
      phone: data.phone === undefined ? undefined : data.phone || null,
      active: data.active,
      placeOfSupplyCode:
        data.placeOfSupplyCode === undefined
          ? undefined
          : data.placeOfSupplyCode || stateCode,
    },
  });

  if (data.addressLine1) {
    const billing = await prisma.address.findFirst({
      where: { partyId: id, type: "BILLING" },
      orderBy: { createdAt: "asc" },
    });
    const addrData = {
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 ?? null,
      city: data.city || "",
      state: data.state || "",
      stateCode: stateCode || "",
      postalCode: data.postalCode || "",
      isDefault: true,
    };
    if (billing) {
      await prisma.address.update({ where: { id: billing.id }, data: addrData });
    } else {
      await prisma.address.create({
        data: { partyId: id, type: "BILLING", label: "Billing", ...addrData },
      });
    }
  }

  const party = await prisma.party.findUniqueOrThrow({
    where: { id },
    include: { addresses: true },
  });
  return NextResponse.json(serializeParty(party));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const party = await prisma.party.update({
    where: { id },
    data: { active: false },
    include: { addresses: true },
  });
  return NextResponse.json(serializeParty(party));
}
