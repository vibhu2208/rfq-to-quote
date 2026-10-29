import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  ensureOnePrimaryContact,
  partyContactOrderBy,
  partyContactSelect,
  serializePartyContacts,
  setPrimaryPartyContact,
} from "@/lib/party-contacts";

type Params = { params: Promise<{ id: string; contactId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  designation: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

async function loadOwnedContact(partyId: string, contactId: string) {
  return prisma.partyContact.findFirst({
    where: { id: contactId, partyId },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id, contactId } = await params;
  const existing = await loadOwnedContact(id, contactId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  await prisma.partyContact.update({
    where: { id: contactId },
    data: {
      name: data.name,
      designation: data.designation === undefined ? undefined : data.designation.trim(),
      email: data.email === undefined ? undefined : data.email.trim(),
      phone: data.phone === undefined ? undefined : data.phone.trim(),
    },
  });

  if (data.isPrimary) {
    await setPrimaryPartyContact(id, contactId);
  } else {
    await ensureOnePrimaryContact(id);
  }

  const contacts = await prisma.partyContact.findMany({
    where: { partyId: id },
    select: partyContactSelect,
    orderBy: partyContactOrderBy,
  });
  return NextResponse.json({ contacts: serializePartyContacts(contacts) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id, contactId } = await params;
  const existing = await loadOwnedContact(id, contactId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.partyContact.delete({ where: { id: contactId } });
  await ensureOnePrimaryContact(id);

  const contacts = await prisma.partyContact.findMany({
    where: { partyId: id },
    select: partyContactSelect,
    orderBy: partyContactOrderBy,
  });
  return NextResponse.json({ contacts: serializePartyContacts(contacts) });
}
