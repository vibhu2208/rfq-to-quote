import type { ParsedMail } from "mailparser";
import type { Quote, QuoteReplyIntent, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompanyConfig } from "@/lib/company";
import { sendGmailEmail } from "@/lib/gmail-smtp";
import { decimalToNumber, makeQuoteThreadRef } from "@/lib/quotes";
import {
  analyzeQuoteReply,
  buildAutoReplyBody,
  shouldAutoSendQuoteReply,
  type QuoteReplyAnalysis,
  type QuoteReplyKnowledge,
} from "@/lib/ai/analyze-quote-reply";
import {
  captureHumanQa,
  searchKnowledge,
  stripQuotedHistory,
  stripCompanySignature,
} from "@/lib/ai/knowledge";

const QUOTE_NUMBER_RE = /\b(Q-\d{4}-\d+)\b/i;
const QREF_RE = /\[QREF[:\-]([^\]]+)\]/i;

export { makeQuoteThreadRef };

function normalizeMsgId(id?: string | null): string {
  return (id || "").replace(/[<>]/g, "").trim();
}

function parseAddressFromMail(parsed: ParsedMail): { name: string; email: string } {
  const fromRaw =
    parsed.from?.text || parsed.from?.value?.[0]?.address || "";
  const raw = typeof fromRaw === "string" ? fromRaw : String(fromRaw);
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  if (raw.includes("@")) return { name: "", email: raw.trim().toLowerCase() };
  return { name: raw.trim(), email: "" };
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
  return [...refs].filter(Boolean);
}

function emailBody(parsed: ParsedMail): string {
  return (
    (parsed.text || "").trim() ||
    (parsed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
}

export function extractQuoteNumberFromText(...parts: string[]): string | null {
  for (const part of parts) {
    const qref = part.match(QREF_RE);
    if (qref?.[1]) {
      const fromRef = qref[1].replace(/^QREF-/i, "").trim();
      if (QUOTE_NUMBER_RE.test(fromRef)) return fromRef.toUpperCase();
      const nested = fromRef.match(QUOTE_NUMBER_RE);
      if (nested) return nested[1].toUpperCase();
    }
    const bracket = part.match(/\[(QREF-[^\]]+)\]/i);
    if (bracket?.[1]) {
      const nested = bracket[1].match(QUOTE_NUMBER_RE);
      if (nested) return nested[1].toUpperCase();
    }
    const direct = part.match(QUOTE_NUMBER_RE);
    if (direct) return direct[1].toUpperCase();
  }
  return null;
}

async function findQuoteForInbound(input: {
  messageId: string;
  fromEmail: string;
  subject: string;
  body: string;
  referenceIds: string[];
}): Promise<Quote | null> {
  if (input.referenceIds.length > 0) {
    const byOutbound = await prisma.quote.findFirst({
      where: {
        outboundMsgId: { in: input.referenceIds },
        status: { not: "DRAFT" },
      },
      orderBy: { sentAt: "desc" },
    });
    if (byOutbound) return byOutbound;

    const byThreadMsg = await prisma.quoteMessage.findFirst({
      where: { messageId: { in: input.referenceIds } },
      include: { quote: true },
      orderBy: { createdAt: "desc" },
    });
    if (byThreadMsg?.quote) return byThreadMsg.quote;
  }

  const quoteNumber = extractQuoteNumberFromText(input.subject, input.body);
  if (quoteNumber) {
    const byNumber = await prisma.quote.findUnique({
      where: { quoteNumber },
    });
    if (byNumber && byNumber.status !== "DRAFT") return byNumber;
  }

  const threadRefMatch =
    input.subject.match(QREF_RE)?.[1] ||
    input.body.match(QREF_RE)?.[1] ||
    input.subject.match(/\[(QREF-[^\]]+)\]/i)?.[1] ||
    input.body.match(/\[(QREF-[^\]]+)\]/i)?.[1];
  if (threadRefMatch) {
    const cleaned = threadRefMatch.replace(/^QREF-/i, "");
    const refVariants = [
      threadRefMatch,
      `QREF-${cleaned}`,
      threadRefMatch.startsWith("QREF-") ? threadRefMatch : `QREF-${threadRefMatch}`,
    ];
    const byRef = await prisma.quote.findFirst({
      where: {
        OR: refVariants.map((threadRef) => ({ threadRef })),
        status: { not: "DRAFT" },
      },
    });
    if (byRef) return byRef;
  }

  if (input.fromEmail) {
    const recent = await prisma.quote.findFirst({
      where: {
        buyerEmail: { equals: input.fromEmail, mode: "insensitive" },
        status: {
          in: [
            "SENT",
            "VIEWED",
            "UNDER_NEGOTIATION",
            "REVISED",
            "ACCEPTED",
            "REJECTED",
          ],
        },
        sentAt: { not: null },
      },
      orderBy: { sentAt: "desc" },
    });
    if (recent) return recent;
  }

  return null;
}

function shouldAutoSend(analysis: QuoteReplyAnalysis): boolean {
  return shouldAutoSendQuoteReply(analysis);
}

export async function loadQuoteKnowledge(quoteId: string): Promise<QuoteReplyKnowledge | null> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { product: { select: { code: true, hsnCode: true } } },
      },
    },
  });
  if (!quote) return null;

  const company = getCompanyConfig();
  return {
    quoteNumber: quote.quoteNumber,
    buyerName: quote.buyerName,
    buyerCompany: quote.buyerCompany,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    buyerState: quote.buyerState,
    buyerAddress: quote.buyerAddress,
    withGst: quote.withGst,
    gstMode: quote.gstMode,
    subtotal: decimalToNumber(quote.subtotal),
    gstAmount: decimalToNumber(quote.gstAmount),
    deliveryCharge: decimalToNumber(quote.deliveryCharge),
    discountAmount: decimalToNumber(quote.discountAmount),
    discountPercent: decimalToNumber(quote.discountPercent),
    otherTaxAmount: decimalToNumber(quote.otherTaxAmount),
    otherTaxLabel: quote.otherTaxLabel,
    grandTotal: decimalToNumber(quote.grandTotal),
    notes: quote.notes,
    validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
    currency: "INR",
    companyName: company.name,
    companyGstin: company.gstin,
    companyEmail: company.email,
    companyPhone: company.phone,
    companyAddress: company.address,
    sellerState: company.sellerState,
    lineItems: quote.lineItems.map((li) => ({
      description: li.aliasName?.trim() || li.description,
      productCode: li.product?.code || "",
      qty: decimalToNumber(li.qty),
      unit: li.unit,
      unitPrice: decimalToNumber(li.unitPrice),
      taxRate: decimalToNumber(li.taxRate),
      lineTotal: decimalToNumber(li.lineTotal),
    })),
  };
}

export type HandleQuoteReplyResult =
  | { handled: false }
  | {
      handled: true;
      quoteId: string;
      quoteNumber: string;
      intent: QuoteReplyIntent;
      needsAssistance: boolean;
      autoReplied: boolean;
      status: QuoteStatus;
      alreadyCaptured?: boolean;
    };

/**
 * Match an inbound email to a sent quote, store the thread message,
 * analyze intent, update lifecycle status, and optionally auto-reply.
 *
 * When `expectedQuoteId` is set (per-quote thread check), only that quote
 * is considered and buyer-email + quote-number matching is allowed.
 */
export async function handleQuoteReplyEmail(
  parsed: ParsedMail,
  options?: { expectedQuoteId?: string }
): Promise<HandleQuoteReplyResult> {
  const expectedQuoteId = options?.expectedQuoteId;
  const messageId = normalizeMsgId(parsed.messageId);
  if (messageId) {
    const dup = await prisma.quoteMessage.findFirst({
      where: { messageId },
      select: { id: true, quoteId: true },
    });
    if (dup) {
      if (expectedQuoteId && dup.quoteId !== expectedQuoteId) {
        return { handled: false };
      }
      const existingQuote = await prisma.quote.findUnique({
        where: { id: dup.quoteId },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          needsAssistance: true,
          lastReplyIntent: true,
        },
      });
      if (existingQuote) {
        return {
          handled: true,
          quoteId: existingQuote.id,
          quoteNumber: existingQuote.quoteNumber,
          intent: existingQuote.lastReplyIntent || "UNCLEAR",
          needsAssistance: existingQuote.needsAssistance,
          autoReplied: false,
          status: existingQuote.status,
          alreadyCaptured: true,
        };
      }
      return {
        handled: true,
        quoteId: dup.quoteId,
        quoteNumber: "",
        intent: "UNCLEAR",
        needsAssistance: false,
        autoReplied: false,
        status: "SENT",
        alreadyCaptured: true,
      };
    }
  }

  const { name: fromName, email: fromEmail } = parseAddressFromMail(parsed);
  const subject = parsed.subject || "";
  // Some clients send HTML-only or near-empty replies; still capture the thread.
  const body =
    emailBody(parsed).trim() ||
    subject.trim() ||
    "(no text content)";

  const referenceIds = collectReferenceIds(parsed);

  let quote: Quote | null = null;
  if (expectedQuoteId) {
    quote = await prisma.quote.findUnique({ where: { id: expectedQuoteId } });
    // Allow thread capture after send even if status was left as DRAFT with sentAt set.
    if (!quote || (quote.status === "DRAFT" && !quote.sentAt)) {
      return { handled: false };
    }

    const matchedByRefs =
      (quote.outboundMsgId && referenceIds.includes(quote.outboundMsgId)) ||
      (await prisma.quoteMessage.count({
        where: { quoteId: quote.id, messageId: { in: referenceIds } },
      })) > 0;
    const matchedByNumber =
      extractQuoteNumberFromText(subject, body)?.toUpperCase() ===
      quote.quoteNumber.toUpperCase();
    const matchedByThreadRef =
      Boolean(quote.threadRef) &&
      (subject.includes(quote.threadRef) || body.includes(quote.threadRef));
    const matchedByBuyer =
      Boolean(quote.buyerEmail) &&
      fromEmail.toLowerCase() === quote.buyerEmail.trim().toLowerCase();
    // Also accept mail from whoever we actually sent the quote to (may differ from buyerEmail on older rows).
    const matchedByOutboundTo =
      Boolean(fromEmail) &&
      (await prisma.quoteMessage.count({
        where: {
          quoteId: quote.id,
          direction: "OUT",
          toEmail: { equals: fromEmail, mode: "insensitive" },
        },
      })) > 0;

    // For a targeted check: accept refs / QREF / quote number / buyer / outbound recipient.
    if (
      !matchedByRefs &&
      !matchedByNumber &&
      !matchedByThreadRef &&
      !matchedByBuyer &&
      !matchedByOutboundTo
    ) {
      return { handled: false };
    }
  } else {
    quote = await findQuoteForInbound({
      messageId,
      fromEmail,
      subject,
      body,
      referenceIds,
    });
    if (!quote) return { handled: false };

    // Require a strong signal so new RFQs from the same buyer are not swallowed.
    const matchedByRefs =
      (quote.outboundMsgId && referenceIds.includes(quote.outboundMsgId)) ||
      (await prisma.quoteMessage.count({
        where: { quoteId: quote.id, messageId: { in: referenceIds } },
      })) > 0;
    const matchedByNumber = Boolean(extractQuoteNumberFromText(subject, body));
    const matchedByThreadRef =
      Boolean(quote.threadRef) &&
      (subject.includes(quote.threadRef) || body.includes(quote.threadRef));

    if (!matchedByRefs && !matchedByNumber && !matchedByThreadRef) {
      return { handled: false };
    }
  }

  const knowledge = await loadQuoteKnowledge(quote.id);
  if (!knowledge) return { handled: false };

  const qaHits = await searchKnowledge(body);
  const analysis = await analyzeQuoteReply({
    subject,
    body,
    knowledge: {
      ...knowledge,
      buyerName: knowledge.buyerName || fromName,
    },
    knowledgeEntries: qaHits.map((h) => ({
      question: h.question,
      answer: h.answer,
      tags: h.tags,
    })),
  });

  const nextStatus =
    analysis.statusUpdate && quote.status !== "CLOSED" && quote.status !== "DELIVERED"
      ? analysis.statusUpdate
      : quote.status;

  const company = getCompanyConfig();
  // Grounded answers: send suggestedReply. Unknown asks: holding note only (flag human).
  const autoBody = shouldAutoSend(analysis)
    ? buildAutoReplyBody({
        intent: analysis.intent,
        buyerName: quote.buyerName || fromName,
        quoteNumber: quote.quoteNumber,
        companyName: company.name,
        suggestedReply: analysis.needsAssistance
          ? undefined
          : analysis.suggestedReply,
      })
    : null;

  let autoReplied = false;
  let outboundAutoMsgId = "";

  if (autoBody && quote.buyerEmail) {
    try {
      const threadRef = quote.threadRef || makeQuoteThreadRef(quote.quoteNumber);
      const replySubject = subject.toLowerCase().startsWith("re:")
        ? subject
        : `Re: Quotation ${quote.quoteNumber} [${threadRef}]`;
      const inReplyTo = messageId || quote.outboundMsgId || undefined;
      const refs = [quote.outboundMsgId, messageId].filter(Boolean).join(" ");
      const sent = await sendGmailEmail({
        to: quote.buyerEmail,
        subject: replySubject,
        text: autoBody,
        inReplyTo,
        references: refs || undefined,
      });
      outboundAutoMsgId = sent.messageId;
      autoReplied = true;
    } catch (err) {
      console.error("Auto-reply send failed:", err);
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.quoteMessage.create({
      data: {
        quoteId: quote.id,
        direction: "IN",
        channel: "EMAIL",
        subject,
        body: body.slice(0, 20000),
        messageId,
        inReplyTo: referenceIds[0] || "",
        fromEmail,
        toEmail: process.env.GMAIL_USER?.trim() || "",
        intent: analysis.intent,
        analysis: {
          confidence: analysis.confidence,
          summary: analysis.summary,
          counterPrice: analysis.counterPrice,
          needsAssistance: analysis.needsAssistance,
          assistanceReason: analysis.assistanceReason,
          suggestedReply: analysis.suggestedReply,
          answerableFromKnowledge: analysis.answerableFromKnowledge,
          unknownAsks: analysis.unknownAsks,
          usedQa: qaHits.map((h) => h.id),
        },
        autoReplied,
      },
    });

    if (autoReplied && outboundAutoMsgId) {
      await tx.quoteMessage.create({
        data: {
          quoteId: quote.id,
          direction: "OUT",
          channel: "EMAIL",
          subject: subject.toLowerCase().startsWith("re:")
            ? subject
            : `Re: Quotation ${quote.quoteNumber}`,
          body: autoBody || "",
          messageId: outboundAutoMsgId,
          inReplyTo: messageId,
          fromEmail: process.env.GMAIL_USER?.trim() || "",
          toEmail: quote.buyerEmail,
          intent: analysis.intent,
          analysis: { kind: "auto_reply", forIntent: analysis.intent },
          autoReplied: true,
        },
      });
    }

    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: nextStatus,
        needsAssistance: analysis.needsAssistance,
        assistanceReason: analysis.needsAssistance
          ? analysis.assistanceReason || analysis.summary
          : "",
        lastBuyerReplyAt: now,
        lastReplyIntent: analysis.intent,
        lastAnalysisSummary: analysis.summary,
        ...(fromEmail && !quote.buyerEmail.trim() ? { buyerEmail: fromEmail } : {}),
      },
    });

    if (quote.rfqId) {
      await tx.rfqMessage.create({
        data: {
          rfqId: quote.rfqId,
          direction: "IN",
          channel: "EMAIL",
          body: body.slice(0, 20000),
          meta: {
            kind: "quote_buyer_reply",
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            intent: analysis.intent,
            messageId,
            needsAssistance: analysis.needsAssistance,
          },
        },
      });
    }
  });

  return {
    handled: true,
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    intent: analysis.intent,
    needsAssistance: analysis.needsAssistance,
    autoReplied,
    status: nextStatus,
    alreadyCaptured: false,
  };
}

export async function sendQuoteFollowUpEmail(input: {
  quoteId: string;
  body: string;
  subject?: string;
  createdById?: string;
}): Promise<{
  ok: true;
  quoteNumber: string;
  to: string;
  subject: string;
  messageId: string;
}> {
  const body = input.body.trim();
  if (!body) throw new Error("Reply body is required.");

  const quote = await prisma.quote.findUnique({ where: { id: input.quoteId } });
  if (!quote) throw new Error("Quote not found.");
  const to = quote.buyerEmail.trim();
  if (!to) throw new Error("Quote has no buyer email.");

  const threadRef = quote.threadRef || makeQuoteThreadRef(quote.quoteNumber);
  const subject =
    input.subject?.trim() ||
    `Re: Quotation ${quote.quoteNumber} [${threadRef}]`;

  const lastInbound = await prisma.quoteMessage.findFirst({
    where: { quoteId: quote.id, direction: "IN" },
    orderBy: { createdAt: "desc" },
  });

  const inReplyTo = lastInbound?.messageId || quote.outboundMsgId || undefined;
  const refs = [quote.outboundMsgId, lastInbound?.messageId].filter(Boolean).join(" ");

  const company = getCompanyConfig();
  const text = body.includes(company.name) ? body : `${body}\n\nThanks,\n${company.name}`;

  const sent = await sendGmailEmail({
    to,
    subject,
    text,
    inReplyTo,
    references: refs || undefined,
  });

  await prisma.$transaction(async (tx) => {
    await tx.quoteMessage.create({
      data: {
        quoteId: quote.id,
        direction: "OUT",
        channel: "EMAIL",
        subject,
        body: text,
        messageId: sent.messageId,
        inReplyTo: inReplyTo || "",
        fromEmail: process.env.GMAIL_USER?.trim() || "",
        toEmail: to,
        analysis: { kind: "manual_reply", via: "copilot_or_lifecycle" },
      },
    });
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        needsAssistance: false,
        assistanceReason: "",
        status:
          quote.status === "SENT" || quote.status === "VIEWED"
            ? "UNDER_NEGOTIATION"
            : quote.status,
      },
    });
  });

  const inboundAnalysis =
    lastInbound?.analysis && typeof lastInbound.analysis === "object"
      ? (lastInbound.analysis as { needsAssistance?: boolean; unknownAsks?: unknown })
      : null;
  const inboundUnknownAsks = Array.isArray(inboundAnalysis?.unknownAsks)
    ? inboundAnalysis.unknownAsks.filter((v): v is string => typeof v === "string")
    : [];
  const shouldLearn =
    quote.needsAssistance ||
    inboundAnalysis?.needsAssistance === true ||
    inboundUnknownAsks.length > 0;

  if (shouldLearn && lastInbound) {
    void captureHumanQa({
      question: stripQuotedHistory(lastInbound.body),
      answer: stripCompanySignature(body, company.name),
      quoteId: quote.id,
      inboundMessageId: lastInbound.id,
      createdById: input.createdById,
      source: "HUMAN_REPLY",
    }).catch((err) => console.error("captureHumanQa failed:", err));
  }

  return {
    ok: true,
    quoteNumber: quote.quoteNumber,
    to,
    subject,
    messageId: sent.messageId,
  };
}

export async function getQuoteLifecycle(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      rfq: {
        select: {
          id: true,
          subject: true,
          channel: true,
          status: true,
          createdAt: true,
          sourceRef: true,
        },
      },
    },
  });
  if (!quote) return null;

  const stages: Array<{
    key: string;
    label: string;
    at: string | null;
    active: boolean;
    done: boolean;
  }> = [
    {
      key: "DRAFT",
      label: "Draft created",
      at: quote.createdAt.toISOString(),
      active: quote.status === "DRAFT",
      done: true,
    },
    {
      key: "SENT",
      label: "Sent to buyer",
      at: quote.sentAt?.toISOString() ?? null,
      active: quote.status === "SENT",
      done: Boolean(quote.sentAt) || quote.status !== "DRAFT",
    },
    {
      key: "VIEWED",
      label: "Buyer engaged",
      at: quote.lastBuyerReplyAt?.toISOString() ?? null,
      active: quote.status === "VIEWED" || quote.status === "UNDER_NEGOTIATION",
      done:
        Boolean(quote.lastBuyerReplyAt) ||
        ["VIEWED", "UNDER_NEGOTIATION", "REVISED", "ACCEPTED", "REJECTED", "INVOICE_GENERATED", "PAYMENT_PENDING", "PAYMENT_RECEIVED", "DELIVERED", "CLOSED"].includes(
          quote.status
        ),
    },
    {
      key: "DECISION",
      label: "Accepted / Rejected",
      at:
        quote.status === "ACCEPTED" || quote.status === "REJECTED"
          ? quote.updatedAt.toISOString()
          : null,
      active: quote.status === "ACCEPTED" || quote.status === "REJECTED",
      done: ["ACCEPTED", "REJECTED", "INVOICE_GENERATED", "PAYMENT_PENDING", "PAYMENT_RECEIVED", "DELIVERED", "CLOSED"].includes(
        quote.status
      ),
    },
    {
      key: "CLOSED",
      label: "Closed",
      at: quote.status === "CLOSED" ? quote.updatedAt.toISOString() : null,
      active: quote.status === "CLOSED",
      done: quote.status === "CLOSED" || quote.status === "DELIVERED",
    },
  ];

  return {
    quote: {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      needsAssistance: quote.needsAssistance,
      assistanceReason: quote.assistanceReason,
      lastBuyerReplyAt: quote.lastBuyerReplyAt?.toISOString() ?? null,
      lastReplyIntent: quote.lastReplyIntent,
      lastAnalysisSummary: quote.lastAnalysisSummary,
      sentAt: quote.sentAt?.toISOString() ?? null,
      outboundMsgId: quote.outboundMsgId,
      threadRef: quote.threadRef,
      buyerEmail: quote.buyerEmail,
      grandTotal: decimalToNumber(quote.grandTotal),
    },
    rfq: quote.rfq,
    stages,
    messages: quote.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      channel: m.channel,
      subject: m.subject,
      body: m.body,
      messageId: m.messageId,
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      intent: m.intent,
      analysis: m.analysis,
      autoReplied: m.autoReplied,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
