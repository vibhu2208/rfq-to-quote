import { Prisma, type RfqChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseRfqWithAi, statusFromConfidence } from "@/lib/ai/parse-rfq";

export type AttachmentMeta = {
  name: string;
  url?: string;
  contentType?: string;
};

export type CreateRfqInput = {
  channel: RfqChannel;
  sourceRef?: string;
  subject?: string;
  rawText: string;
  rawAttachments?: AttachmentMeta[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCompany?: string;
  /** Run OpenRouter parse immediately (default true when key present) */
  autoParse?: boolean;
};

function marketplaceFromEmail(from: string): boolean {
  const lower = from.toLowerCase();
  return (
    lower.includes("indiamart.com") ||
    lower.includes("tradeindia.com") ||
    lower.includes("leads@") ||
    lower.includes("@marketplace")
  );
}

export function resolveEmailChannel(fromEmail: string): RfqChannel {
  return marketplaceFromEmail(fromEmail) ? "MARKETPLACE" : "EMAIL";
}

export async function createRfqWithMessage(input: CreateRfqInput) {
  const autoParse =
    input.autoParse ?? Boolean(process.env.OPENROUTER_API_KEY);

  // Deduplicate by sourceRef (email Message-ID / webhook id)
  if (input.sourceRef) {
    const existing = await prisma.rfq.findFirst({
      where: { sourceRef: input.sourceRef },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) return existing;
  }

  const rfq = await prisma.rfq.create({
    data: {
      channel: input.channel,
      sourceRef: input.sourceRef || "",
      subject: input.subject || "",
      rawText: input.rawText,
      rawAttachments: (input.rawAttachments || []) as Prisma.InputJsonValue,
      customerName: input.customerName || "",
      customerPhone: input.customerPhone || "",
      customerEmail: input.customerEmail || "",
      customerCompany: input.customerCompany || "",
      status: "NEW",
      messages: {
        create: {
          direction: "IN",
          channel: input.channel,
          body: input.rawText,
          meta: {
            subject: input.subject || "",
            sourceRef: input.sourceRef || "",
          },
        },
      },
    },
    include: { messages: true },
  });

  if (autoParse && input.rawText.trim()) {
    try {
      return await parseAndUpdateRfq(rfq.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Parse failed";
      return prisma.rfq.update({
        where: { id: rfq.id },
        data: { parseError: message, status: "NEEDS_REVIEW" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
  }

  return prisma.rfq.findUniqueOrThrow({
    where: { id: rfq.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function parseAndUpdateRfq(rfqId: string) {
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  const result = await parseRfqWithAi(rfq.rawText, rfq.subject);
  const status = statusFromConfidence(result.confidence);

  return prisma.rfq.update({
    where: { id: rfqId },
    data: {
      parsedCategory: result.productCategory,
      parsedSpecs: {
        ...result.specs,
        _meta: {
          language: result.language,
          summary: result.summary,
        },
      } as Prisma.InputJsonValue,
      parseConfidence: result.confidence,
      parseError: null,
      status,
      marketplacePrices: Prisma.DbNull,
      marketplaceQuery: null,
      marketplaceFetchedAt: null,
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      quotes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, quoteNumber: true, status: true, grandTotal: true },
      },
    },
  });
}
