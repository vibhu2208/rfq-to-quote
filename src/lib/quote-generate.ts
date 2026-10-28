import { prisma } from "@/lib/prisma";
import { createRfqWithMessage } from "@/lib/rfq";
import { autoMatchQuoteLines, createQuoteFromRfq } from "@/lib/quote-from-rfq";

export type GenerateQuoteInput = {
  rawText: string;
  subject?: string;
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  filename?: string;
};

async function matchClient(name: string) {
  const q = name.trim();
  if (q.length < 3) return null;
  return prisma.party.findFirst({
    where: {
      active: true,
      type: { not: "OTHER" },
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { tradeName: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      addresses: {
        where: { type: "BILLING" },
        orderBy: { isDefault: "desc" },
        take: 1,
      },
    },
  });
}

export async function generateQuoteFromRequirement(input: GenerateQuoteInput) {
  const rawText = input.rawText.trim();
  if (!rawText) throw new Error("Paste a requirement or upload a document/photo");

  const subject =
    input.subject?.trim() ||
    (input.filename
      ? `Document RFQ: ${input.filename}${input.company ? ` — ${input.company}` : ""}`
      : `Team RFQ: ${rawText.slice(0, 80)}${input.company ? ` — ${input.company}` : ""}`);

  let rfq = await createRfqWithMessage({
    channel: "MANUAL",
    sourceRef: `quote-gen-${Date.now()}`,
    subject,
    rawText,
    rawAttachments: input.filename ? [{ name: input.filename }] : [],
    customerName: input.contactName || "",
    customerEmail: input.email || "",
    customerPhone: input.phone || "",
    customerCompany: input.company || "",
  });

  const lookupName = input.company || rfq.customerCompany || rfq.customerName;
  const party = lookupName ? await matchClient(lookupName) : null;
  const billing = party?.addresses[0];

  if (party) {
    rfq = await prisma.rfq.update({
      where: { id: rfq.id },
      data: {
        customerCompany: rfq.customerCompany || party.legalName,
        customerName: rfq.customerName || party.legalName,
        customerEmail: rfq.customerEmail || party.email || "",
        customerPhone: rfq.customerPhone || party.phone || "",
      },
    });
  }

  const lines = await autoMatchQuoteLines(rfq.id);
  const quote = await createQuoteFromRfq({
    rfqId: rfq.id,
    lines,
    buyerGstin: party?.gstin || "",
    buyerAddress: billing
      ? [billing.addressLine1, billing.city, billing.state, billing.postalCode]
          .filter(Boolean)
          .join(", ")
      : "",
    buyerState: billing?.state || "",
  });

  return { quote, rfqId: rfq.id };
}
