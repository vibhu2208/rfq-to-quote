import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UNCATEGORIZED_CATEGORY } from "@/lib/categories";
import { tokenize } from "@/lib/product-match";

const BATCH = 200;

function newId() {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

function digitsPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function partyName(party: {
  tradeName?: string | null;
  legalName: string;
}) {
  return (party.tradeName || party.legalName || "").trim();
}

function preferredChannel(email?: string | null, phone?: string | null) {
  if (email?.trim()) return "EMAIL" as const;
  if (phone?.trim()) return "WHATSAPP" as const;
  return "EMAIL" as const;
}

/** Fast single-party upsert (used when a client is saved). */
async function upsertVendorFromParty(party: {
  id: string;
  legalName: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  isVendor: boolean;
  contacts: Array<{
    name: string;
    email: string;
    phone: string;
    designation: string;
    isPrimary: boolean;
  }>;
}) {
  const name = partyName(party);
  if (!name) return "skip" as const;

  const primary =
    party.contacts.find((contact) => contact.isPrimary) || party.contacts[0];
  const email = (party.email || primary?.email || "").trim() || null;
  const phone =
    (party.phone || primary?.phone || "").trim() ||
    digitsPhone(party.phone) ||
    digitsPhone(primary?.phone) ||
    null;
  const active = Boolean(party.active && party.isVendor);
  const channel = preferredChannel(email, phone);
  const nameKeywords = tokenize(name);

  let vendor = await prisma.vendor.findUnique({
    where: { partyId: party.id },
    select: { id: true },
  });

  let created = false;
  if (!vendor && (email || phone)) {
    const matched = await prisma.vendor.findFirst({
      where: {
        partyId: null,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }, { whatsappId: phone }] : []),
        ],
      },
      select: { id: true },
    });
    if (matched) vendor = matched;
  }

  if (!party.isVendor) {
    if (vendor) {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { partyId: party.id, active: false },
      });
      return "updated" as const;
    }
    return "skip" as const;
  }

  if (vendor) {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        partyId: party.id,
        name,
        phone,
        email,
        whatsappId: phone,
        preferredChannel: channel,
        active,
      },
    });
  } else {
    vendor = await prisma.vendor.create({
      data: {
        partyId: party.id,
        name,
        phone,
        email,
        whatsappId: phone,
        preferredChannel: channel,
        active,
        categories: {
          create: {
            category: UNCATEGORIZED_CATEGORY,
            subcategory: "",
            keywords: nameKeywords,
          },
        },
      },
      select: { id: true },
    });
    created = true;
  }

  await prisma.vendorContact.deleteMany({ where: { vendorId: vendor.id } });
  const contactRows =
    party.contacts.length > 0
      ? party.contacts.map((contact, index) => ({
          vendorId: vendor!.id,
          name: contact.name || name,
          email: contact.email || "",
          phone: contact.phone || "",
          role: contact.designation || "",
          isPrimary: contact.isPrimary || index === 0,
        }))
      : email || phone
        ? [
            {
              vendorId: vendor.id,
              name,
              email: email || "",
              phone: phone || "",
              role: "",
              isPrimary: true,
            },
          ]
        : [];
  if (contactRows.length > 0) {
    await prisma.vendorContact.createMany({ data: contactRows });
  }

  if (!created) {
    const hasCategory = await prisma.vendorCategory.findFirst({
      where: { vendorId: vendor.id },
      select: { id: true },
    });
    if (!hasCategory) {
      await prisma.vendorCategory.create({
        data: {
          vendorId: vendor.id,
          category: UNCATEGORIZED_CATEGORY,
          subcategory: "",
          keywords: nameKeywords,
        },
      });
    }
  }

  return created ? ("created" as const) : ("updated" as const);
}

/**
 * Bulk sync all Is Vendor clients → Vendor rows.
 * Uses batched createMany / parallel updates (safe for 3k+ parties).
 */
export async function syncVendorsFromIsVendorParties(options?: {
  partyId?: string;
}) {
  if (options?.partyId) {
    const party = await prisma.party.findUnique({
      where: { id: options.partyId },
      include: {
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        },
      },
    });
    if (!party) return { created: 0, updated: 0, deactivated: 0, scanned: 0 };
    const result = await upsertVendorFromParty(party);
    return {
      created: result === "created" ? 1 : 0,
      updated: result === "updated" ? 1 : 0,
      deactivated: party.isVendor ? 0 : result === "updated" ? 1 : 0,
      scanned: 1,
    };
  }

  await deleteDummyVendors();

  type PartyRow = {
    id: string;
    legalName: string;
    tradeName: string | null;
    email: string | null;
    phone: string | null;
    active: boolean;
    isVendor: boolean;
  };
  type ContactRow = {
    partyId: string;
    name: string;
    email: string;
    phone: string;
    designation: string;
    isPrimary: boolean;
  };
  type VendorRow = {
    id: string;
    partyId: string | null;
    email: string | null;
    phone: string | null;
  };

  const parties = await prisma.$queryRaw<PartyRow[]>`
    SELECT id, "legalName", "tradeName", email, phone, active, "isVendor"
    FROM "Party"
    WHERE "isVendor" = true
  `;

  const contacts = await prisma.$queryRaw<ContactRow[]>`
    SELECT DISTINCT ON (pc."partyId")
      pc."partyId",
      pc.name,
      pc.email,
      pc.phone,
      pc.designation,
      pc."isPrimary"
    FROM "PartyContact" pc
    INNER JOIN "Party" p ON p.id = pc."partyId" AND p."isVendor" = true
    ORDER BY pc."partyId", pc."isPrimary" DESC, pc.name ASC
  `;
  const contactByParty = new Map(contacts.map((c) => [c.partyId, c]));

  const existing = await prisma.$queryRaw<VendorRow[]>`
    SELECT id, "partyId", email, phone FROM "Vendor"
  `;
  const byPartyId = new Map<string, VendorRow>();
  const byEmail = new Map<string, VendorRow>();
  const byPhone = new Map<string, VendorRow>();
  for (const v of existing) {
    if (v.partyId) byPartyId.set(v.partyId, v);
    if (v.email) byEmail.set(v.email.trim().toLowerCase(), v);
    if (v.phone) byPhone.set(v.phone.replace(/\D/g, ""), v);
  }

  const toCreate: Array<{
    id: string;
    partyId: string;
    name: string;
    phone: string | null;
    email: string | null;
    whatsappId: string | null;
    preferredChannel: "EMAIL" | "WHATSAPP";
    active: boolean;
  }> = [];
  const toUpdate: Array<{
    id: string;
    partyId: string;
    name: string;
    phone: string | null;
    email: string | null;
    whatsappId: string | null;
    preferredChannel: "EMAIL" | "WHATSAPP";
    active: boolean;
  }> = [];
  const categoryCreates: Array<{
    id: string;
    vendorId: string;
    category: string;
    subcategory: string;
    keywords: string[];
  }> = [];
  const contactCreates: Array<{
    vendorId: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isPrimary: boolean;
  }> = [];

  for (const party of parties) {
    const name = partyName(party);
    if (!name) continue;
    const poc = contactByParty.get(party.id);
    const email = (party.email || poc?.email || "").trim() || null;
    const phone = (party.phone || poc?.phone || "").trim() || null;
    const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
    const active = Boolean(party.active && party.isVendor);
    const channel = preferredChannel(email, phone);

    let vendor =
      byPartyId.get(party.id) ||
      (email ? byEmail.get(email.toLowerCase()) : undefined) ||
      (phoneDigits
        ? byPhone.get(phoneDigits.slice(-10)) || byPhone.get(phoneDigits)
        : undefined);

    if (vendor) {
      toUpdate.push({
        id: vendor.id,
        partyId: party.id,
        name,
        phone,
        email,
        whatsappId: phone,
        preferredChannel: channel,
        active,
      });
      byPartyId.set(party.id, vendor);
    } else {
      const id = newId();
      vendor = { id, partyId: party.id, email, phone };
      toCreate.push({
        id,
        partyId: party.id,
        name,
        phone,
        email,
        whatsappId: phone,
        preferredChannel: channel,
        active,
      });
      byPartyId.set(party.id, vendor);
      if (email) byEmail.set(email.toLowerCase(), vendor);
      if (phoneDigits) byPhone.set(phoneDigits, vendor);
      categoryCreates.push({
        id: newId(),
        vendorId: id,
        category: UNCATEGORIZED_CATEGORY,
        subcategory: "",
        keywords: tokenize(name),
      });
    }

    contactCreates.push({
      vendorId: vendor.id,
      name: poc?.name || name,
      email: email || "",
      phone: phone || "",
      role: poc?.designation || "",
      isPrimary: true,
    });
  }

  for (let i = 0; i < toCreate.length; i += BATCH) {
    await prisma.vendor.createMany({
      data: toCreate.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((row) =>
        prisma.vendor.update({
          where: { id: row.id },
          data: {
            partyId: row.partyId,
            name: row.name,
            phone: row.phone,
            email: row.email,
            whatsappId: row.whatsappId,
            preferredChannel: row.preferredChannel,
            active: row.active,
          },
        })
      )
    );
  }

  for (let i = 0; i < categoryCreates.length; i += BATCH) {
    await prisma.vendorCategory.createMany({
      data: categoryCreates.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }

  const vendorIds = [...new Set(contactCreates.map((c) => c.vendorId))];
  for (let i = 0; i < vendorIds.length; i += BATCH) {
    const ids = vendorIds.slice(i, i + BATCH);
    await prisma.vendorContact.deleteMany({ where: { vendorId: { in: ids } } });
    const rows = contactCreates
      .filter((c) => ids.includes(c.vendorId))
      .map((c) => ({
        id: newId(),
        vendorId: c.vendorId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: c.role,
        isPrimary: c.isPrimary,
      }));
    if (rows.length) {
      await prisma.vendorContact.createMany({ data: rows, skipDuplicates: true });
    }
  }

  const deactivated = await prisma.$executeRaw`
    UPDATE "Vendor" v
    SET active = false, "updatedAt" = NOW()
    FROM "Party" p
    WHERE v."partyId" = p.id
      AND p."isVendor" = false
      AND v.active = true
  `;

  return {
    created: toCreate.length,
    updated: toUpdate.length,
    deactivated: Number(deactivated),
    scanned: parties.length,
  };
}

/** Remove known seed / QA dummy vendors (not linked to a Party). */
export async function deleteDummyVendors() {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "Vendor"
    WHERE "partyId" IS NULL
      AND (
        "name" IN (
          'Vision Secure Systems',
          'TechBridge Computers',
          'Display Hub',
          'NetWire Solutions',
          'PowerSafe India',
          'QA Smoke Vendor'
        )
        OR "email" ILIKE '%.example'
        OR "email" ILIKE '%@example.com'
      )
  `;
  return { deleted: Number(deleted) };
}
