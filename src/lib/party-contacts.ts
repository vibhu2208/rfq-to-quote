import { prisma } from "@/lib/prisma";

export type PartyContactRecord = {
  id: string;
  name: string;
  designation: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

export const partyContactSelect = {
  id: true,
  name: true,
  designation: true,
  email: true,
  phone: true,
  isPrimary: true,
} as const;

export const partyContactOrderBy = [
  { isPrimary: "desc" as const },
  { createdAt: "asc" as const },
];

export function serializePartyContacts(
  contacts?: Array<PartyContactRecord> | null
): PartyContactRecord[] {
  return (contacts || []).map((c) => ({
    id: c.id,
    name: c.name,
    designation: c.designation,
    email: c.email,
    phone: c.phone,
    isPrimary: c.isPrimary,
  }));
}

export function pickPrimaryContact(
  contacts?: Array<PartyContactRecord> | null
): PartyContactRecord | null {
  const list = serializePartyContacts(contacts);
  return list.find((c) => c.isPrimary) || list[0] || null;
}

export async function syncPartyFromPrimaryContact(partyId: string) {
  const contacts = await prisma.partyContact.findMany({
    where: { partyId },
    orderBy: partyContactOrderBy,
  });
  const primary = pickPrimaryContact(contacts);
  await prisma.party.update({
    where: { id: partyId },
    data: {
      managedByName: primary?.name || null,
      email: primary?.email || null,
      phone: primary?.phone || null,
    },
  });
}

export async function setPrimaryPartyContact(partyId: string, contactId: string) {
  await prisma.$transaction([
    prisma.partyContact.updateMany({
      where: { partyId, NOT: { id: contactId } },
      data: { isPrimary: false },
    }),
    prisma.partyContact.update({
      where: { id: contactId },
      data: { isPrimary: true },
    }),
  ]);
  await syncPartyFromPrimaryContact(partyId);
}

export async function ensureOnePrimaryContact(partyId: string) {
  const contacts = await prisma.partyContact.findMany({
    where: { partyId },
    orderBy: { createdAt: "asc" },
  });
  if (contacts.length === 0) {
    await syncPartyFromPrimaryContact(partyId);
    return;
  }
  const primary = contacts.find((c) => c.isPrimary) || contacts[0];
  await setPrimaryPartyContact(partyId, primary.id);
}

export async function upsertPrimaryContactFromFields(
  partyId: string,
  input: {
    name?: string | null;
    designation?: string | null;
    email?: string | null;
    phone?: string | null;
  }
) {
  const name = (input.name || "").trim();
  const designation = (input.designation || "").trim();
  const email = (input.email || "").trim();
  const phone = (input.phone || "").trim();
  if (!name && !email && !phone) return null;

  const existing = await prisma.partyContact.findFirst({
    where: { partyId, isPrimary: true },
    orderBy: { createdAt: "asc" },
  });
  const data = {
    name: name || existing?.name || "Contact",
    designation: designation || existing?.designation || "",
    email: email || existing?.email || "",
    phone: phone || existing?.phone || "",
    isPrimary: true,
  };

  const contact = existing
    ? await prisma.partyContact.update({ where: { id: existing.id }, data })
    : await prisma.partyContact.create({ data: { partyId, ...data } });

  await setPrimaryPartyContact(partyId, contact.id);
  return contact;
}
