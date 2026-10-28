import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createRfqWithMessage } from "@/lib/rfq";
import {
  autoMatchQuoteLines,
  createQuoteFromRfq,
  type ExtractedQuoteItem,
} from "@/lib/quote-from-rfq";

export type GenerateQuoteInput = {
  rawText: string;
  subject?: string;
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  filename?: string;
  partyId?: string;
  extractedItems?: ExtractedQuoteItem[];
};

const partyWithBilling = {
  addresses: {
    where: { type: "BILLING" as const },
    orderBy: { isDefault: "desc" as const },
    take: 1,
  },
};

async function loadClient(partyId?: string, name?: string) {
  if (partyId?.trim()) {
    return prisma.party.findFirst({
      where: { id: partyId.trim(), active: true, type: { not: "OTHER" } },
      include: partyWithBilling,
    });
  }
  const q = name?.trim() || "";
  if (q.length < 2) return null;
  return prisma.party.findFirst({
    where: {
      active: true,
      type: { not: "OTHER" },
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { tradeName: { contains: q, mode: "insensitive" } },
      ],
    },
    include: partyWithBilling,
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

  const rfq = await createRfqWithMessage({
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
  const party = await loadClient(input.partyId, lookupName);
  const billing = party?.addresses[0];

  if (party || (input.extractedItems && input.extractedItems.length > 0)) {
    const existingSpecs =
      rfq.parsedSpecs && typeof rfq.parsedSpecs === "object"
        ? (rfq.parsedSpecs as Record<string, unknown>)
        : {};
    await prisma.rfq.update({
      where: { id: rfq.id },
      data: {
        ...(party
          ? {
              customerCompany: rfq.customerCompany || party.legalName,
              customerName: rfq.customerName || party.legalName,
              customerEmail: rfq.customerEmail || party.email || "",
              customerPhone: rfq.customerPhone || party.phone || "",
            }
          : {}),
        ...(input.extractedItems && input.extractedItems.length > 0
          ? {
              parsedSpecs: {
                ...existingSpecs,
                items: input.extractedItems.map((item) => ({
                  description: [item.productName, item.model].filter(Boolean).join(" "),
                  productName: item.productName,
                  model: item.model,
                  quantity: item.quantity,
                  unit: item.unit,
                })),
              } as Prisma.InputJsonValue,
            }
          : {}),
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
