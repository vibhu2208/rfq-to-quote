import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { getDefaultOrgContext, getDefaultOrganisationId } from "@/lib/accounting/context";
import { verifyAndStorePartyGstin } from "@/lib/accounting/gstin";
import { getStateCode } from "@/lib/accounting/states";
import { isAccountingError } from "@/lib/accounting/errors";
import { rankPartiesByQuery } from "@/lib/party-search";
import {
  partyContactOrderBy,
  partyContactSelect,
  serializePartyContacts,
  upsertPrimaryContactFromFields,
  type PartyContactRecord,
} from "@/lib/party-contacts";
import { formToPartyPayload } from "@/lib/client-onboard";
import {
  applyPartyOnboardPayload,
  createPartyFromOnboard,
  loadOnboardedParty,
} from "@/lib/client-onboard-save";

function serializeParty(
  party: {
    id: string;
    code: string;
    type: string;
    legalName: string;
    tradeName: string | null;
    gstin: string | null;
    pan?: string | null;
    email: string | null;
    phone: string | null;
    phone2?: string | null;
    website?: string | null;
    placeOfSupplyCode: string | null;
    gstinVerifiedAt: Date | null;
    gstinStatus: string | null;
    clientTypeName?: string | null;
    sourceClientId?: string | null;
    ledgerGroup?: string | null;
    managedByName?: string | null;
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
    contacts?: PartyContactRecord[];
  } | null
) {
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
    pan: party.pan ?? null,
    email: party.email,
    phone: party.phone,
    phone2: party.phone2 ?? null,
    website: party.website ?? null,
    placeOfSupplyCode: party.placeOfSupplyCode,
    gstinVerifiedAt: party.gstinVerifiedAt,
    gstinStatus: party.gstinStatus,
    clientTypeName: party.clientTypeName ?? null,
    sourceClientId: party.sourceClientId ?? null,
    ledgerGroup: party.ledgerGroup ?? null,
    managedByName: party.managedByName ?? null,
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
    contacts: serializePartyContacts(party.contacts),
  };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const activeParam = url.searchParams.get("active");
  const takeParam = url.searchParams.get("take");
  const take = takeParam
    ? Math.min(Math.max(Number(takeParam) || 12, 1), 5000)
    : 5000;

  const autocomplete = Boolean(takeParam) && take <= 50;

  if (autocomplete) {
    const organisationId = await getDefaultOrganisationId();
    const parties = await prisma.party.findMany({
      where: {
        organisationId,
        type: { not: "OTHER" },
        ...(activeParam === "true"
          ? { active: true }
          : activeParam === "false"
            ? { active: false }
            : {}),
        ...(q
          ? {
              OR: [
                { legalName: { startsWith: q, mode: "insensitive" } },
                { tradeName: { startsWith: q, mode: "insensitive" } },
                { code: { startsWith: q, mode: "insensitive" } },
                { gstin: { startsWith: q, mode: "insensitive" } },
                { sourceClientId: { startsWith: q, mode: "insensitive" } },
                { managedByName: { contains: q, mode: "insensitive" } },
                {
                  contacts: {
                    some: {
                      OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { email: { contains: q, mode: "insensitive" } },
                        { phone: { contains: q, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        legalName: true,
        tradeName: true,
        gstin: true,
        email: true,
        phone: true,
        managedByName: true,
        clientTypeName: true,
        sourceClientId: true,
        contacts: {
          select: partyContactSelect,
          orderBy: partyContactOrderBy,
        },
      },
      orderBy: { legalName: "asc" },
      take,
    });
    const ranked = q ? rankPartiesByQuery(parties, q) : parties;
    return NextResponse.json(
      ranked.map((p) => ({
        ...p,
        billingAddress: null,
      }))
    );
  }

  const organisationId = await getDefaultOrganisationId();
  const pageParam = url.searchParams.get("page");
  const pageSizeParam = url.searchParams.get("pageSize");
  const typeParam = url.searchParams.get("type")?.trim() || "";
  const gstParam = url.searchParams.get("gst")?.trim() || "";
  const vendorParam = url.searchParams.get("vendor")?.trim() || "";
  const paginated = Boolean(pageParam) || Boolean(pageSizeParam);
  const pageSize = paginated
    ? Math.min(Math.max(Number(pageSizeParam) || 50, 1), 100)
    : Math.min(take, 5000);
  const page = paginated ? Math.max(Number(pageParam) || 1, 1) : 1;
  const skip = paginated ? (page - 1) * pageSize : 0;

  const baseWhere = {
    organisationId,
    type: { not: "OTHER" as const },
    ...(activeParam === "true"
      ? { active: true }
      : activeParam === "false"
        ? { active: false }
        : {}),
  };

  const nameFilter = q
    ? {
        OR: [
          { legalName: { startsWith: q, mode: "insensitive" as const } },
          { tradeName: { startsWith: q, mode: "insensitive" as const } },
          { code: { startsWith: q, mode: "insensitive" as const } },
          { gstin: { startsWith: q, mode: "insensitive" as const } },
          { sourceClientId: { startsWith: q, mode: "insensitive" as const } },
          ...(q.length >= 3
            ? [
                { legalName: { contains: q, mode: "insensitive" as const } },
                { tradeName: { contains: q, mode: "insensitive" as const } },
              ]
            : []),
        ],
      }
    : {};

  const listFilter = q
    ? {
        OR: [
          ...(nameFilter.OR || []),
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
          { clientTypeName: { contains: q, mode: "insensitive" as const } },
          {
            contacts: {
              some: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                  { phone: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const extraFilters: Prisma.PartyWhereInput[] = [];
  if (q && "OR" in listFilter) extraFilters.push({ OR: listFilter.OR });
  if (typeParam) extraFilters.push({ clientTypeName: typeParam });
  if (gstParam === "yes") {
    extraFilters.push({ gstin: { not: null } }, { NOT: { gstin: "" } });
  }
  if (gstParam === "no") {
    extraFilters.push({ OR: [{ gstin: null }, { gstin: "" }] });
  }
  if (vendorParam === "1") extraFilters.push({ isVendor: true });
  const where: Prisma.PartyWhereInput =
    extraFilters.length > 0 ? { ...baseWhere, AND: extraFilters } : baseWhere;
  const listSelect = {
    id: true,
    code: true,
    type: true,
    legalName: true,
    tradeName: true,
    gstin: true,
    pan: true,
    email: true,
    phone: true,
    phone2: true,
    website: true,
    placeOfSupplyCode: true,
    gstinVerifiedAt: true,
    gstinStatus: true,
    clientTypeName: true,
    sourceClientId: true,
    ledgerGroup: true,
    managedByName: true,
    active: true,
    createdAt: true,
    updatedAt: true,
    addresses: {
      where: { type: "BILLING" as const },
      orderBy: { isDefault: "desc" as const },
      take: 1,
      select: {
        id: true,
        type: true,
        isDefault: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        district: true,
        state: true,
        stateCode: true,
        postalCode: true,
      },
    },
    contacts: {
      select: partyContactSelect,
      orderBy: partyContactOrderBy,
    },
  };

  const [parties, total, typeRows] = await Promise.all([
    prisma.party.findMany({
      where,
      select: listSelect,
      orderBy:
        activeParam === "true" || activeParam === "false"
          ? [{ legalName: "asc" }]
          : [{ active: "desc" }, { legalName: "asc" }],
      skip,
      take: pageSize,
    }),
    paginated ? prisma.party.count({ where }) : Promise.resolve(0),
    paginated
      ? prisma.party.groupBy({
          by: ["clientTypeName"],
          where: {
            organisationId,
            type: { not: "OTHER" as const },
            clientTypeName: { not: null },
          },
          orderBy: { clientTypeName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const items = parties.map(serializeParty);
  if (paginated) {
    const types = typeRows
      .map((row) => row.clientTypeName)
      .filter((name): name is string => Boolean(name && name.trim()));
    return NextResponse.json({ items, total, page, pageSize, types });
  }

  const ranked = q ? rankPartiesByQuery(parties, q) : parties;
  return NextResponse.json(ranked.map(serializeParty));
}

const onboardSchema = z.object({
  gstin: z.string().length(15),
  contactName: z.string().optional(),
  designation: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  /** If false, only fetch portal details without saving. Default true. */
  save: z.boolean().optional().default(true),
});

const createManualSchema = z.object({
  legalName: z.string().min(1),
  tradeName: z.string().optional(),
  gstin: z.string().length(15).optional().or(z.literal("")),
  contactName: z.string().optional(),
  designation: z.string().optional(),
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

const onboardContactSchema = z.object({
  name: z.string().optional().default(""),
  designation: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  isPrimary: z.boolean().optional().default(false),
});

const onboardFullSchema = z.object({
  verifyGstin: z.boolean().optional().default(true),
  contactName: z.string().optional().default(""),
  designation: z.string().optional().default(""),
  contacts: z.array(onboardContactSchema).optional().default([]),
  fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()])).default({}),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const body = await req.json();
  const mode =
    body?.mode === "manual" ? "manual" : body?.mode === "full" ? "full" : "gstin";

  try {
    if (mode === "full") {
      const parsed = onboardFullSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed.data.fields)) {
        if (typeof value === "boolean") fields[key] = value ? "Yes" : "";
        else if (value == null) fields[key] = "";
        else fields[key] = String(value);
      }
      const payload = formToPartyPayload({
        fields,
        contacts:
          parsed.data.contacts.length > 0
            ? parsed.data.contacts
            : [
                {
                  name: parsed.data.contactName,
                  designation: parsed.data.designation,
                  email: "",
                  phone: "",
                  isPrimary: true,
                },
              ],
      });
      if (!payload.legalName) {
        return NextResponse.json({ error: "Enter the client name" }, { status: 400 });
      }
      if (payload.sourceClientId) {
        const clash = await prisma.party.findFirst({
          where: { sourceClientId: payload.sourceClientId },
          select: { id: true },
        });
        if (clash) {
          return NextResponse.json(
            { error: "That client ID is already in use" },
            { status: 409 }
          );
        }
      }

      let partyId: string | undefined;
      const gstin = payload.gstin?.toUpperCase() || "";
      if (parsed.data.verifyGstin && gstin.length === 15) {
        const result = await verifyAndStorePartyGstin({
          gstin,
          createPartyIfMissing: true,
          legalNameHint: payload.legalName,
          email: payload.email || undefined,
          phone: payload.phone || undefined,
          userId,
        });
        if (!result.verification.valid) {
          return NextResponse.json(
            {
              error: result.verification.message || "Invalid GSTIN",
              verification: result.verification,
            },
            { status: 400 }
          );
        }
        partyId = result.partyId;
      }

      if (!partyId) {
        partyId = await createPartyFromOnboard(payload);
      } else {
        await applyPartyOnboardPayload(partyId, payload);
      }

      const saved = await loadOnboardedParty(partyId);
      return NextResponse.json({ party: serializeParty(saved) }, { status: 201 });
    }

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

      if (result.partyId && parsed.data.save !== false) {
        await upsertPrimaryContactFromFields(result.partyId, {
          name: parsed.data.contactName,
          designation: parsed.data.designation,
          email: parsed.data.email,
          phone: parsed.data.phone,
        });
      }

      const savedParty = result.partyId
        ? await prisma.party.findUnique({
            where: { id: result.partyId },
            include: { addresses: true, contacts: { orderBy: partyContactOrderBy } },
          })
        : result.party;

      return NextResponse.json(
        {
          verification: result.verification,
          address: result.address,
          party: savedParty ? serializeParty(savedParty) : null,
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
      if (result.partyId) {
        await upsertPrimaryContactFromFields(result.partyId, {
          name: data.contactName,
          designation: data.designation,
          email: data.email,
          phone: data.phone,
        });
      }
      const party = result.partyId
        ? await prisma.party.findUniqueOrThrow({
            where: { id: result.partyId },
            include: { addresses: true, contacts: { orderBy: partyContactOrderBy } },
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
        managedByName: data.contactName?.trim() || null,
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
      include: { addresses: true, contacts: true },
    });

    await upsertPrimaryContactFromFields(party.id, {
      name: data.contactName,
      designation: data.designation,
      email: data.email,
      phone: data.phone,
    });
    const saved = await prisma.party.findUniqueOrThrow({
      where: { id: party.id },
      include: { addresses: true, contacts: { orderBy: partyContactOrderBy } },
    });

    return NextResponse.json({ party: serializeParty(saved) }, { status: 201 });
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
