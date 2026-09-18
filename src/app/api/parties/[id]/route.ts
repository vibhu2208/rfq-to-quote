import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { verifyAndStorePartyGstin } from "@/lib/accounting/gstin";
import { getStateCode } from "@/lib/accounting/states";

type Params = { params: Promise<{ id: string }> };

function serializeParty(party: {
  id: string;
  code: string;
  type: string;
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  placeOfSupplyCode: string | null;
  gstinVerifiedAt: Date | null;
  gstinStatus: string | null;
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
    ...party,
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
