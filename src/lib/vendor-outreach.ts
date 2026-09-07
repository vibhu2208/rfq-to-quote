import type { ParsedMail } from "mailparser";
import { prisma } from "@/lib/prisma";
import { sendGmailEmail } from "@/lib/gmail-smtp";
import {
  extractThreadRef,
  parseVendorQuotedPrice,
} from "@/lib/parse-vendor-price";
import { matchVendorsToRfq } from "@/lib/vendor-match";

function makeThreadRef(rfqId: string): string {
  const rfqPart = rfqId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `QF-${rfqPart}-${rand}`;
}

function buildOutreachEmail(input: {
  vendorName: string;
  threadRef: string;
  category: string;
  productKey: string;
  subject: string;
  rawText: string;
  parsedSummary?: string;
}) {
  const company = process.env.COMPANY_NAME || "QuoteFlow";
  const summary =
    input.parsedSummary?.trim() ||
    input.rawText.trim().slice(0, 1200) ||
    "(see customer request below)";

  const body = `Hello ${input.vendorName},

We have a customer RFQ and need your best revised quote (INR per unit).

Category: ${input.category || "General"}
Product key: ${input.productKey || "—"}
Customer subject: ${input.subject || "(no subject)"}

Request summary:
${summary}

Please reply to this email with your unit price in INR.

Reference: [REF:${input.threadRef}]

Thanks,
${company}`;

  const emailSubject = `Quote request — ${input.category || "RFQ"} [REF:${input.threadRef}]`;
  return { emailSubject, body };
}

function parseAddressFromMail(parsed: ParsedMail): string {
  const fromRaw =
    parsed.from?.text || parsed.from?.value?.[0]?.address || "";
  if (typeof fromRaw !== "string") return String(fromRaw).toLowerCase();
  const match = fromRaw.match(/<([^>]+)>/);
  return (match?.[1] || fromRaw).trim().toLowerCase();
}

function normalizeMsgId(id?: string | null): string {
  return (id || "").replace(/[<>]/g, "").trim();
}

function collectReferenceIds(parsed: ParsedMail): string[] {
  const refs = new Set<string>();
  const inReplyTo = normalizeMsgId(parsed.inReplyTo as string | undefined);
  if (inReplyTo) refs.add(inReplyTo);

  const references = parsed.references;
  if (Array.isArray(references)) {
    for (const ref of references) refs.add(normalizeMsgId(ref));
  } else if (typeof references === "string") {
    for (const ref of references.split(/\s+/)) {
      const normalized = normalizeMsgId(ref);
      if (normalized) refs.add(normalized);
    }
  }
  return [...refs];
}

function emailBody(parsed: ParsedMail): string {
  return (
    (parsed.text || "").trim() ||
    (parsed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
}

export type OutreachSummary = {
  id: string;
  vendorId: string;
  status: string;
  threadRef: string;
  quotedPrice: number | null;
  sentAt: string | null;
  repliedAt: string | null;
  errorMessage: string;
};

export async function getOutreachMapForRfq(
  rfqId: string
): Promise<Map<string, OutreachSummary>> {
  const rows = await prisma.vendorOutreach.findMany({
    where: { rfqId },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, OutreachSummary>();
  for (const row of rows) {
    map.set(row.vendorId, {
      id: row.id,
      vendorId: row.vendorId,
      status: row.status,
      threadRef: row.threadRef,
      quotedPrice: row.quotedPrice ? Number(row.quotedPrice) : null,
      sentAt: row.sentAt?.toISOString() || null,
      repliedAt: row.repliedAt?.toISOString() || null,
      errorMessage: row.errorMessage,
    });
  }
  return map;
}

/** Send a Recore quote request email to a vendor for an RFQ. */
export async function sendVendorRecore(input: {
  rfqId: string;
  vendorId: string;
  productKey?: string;
}) {
  const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
  if (!rfq) throw new Error("RFQ not found");

  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
  });
  if (!vendor || !vendor.active) throw new Error("Vendor not found");
  if (!vendor.email) {
    throw new Error("Vendor has no email address — add one on the Vendors page.");
  }

  const matchResult = await matchVendorsToRfq({
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  });
  const productKey =
    input.productKey || matchResult.productKey || "general";

  const meta = (rfq.parsedSpecs as { _meta?: { summary?: string } } | null)
    ?._meta;
  const threadRef = makeThreadRef(rfq.id);
  const { emailSubject, body } = buildOutreachEmail({
    vendorName: vendor.name,
    threadRef,
    category: rfq.parsedCategory || "General",
    productKey,
    subject: rfq.subject,
    rawText: rfq.rawText,
    parsedSummary: meta?.summary,
  });

  const outreach = await prisma.vendorOutreach.upsert({
    where: {
      rfqId_vendorId: { rfqId: rfq.id, vendorId: vendor.id },
    },
    create: {
      rfqId: rfq.id,
      vendorId: vendor.id,
      productKey,
      threadRef,
      status: "PENDING",
      outboundSubject: emailSubject,
      outboundBody: body,
    },
    update: {
      productKey,
      threadRef,
      status: "PENDING",
      outboundSubject: emailSubject,
      outboundBody: body,
      outboundMsgId: "",
      replyText: "",
      replyMsgId: "",
      quotedPrice: null,
      sentAt: null,
      repliedAt: null,
      errorMessage: "",
    },
  });

  try {
    const sent = await sendGmailEmail({
      to: vendor.email,
      subject: emailSubject,
      text: body,
    });

    const updated = await prisma.vendorOutreach.update({
      where: { id: outreach.id },
      data: {
        status: "SENT",
        outboundMsgId: sent.messageId,
        sentAt: new Date(),
        errorMessage: "",
      },
    });

    await prisma.rfqMessage.create({
      data: {
        rfqId: rfq.id,
        direction: "OUT",
        channel: "EMAIL",
        body: `Recore sent to ${vendor.name} <${vendor.email}>\n\n${body}`,
        meta: {
          type: "vendor_recore",
          vendorId: vendor.id,
          outreachId: outreach.id,
          threadRef,
          messageId: sent.messageId,
        },
      },
    });

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return prisma.vendorOutreach.update({
      where: { id: outreach.id },
      data: { status: "FAILED", errorMessage: message },
    });
  }
}

export type VendorReplyResult =
  | { handled: false }
  | {
      handled: true;
      outreachId: string;
      rfqId: string;
      vendorId: string;
      quotedPrice: number | null;
    };

/** Match an inbound Gmail message to a vendor outreach reply. */
export async function handleVendorReplyEmail(
  parsed: ParsedMail
): Promise<VendorReplyResult> {
  const fromEmail = parseAddressFromMail(parsed);
  const text = emailBody(parsed);
  if (!fromEmail || !text) return { handled: false };

  const messageId = normalizeMsgId(parsed.messageId).slice(0, 240);
  if (messageId) {
    const duplicate = await prisma.vendorOutreach.findFirst({
      where: { replyMsgId: messageId },
      select: { id: true, rfqId: true, vendorId: true, quotedPrice: true },
    });
    if (duplicate) {
      return {
        handled: true,
        outreachId: duplicate.id,
        rfqId: duplicate.rfqId,
        vendorId: duplicate.vendorId,
        quotedPrice: duplicate.quotedPrice
          ? Number(duplicate.quotedPrice)
          : null,
      };
    }
  }

  const threadRef =
    extractThreadRef(`${parsed.subject || ""}\n${text}`) || null;
  const referenceIds = collectReferenceIds(parsed);

  let outreach = threadRef
    ? await prisma.vendorOutreach.findUnique({
        where: { threadRef },
        include: { vendor: true },
      })
    : null;

  if (!outreach && referenceIds.length > 0) {
    outreach = await prisma.vendorOutreach.findFirst({
      where: { outboundMsgId: { in: referenceIds } },
      include: { vendor: true },
      orderBy: { sentAt: "desc" },
    });
  }

  if (!outreach) {
    outreach = await prisma.vendorOutreach.findFirst({
      where: {
        status: { in: ["SENT", "REPLIED"] },
        vendor: { email: { equals: fromEmail, mode: "insensitive" } },
      },
      include: { vendor: true },
      orderBy: { sentAt: "desc" },
    });
  }

  if (!outreach) return { handled: false };

  const vendorEmail = outreach.vendor.email?.toLowerCase();
  if (vendorEmail && fromEmail !== vendorEmail) {
    return { handled: false };
  }

  const quotedPrice = parseVendorQuotedPrice(text);
  const now = new Date();

  await prisma.vendorOutreach.update({
    where: { id: outreach.id },
    data: {
      status: "REPLIED",
      replyText: text.slice(0, 20000),
      replyMsgId: messageId,
      quotedPrice: quotedPrice ?? undefined,
      repliedAt: now,
    },
  });

  if (quotedPrice != null && outreach.productKey) {
    await prisma.vendorProductHistory.upsert({
      where: {
        vendorId_productKey: {
          vendorId: outreach.vendorId,
          productKey: outreach.productKey,
        },
      },
      create: {
        vendorId: outreach.vendorId,
        productKey: outreach.productKey,
        lastPrice: quotedPrice,
        lastQuotedAt: now,
        sourceRfqId: outreach.rfqId,
      },
      update: {
        lastPrice: quotedPrice,
        lastQuotedAt: now,
        sourceRfqId: outreach.rfqId,
      },
    });
  }

  await prisma.rfqMessage.create({
    data: {
      rfqId: outreach.rfqId,
      direction: "IN",
      channel: "EMAIL",
      body: `Vendor reply from ${outreach.vendor.name} <${fromEmail}>${quotedPrice != null ? `\nQuoted price: ₹${quotedPrice.toLocaleString("en-IN")}` : ""}\n\n${text}`,
      meta: {
        type: "vendor_reply",
        vendorId: outreach.vendorId,
        outreachId: outreach.id,
        threadRef: outreach.threadRef,
        quotedPrice,
        messageId,
      },
    },
  });

  return {
    handled: true,
    outreachId: outreach.id,
    rfqId: outreach.rfqId,
    vendorId: outreach.vendorId,
    quotedPrice,
  };
}
