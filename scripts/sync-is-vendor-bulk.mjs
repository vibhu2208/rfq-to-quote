/**
 * Fast bulk sync: Party.isVendor=true → Vendor (one SQL pass + batched inserts).
 * Avoids per-party Prisma round-trips that hang on large client masters.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MISC = "Misc";
const BATCH = 200;

function cuid() {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

function tokenize(name) {
  return [
    ...new Set(
      String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2)
    ),
  ];
}

function partyDisplayName(row) {
  return String(row.tradeName || row.legalName || "").trim();
}

async function main() {
  console.time("total");

  // 1) Delete dummy / seed vendors not linked to a party
  const dummy = await prisma.$executeRaw`
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
  console.log("deleted dummy vendors:", Number(dummy));

  // 2) Load isVendor parties (lean)
  console.time("load-parties");
  const parties = await prisma.$queryRaw`
    SELECT
      p.id,
      p."legalName",
      p."tradeName",
      p.email,
      p.phone,
      p.active,
      p."isVendor"
    FROM "Party" p
    WHERE p."isVendor" = true
  `;
  console.timeEnd("load-parties");
  console.log("isVendor parties:", parties.length);

  // Primary contacts in one query
  console.time("load-contacts");
  const contacts = await prisma.$queryRaw`
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
  console.timeEnd("load-contacts");
  const contactByParty = new Map(contacts.map((c) => [c.partyId, c]));

  // Existing vendors linked by partyId
  console.time("load-vendors");
  const existing = await prisma.$queryRaw`
    SELECT id, "partyId", email, phone
    FROM "Vendor"
  `;
  console.timeEnd("load-vendors");

  const byPartyId = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  for (const v of existing) {
    if (v.partyId) byPartyId.set(v.partyId, v);
    if (v.email) byEmail.set(String(v.email).trim().toLowerCase(), v);
    if (v.phone) byPhone.set(String(v.phone).replace(/\D/g, ""), v);
  }

  const toCreate = [];
  const toUpdate = [];
  const contactCreates = []; // {vendorId, ...}
  const categoryCreates = []; // for new vendors only

  for (const party of parties) {
    const name = partyDisplayName(party);
    if (!name) continue;
    const poc = contactByParty.get(party.id);
    const email =
      String(party.email || poc?.email || "")
        .trim() || null;
    const phoneRaw = String(party.phone || poc?.phone || "").trim();
    const phone = phoneRaw || null;
    const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
    const active = Boolean(party.active && party.isVendor);
    const preferredChannel = email ? "EMAIL" : phone ? "WHATSAPP" : "EMAIL";

    let vendor =
      byPartyId.get(party.id) ||
      (email ? byEmail.get(email.toLowerCase()) : null) ||
      (phoneDigits.length >= 10 ? byPhone.get(phoneDigits.slice(-10)) || byPhone.get(phoneDigits) : null);

    if (vendor) {
      toUpdate.push({
        id: vendor.id,
        partyId: party.id,
        name,
        phone,
        email,
        whatsappId: phone,
        preferredChannel,
        active,
      });
      byPartyId.set(party.id, vendor);
    } else {
      const id = cuid();
      vendor = { id, partyId: party.id, email, phone };
      toCreate.push({
        id,
        partyId: party.id,
        name,
        phone,
        email,
        whatsappId: phone,
        preferredChannel,
        active,
      });
      byPartyId.set(party.id, vendor);
      if (email) byEmail.set(email.toLowerCase(), vendor);
      if (phoneDigits) byPhone.set(phoneDigits, vendor);
      categoryCreates.push({
        id: cuid(),
        vendorId: id,
        category: MISC,
        subcategory: "",
        keywords: JSON.stringify(tokenize(name)),
      });
    }

    // Replace contacts later in bulk by vendor ids we touch
    contactCreates.push({
      vendorId: vendor.id,
      name: poc?.name || name,
      email: email || "",
      phone: phone || "",
      role: poc?.designation || "",
      isPrimary: true,
    });
  }

  console.log("to create:", toCreate.length, "to update:", toUpdate.length);

  // 3) Batch create vendors
  console.time("create-vendors");
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    await prisma.vendor.createMany({ data: chunk, skipDuplicates: true });
    if (i % 1000 === 0) console.log("  created", Math.min(i + BATCH, toCreate.length));
  }
  console.timeEnd("create-vendors");

  // 4) Batch update via raw SQL unnest (faster than N updates)
  console.time("update-vendors");
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
    if (i % 1000 === 0) console.log("  updated", Math.min(i + BATCH, toUpdate.length));
  }
  console.timeEnd("update-vendors");

  // 5) Categories for new vendors
  console.time("categories");
  for (let i = 0; i < categoryCreates.length; i += BATCH) {
    const chunk = categoryCreates.slice(i, i + BATCH);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VendorCategory" (id, "vendorId", category, subcategory, keywords)
       SELECT * FROM UNNEST(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::jsonb[]
       )
       ON CONFLICT ("vendorId", category, subcategory) DO NOTHING`,
      chunk.map((c) => c.id),
      chunk.map((c) => c.vendorId),
      chunk.map((c) => c.category),
      chunk.map((c) => c.subcategory),
      chunk.map((c) => c.keywords)
    ).catch(async () => {
      // Fallback if UNNEST jsonb typing fails
      await prisma.vendorCategory.createMany({
        data: chunk.map((c) => ({
          id: c.id,
          vendorId: c.vendorId,
          category: c.category,
          subcategory: c.subcategory,
          keywords: JSON.parse(c.keywords),
        })),
        skipDuplicates: true,
      });
    });
  }
  console.timeEnd("categories");

  // 6) Refresh contacts for touched vendors
  console.time("contacts");
  const vendorIds = [...new Set(contactCreates.map((c) => c.vendorId))];
  for (let i = 0; i < vendorIds.length; i += BATCH) {
    const ids = vendorIds.slice(i, i + BATCH);
    await prisma.vendorContact.deleteMany({ where: { vendorId: { in: ids } } });
    const rows = contactCreates
      .filter((c) => ids.includes(c.vendorId))
      .map((c) => ({
        id: cuid(),
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
    if (i % 1000 === 0) console.log("  contacts", Math.min(i + BATCH, vendorIds.length));
  }
  console.timeEnd("contacts");

  // 7) Deactivate vendors linked to parties that are no longer Is Vendor
  const deactivated = await prisma.$executeRaw`
    UPDATE "Vendor" v
    SET active = false, "updatedAt" = NOW()
    FROM "Party" p
    WHERE v."partyId" = p.id
      AND p."isVendor" = false
      AND v.active = true
  `;
  console.log("deactivated (no longer Is Vendor):", Number(deactivated));

  const linked = await prisma.vendor.count({ where: { partyId: { not: null } } });
  const total = await prisma.vendor.count();
  console.log("vendors total:", total, "linked to party:", linked);
  console.timeEnd("total");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
