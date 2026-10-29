import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  partyContactOrderBy,
  partyContactSelect,
  serializePartyContacts,
  setPrimaryPartyContact,
} from "@/lib/party-contacts";

type Params = { params: Promise<{ id: string }> };

const contactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required"),
  designation: z.string().optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  phone: z.string().optional().default(""),
  isPrimary: z.boolean().optional().default(false),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const party = await prisma.party.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const contacts = await prisma.partyContact.findMany({
    where: { partyId: id },
    select: partyContactSelect,
    orderBy: partyContactOrderBy,
  });
  return NextResponse.json(serializePartyContacts(contacts));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const party = await prisma.party.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!party) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = contactSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.partyContact.count({ where: { partyId: id } });
  const makePrimary = parsed.data.isPrimary || count === 0;
  const contact = await prisma.partyContact.create({
    data: {
      partyId: id,
      name: parsed.data.name,
      designation: parsed.data.designation.trim(),
      email: parsed.data.email.trim(),
      phone: parsed.data.phone.trim(),
      isPrimary: makePrimary,
    },
    select: partyContactSelect,
  });

  if (makePrimary) {
    await setPrimaryPartyContact(id, contact.id);
  }

  const contacts = await prisma.partyContact.findMany({
    where: { partyId: id },
    select: partyContactSelect,
    orderBy: partyContactOrderBy,
  });
  return NextResponse.json(
    { contact, contacts: serializePartyContacts(contacts) },
    { status: 201 }
  );
}
