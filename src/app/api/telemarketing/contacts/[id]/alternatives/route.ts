import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";
import { parseTagsJson } from "@/lib/telemarketing/contact-update";
import { contactRequiresPhoneOrEmail, validateEmailInput, validatePhoneInput } from "@/lib/telemarketing/validation";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().optional().default(""),
  role: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id: primaryId } = await params;

  const primary = await prisma.telemarketingContact.findUnique({ where: { id: primaryId } });
  if (!primary || primary.primaryContactId) {
    return NextResponse.json({ error: "Primary contact not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const phoneResult = validatePhoneInput(parsed.data.phone);
  if (!phoneResult.ok) {
    return NextResponse.json({ error: phoneResult.error }, { status: 400 });
  }
  const emailResult = validateEmailInput(parsed.data.email);
  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.error }, { status: 400 });
  }
  if (!contactRequiresPhoneOrEmail(phoneResult.value, emailResult.value)) {
    return NextResponse.json({ error: "Email or phone number is required" }, { status: 400 });
  }

  const alt = await prisma.telemarketingContact.create({
    data: {
      name: parsed.data.name.trim(),
      company: primary.company,
      role: parsed.data.role.trim(),
      phone: phoneResult.value,
      email: emailResult.value,
      source: primary.source,
      assignedToUserId: primary.assignedToUserId,
      primaryContactId: primaryId,
      tags: parseTagsJson(primary.tags as unknown),
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  const label = phoneResult.value || emailResult.value;
  await logTelemarketingTimeline({
    contactId: primaryId,
    type: "ALTERNATIVE_ADDED",
    title: "Alternative contact added",
    body: `Added alternative contact: ${label}`,
    actorId: session?.user?.id,
    meta: { alternativeId: alt.id },
  });

  await logTelemarketingTimeline({
    contactId: alt.id,
    type: "CONTACT_CREATED",
    title: "Alternative contact",
    body: `Linked to ${primary.company || primary.name || "primary contact"}`,
    actorId: session?.user?.id,
  });

  return NextResponse.json({ contact: alt }, { status: 201 });
}