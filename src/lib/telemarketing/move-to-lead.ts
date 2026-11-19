import type { TelemarketingContact } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logLeadActivity } from "@/lib/leads/activity";
import { createRfqWithMessage } from "@/lib/rfq";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";

export type MoveToLeadInput = {
  contact: Pick<
    TelemarketingContact,
    | "id"
    | "name"
    | "company"
    | "phone"
    | "email"
    | "role"
    | "assignedToUserId"
    | "convertedLeadId"
  >;
  actorId?: string | null;
  callNote?: string;
};

export function buildLeadRequirementFromContact(
  contact: Pick<TelemarketingContact, "name" | "company" | "role" | "phone" | "email">
) {
  const lines = [
    "Lead created from Telemarketing contact.",
    contact.company ? `Company: ${contact.company}` : "",
    contact.role ? `Role: ${contact.role}` : "",
    contact.phone ? `Phone: ${contact.phone}` : "",
    contact.email ? `Email: ${contact.email}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function moveContactToLead(input: MoveToLeadInput) {
  if (input.contact.convertedLeadId) {
    const existing = await prisma.rfq.findUnique({
      where: { id: input.contact.convertedLeadId },
      select: { id: true, leadNumber: true },
    });
    if (existing) return existing;
  }

  const requirement = buildLeadRequirementFromContact(input.contact);
  const subject =
    input.contact.company ||
    input.contact.name ||
    `Telemarketing ${input.contact.phone || input.contact.email}`;

  const rfq = await createRfqWithMessage({
    channel: "REFERRAL",
    sourceRef: `telemarketing-${input.contact.id}`,
    subject: subject.slice(0, 120),
    rawText: requirement,
    customerName: input.contact.name || input.contact.company || "Contact",
    customerCompany: input.contact.company,
    customerEmail: input.contact.email,
    customerPhone: input.contact.phone,
    autoParse: false,
  });

  const assignee = input.contact.assignedToUserId;
  if (assignee) {
    await prisma.rfq.update({
      where: { id: rfq.id },
      data: {
        assignedToUserId: assignee,
        referralSource: "Telemarketing",
      },
    });
  } else {
    await prisma.rfq.update({
      where: { id: rfq.id },
      data: { referralSource: "Telemarketing" },
    });
  }

  await prisma.telemarketingContact.update({
    where: { id: input.contact.id },
    data: {
      callStatus: "MOVE_TO_LEAD",
      convertedLeadId: rfq.id,
    },
  });

  await logTelemarketingTimeline({
    contactId: input.contact.id,
    type: "MARKED_AS_LEAD",
    title: "Marked as lead",
    body: `Created lead ${rfq.leadNumber}`,
    actorId: input.actorId,
    meta: { leadId: rfq.id, leadNumber: rfq.leadNumber },
  });

  await logLeadActivity({
    rfqId: rfq.id,
    type: "LEAD_CREATED",
    title: "From Telemarketing",
    body: input.callNote?.trim() || "Converted from telemarketing contact.",
    actorId: input.actorId,
    meta: { telemarketingContactId: input.contact.id },
  });

  return rfq;
}

export function callStatusLabelForTimeline(status: keyof typeof TELEMARKETING_CALL_STATUS_LABELS) {
  return TELEMARKETING_CALL_STATUS_LABELS[status] || status;
}