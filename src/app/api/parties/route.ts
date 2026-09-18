import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { verifyAndStorePartyGstin } from "@/lib/accounting/gstin";
import { getStateCode } from "@/lib/accounting/states";
import { isAccountingError } from "@/lib/accounting/errors";

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
} | null) {
  if (!party) return null;
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
    email: party.email,
    phone: party.phone,
    placeOfSupplyCode: party.placeOfSupplyCode,
    gstinVerifiedAt: party.gstinVerifiedAt,
    gstinStatus: party.gstinStatus,
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

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const activeParam = url.searchParams.get("active");

  const ctx = await getDefaultOrgContext();
  const parties = await prisma.party.findMany({
    where: {
      organisationId: ctx.organisationId,
      type: { in: ["CUSTOMER", "BOTH"] },
      ...(activeParam === "true"
        ? { active: true }
        : activeParam === "false"
          ? { active: false }
          : {}),
      ...(q
        ? {
            OR: [
              { legalName: { contains: q, mode: "insensitive" } },
              { tradeName: { contains: q, mode: "insensitive" } },
              { gstin: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { addresses: true },
    orderBy: [{ active: "desc" }, { legalName: "asc" }],
    take: 200,
  });

  return NextResponse.json(parties.map(serializeParty));
}

const onboardSchema = z.object({
  gstin: z.string().length(15),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  /** If false, only fetch portal details without saving. Default true. */
  save: z.boolean().optional().default(true),
});

const createManualSchema = z.object({
  legalName: z.string().min(1),
  tradeName: z.string().optional(),
  gstin: z.string().length(15).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  placeOfSupplyCode: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  postalCode: z.string().optional(),
  verifyGstin: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const body = await req.json();
  const mode = body?.mode === "manual" ? "manual" : "gstin";

  try {
    if (mode === "gstin") {
      const parsed = onboardSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      const result = await verifyAndStorePartyGstin({
        gstin: parsed.data.gstin.toUpperCase(),
        createPartyIfMissing: parsed.data.save !== false,
        email: parsed.data.email || undefined,
        phone: parsed.data.phone || undefined,
        userId,
      });

      if (!result.verification.valid) {
        return NextResponse.json(
          { error: result.verification.message || "Invalid GSTIN", verification: result.verification },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          verification: result.verification,
          address: result.address,
          party: result.party ? serializeParty(result.party) : null,
        },
        { status: parsed.data.save === false ? 200 : 201 }
      );
    }

    const parsed = createManualSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    if (data.verifyGstin && data.gstin) {
      const result = await verifyAndStorePartyGstin({
        gstin: data.gstin.toUpperCase(),
        createPartyIfMissing: true,
        legalNameHint: data.legalName,
        email: data.email || undefined,
        phone: data.phone || undefined,
        userId,
      });
      if (!result.verification.valid) {
        return NextResponse.json(
          { error: result.verification.message || "Invalid GSTIN", verification: result.verification },
          { status: 400 }
        );
      }
      // Allow contact overrides after portal fetch
      if (result.partyId && (data.email || data.phone)) {
        await prisma.party.update({
          where: { id: result.partyId },
          data: {
            email: data.email || undefined,
            phone: data.phone || undefined,
          },
        });
      }
      const party = result.partyId
        ? await prisma.party.findUniqueOrThrow({
            where: { id: result.partyId },
            include: { addresses: true },
          })
        : null;
      return NextResponse.json(
        { verification: result.verification, party: serializeParty(party) },
        { status: 201 }
      );
    }

    const ctx = await getDefaultOrgContext();
    const count = await prisma.party.count({ where: { organisationId: ctx.organisationId } });
    const stateCode =
      data.stateCode ||
      getStateCode(data.state || "") ||
      (data.gstin ? data.gstin.slice(0, 2) : null);

    const party = await prisma.party.create({
      data: {
        organisationId: ctx.organisationId,
        code: `C-${String(count + 1).padStart(4, "0")}`,
        type: "CUSTOMER",
        legalName: data.legalName,
        tradeName: data.tradeName || null,
        gstin: data.gstin ? data.gstin.toUpperCase() : null,
        email: data.email || null,
        phone: data.phone || null,
        placeOfSupplyCode: data.placeOfSupplyCode || stateCode,
        ...(data.addressLine1
          ? {
              addresses: {
                create: {
                  type: "BILLING",
                  label: "Billing",
                  addressLine1: data.addressLine1,
                  addressLine2: data.addressLine2 || null,
                  city: data.city || "",
                  state: data.state || "",
                  stateCode: stateCode || "",
                  postalCode: data.postalCode || "",
                  countryCode: "IN",
                  isDefault: true,
                },
              },
            }
          : {}),
      },
      include: { addresses: true },
    });

    return NextResponse.json({ party: serializeParty(party) }, { status: 201 });
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("POST /api/parties failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save client" },
      { status: 500 }
    );
  }
}
