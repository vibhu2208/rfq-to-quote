import type { ParsedMail } from "mailparser";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeOutboundEmailText } from "@/lib/email-text";
import { sendGmailEmail } from "@/lib/gmail-smtp";
import {
  normalizeWhatsAppNumber,
  sendWhatsAppText,
} from "@/lib/whatsapp";
import { parseVendorReplyWithAi } from "@/lib/ai/parse-vendor-reply";
import {
  classifyVendorReplyIntent,
  formatVendorNegotiationEmail,
} from "@/lib/ai/vendor-negotiation";
import {
  applyAcceptedNegotiationDiscounts,
  lineItemsLookPlausible,
  preferPlausibleLinePrices,
  stripEmailQuotedHistory,
} from "@/lib/vendor-price-apply";
import {
  extractThreadRef,
  type VendorQuotedLineItem,
} from "@/lib/parse-vendor-price";
import { normalizeProductKey } from "@/lib/product-key";
import { extractRfqItems } from "@/lib/rfq-items";

function makeThreadRef(rfqId: string): string {
  const rfqPart = rfqId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `QF-${rfqPart}-${rand}`;
}

function formatItemsList(
  items: ReturnType<typeof extractRfqItems>
): string {
  if (items.length === 0) return "(no structured items — see request text below)";
  return items
    .map(
      (item) =>
        `${item.lineNumber}. ${item.description} - Qty: ${item.quantity} ${item.unit}${
          item.category ? ` [${item.category}]` : ""
        }`
    )
    .join("\n");
}

export function buildOutreachEmail(input: {
  vendorName: string;
  threadRef: string;
  category: string;
  productKey: string;
  subject: string;
  rawText: string;
  items: ReturnType<typeof extractRfqItems>;
  parsedSummary?: string;
  /** Optional greeting name; defaults to vendor company name. */
  contactName?: string;
}) {
  const company = process.env.COMPANY_NAME || "QuoteFlow";
  const itemsBlock = formatItemsList(input.items);
  const replyGuide =
    input.items.length > 1
      ? `Please reply with a unit price (INR) for EACH line, for example:
1. <product> - Rs.____ / unit
2. <product> - Rs.____ / unit
...
Total: Rs.____`
      : `Please reply to this email with your unit price in INR for the item above.`;

  const notes =
    input.parsedSummary?.trim() ||
    (input.items.length === 0
      ? input.rawText.trim().slice(0, 1200) || "(see customer request)"
      : "");

  const greeting = input.contactName?.trim() || input.vendorName;
  const body = `Hello ${greeting},

We have a customer RFQ and need your best revised quote (INR).

Category: ${input.category || "General"}
Product key: ${input.productKey || "—"}
Customer subject: ${input.subject || "(no subject)"}

Items requested:
${itemsBlock}
${notes ? `\nAdditional notes:\n${notes}\n` : ""}
${replyGuide}

Reference: [REF:${input.threadRef}]

Thanks,
${company}`;

  const emailSubject = `Quote request - ${input.category || "RFQ"} (${input.items.length || 1} item${(input.items.length || 1) === 1 ? "" : "s"}) [REF:${input.threadRef}]`;
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

/** Set outreach status via SQL so new enum values work even if the Prisma engine is stale. */
async function setOutreachStatus(
  id: string,
  status:
    | "PENDING"
    | "SENT"
    | "REPLIED"
    | "NEGOTIATING"
    | "DECLINED"
    | "FAILED"
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "VendorOutreach" SET status = $1::"VendorOutreachStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
    status,
    id
  );
}

function asQuotedLineItems(value: unknown): VendorQuotedLineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const lineNumber = Number(r.lineNumber);
      const unitPrice = Number(r.unitPrice);
      const quantity = Number(r.quantity) || 1;
      const description = String(r.description || "");
      const unit = String(r.unit || "pcs");
      if (!Number.isFinite(lineNumber) || !Number.isFinite(unitPrice)) return null;
      const lineTotal =
        Number.isFinite(Number(r.lineTotal)) && Number(r.lineTotal) > 0
          ? Number(r.lineTotal)
          : unitPrice * quantity;
      return {
        lineNumber,
        description,
        quantity,
        unit,
        unitPrice,
        lineTotal,
      } satisfies VendorQuotedLineItem;
    })
    .filter((row): row is VendorQuotedLineItem => row != null);
}

function asRequestedLineNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = [
    ...new Set(
      value
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 1)
        .map((n) => Math.trunc(n))
    ),
  ].sort((a, b) => a - b);
  return nums.length > 0 ? nums : null;
}

function filterItemsByLineNumbers(
  items: ReturnType<typeof extractRfqItems>,
  lineNumbers?: number[] | null
): ReturnType<typeof extractRfqItems> {
  const requested = asRequestedLineNumbers(lineNumbers ?? null);
  if (!requested) return items;
  const set = new Set(requested);
  return items.filter((item) => set.has(item.lineNumber));
}

/** RFQ lines the vendor was asked about (subset), or all lines if none stored. */
function expectedItemsForOutreach(
  parsedSpecs: unknown,
  rawText: string,
  requestedLineNumbers: unknown
): ReturnType<typeof extractRfqItems> {
  const all = extractRfqItems(parsedSpecs, rawText);
  const filtered = filterItemsByLineNumbers(
    all,
    asRequestedLineNumbers(requestedLineNumbers)
  );
  return filtered.length > 0 ? filtered : all;
}

export type OutreachSummary = {
  id: string;
  vendorId: string;
  status: string;
  threadRef: string;
  quotedPrice: number | null;
  quotedLineItems: VendorQuotedLineItem[];
  quotedTotal: number | null;
  requestedLineNumbers: number[] | null;
  replyIntent: string;
  negotiationNote: string;
  previousQuotedPrice: number | null;
  sentAt: string | null;
  repliedAt: string | null;
  negotiatedAt: string | null;
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
    const quotedLineItems = asQuotedLineItems(row.quotedLineItems);
    const quotedTotal =
      quotedLineItems.length > 0
        ? quotedLineItems.reduce((sum, line) => sum + line.lineTotal, 0)
        : row.quotedPrice
          ? Number(row.quotedPrice)
          : null;
    map.set(row.vendorId, {
      id: row.id,
      vendorId: row.vendorId,
      status: row.status,
      threadRef: row.threadRef,
      quotedPrice: row.quotedPrice ? Number(row.quotedPrice) : null,
      quotedLineItems,
      quotedTotal,
      requestedLineNumbers: asRequestedLineNumbers(row.requestedLineNumbers),
      replyIntent: row.replyIntent || "",
      negotiationNote: row.negotiationNote || "",
      previousQuotedPrice: row.previousQuotedPrice
        ? Number(row.previousQuotedPrice)
        : null,
      sentAt: row.sentAt?.toISOString() || null,
      repliedAt: row.repliedAt?.toISOString() || null,
      negotiatedAt: row.negotiatedAt?.toISOString() || null,
      errorMessage: row.errorMessage,
    });
  }
  return map;
}

function normalizeEmailList(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    ),
  ];
}

export async function previewVendorRecore(input: {
  rfqId: string;
  vendorId: string;
  productKey?: string;
  lineNumbers?: number[];
  contactIds?: string[];
}) {
  const [rfq, vendor, existing] = await Promise.all([
    prisma.rfq.findUnique({ where: { id: input.rfqId } }),
    prisma.vendor.findUnique({
      where: { id: input.vendorId },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      },
    }),
    prisma.vendorOutreach.findUnique({
      where: {
        rfqId_vendorId: { rfqId: input.rfqId, vendorId: input.vendorId },
      },
    }),
  ]);
  if (!rfq) throw new Error("RFQ not found");
  if (!vendor || !vendor.active) throw new Error("Vendor not found");

  type RecoreContact = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isPrimary: boolean;
  };
  let contacts: RecoreContact[] =
    vendor.contacts.length > 0
      ? vendor.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name || "",
          email: contact.email || "",
          phone: contact.phone || "",
          role: contact.role || "",
          isPrimary: contact.isPrimary,
        }))
      : [];
  const vendorWa = (vendor.whatsappId || vendor.phone || "").trim();
  const hasWaContact = contacts.some((contact) => Boolean(contact.phone.trim()));
  if (vendorWa && !hasWaContact) {
    contacts = [
      ...contacts,
      {
        id: `vendor-${vendor.id}-wa`,
        name: vendor.name,
        email: vendor.email || "",
        phone: vendorWa,
        role: "WhatsApp",
        isPrimary: contacts.length === 0,
      },
    ];
  } else if (contacts.length === 0 && (vendor.email || vendorWa)) {
    contacts = [
      {
        id: `vendor-${vendor.id}`,
        name: vendor.name,
        email: vendor.email || "",
        phone: vendorWa,
        role: "",
        isPrimary: true,
      },
    ];
  }

  const preferred =
    input.contactIds && input.contactIds.length > 0
      ? contacts.filter((contact) => input.contactIds!.includes(contact.id))
      : contacts.filter((contact) => contact.isPrimary);
  const recipients =
    preferred.length > 0 ? preferred : contacts.slice(0, 1);

  // Avoid full vendor matching on every draft preview — productKey is only a label.
  const productKey =
    (input.productKey && input.productKey.trim()) ||
    existing?.productKey ||
    normalizeProductKey({
      parsedCategory: rfq.parsedCategory,
      parsedSpecs: rfq.parsedSpecs,
      subject: rfq.subject,
      rawText: rfq.rawText,
    }) ||
    "general";

  const allItems = extractRfqItems(rfq.parsedSpecs, rfq.rawText);
  const requestedLineNumbers = asRequestedLineNumbers(input.lineNumbers ?? null);
  const items = filterItemsByLineNumbers(allItems, requestedLineNumbers);
  if (requestedLineNumbers && items.length === 0) {
    throw new Error("No matching RFQ lines for the selected line numbers.");
  }
  const storedLineNumbers =
    requestedLineNumbers ??
    (allItems.length > 0 ? allItems.map((item) => item.lineNumber) : null);
  const meta = (rfq.parsedSpecs as { _meta?: { summary?: string } } | null)
    ?._meta;

  const threadRef = existing?.threadRef || makeThreadRef(rfq.id);
  const greeting =
    recipients
      .map((contact) => contact.name?.trim())
      .filter(Boolean)
      .join(", ") || vendor.name;
  const draft = buildOutreachEmail({
    vendorName: vendor.name,
    contactName: greeting,
    threadRef,
    category: rfq.parsedCategory || "General",
    productKey,
    subject: rfq.subject,
    rawText: rfq.rawText,
    items,
    parsedSummary: meta?.summary,
  });

  return {
    vendor,
    contacts,
    recipients,
    productKey,
    items,
    storedLineNumbers,
    existing,
    threadRef,
    subject: normalizeOutboundEmailText(draft.emailSubject),
    body: normalizeOutboundEmailText(draft.body),
  };
}

function resolveVendorWhatsAppNumbers(input: {
  vendor: { phone?: string | null; whatsappId?: string | null };
  contacts: Array<{ id: string; phone?: string | null }>;
  contactIds?: string[];
  toPhones?: string[];
}): string[] {
  const selected =
    input.contactIds && input.contactIds.length > 0
      ? input.contacts.filter((contact) => input.contactIds!.includes(contact.id))
      : input.contacts.filter((contact) => contact.phone);
  const contactPhones = selected
    .map((contact) => contact.phone || "")
    .filter(Boolean);
  const raw = [
    ...(input.toPhones || []),
    ...(contactPhones.length > 0
      ? contactPhones
      : [input.vendor.whatsappId || "", input.vendor.phone || ""]),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!value?.trim()) continue;
    try {
      const normalized = normalizeWhatsAppNumber(value);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    } catch {
      // skip invalid numbers
    }
  }
  return out;
}

/** Send a Recore quote request to a vendor (email or WhatsApp). */
export async function sendVendorRecore(input: {
  rfqId: string;
  vendorId: string;
  productKey?: string;
  /** Original RFQ lineNumbers to include; omit = all lines. */
  lineNumbers?: number[];
  contactIds?: string[];
  toEmails?: string[];
  toPhones?: string[];
  channel?: "EMAIL" | "WHATSAPP";
  subject?: string;
  body?: string;
}) {
  const channel = input.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL";
  const preview = await previewVendorRecore(input);
  const { vendor, productKey, items, storedLineNumbers, existing, threadRef } =
    preview;

  const emailSubject = normalizeOutboundEmailText(
    input.subject?.trim() || preview.subject
  );
  const body = normalizeOutboundEmailText(input.body?.trim() || preview.body);
  if (!body) {
    throw new Error("Message body is required.");
  }
  if (channel === "EMAIL" && !emailSubject) {
    throw new Error("Subject and email body are required.");
  }

  let toEmails: string[] = [];
  let toPhones: string[] = [];
  if (channel === "EMAIL") {
    const contactEmails = preview.recipients
      .map((contact) => contact.email)
      .filter(Boolean);
    toEmails = normalizeEmailList([
      ...(input.toEmails || []),
      ...contactEmails,
      vendor.email || "",
    ]);
    if (toEmails.length === 0) {
      throw new Error(
        "No email addresses selected — add a POC email on the Vendors page."
      );
    }
  } else {
    toPhones = resolveVendorWhatsAppNumbers({
      vendor,
      contacts: preview.contacts,
      contactIds: input.contactIds,
      toPhones: input.toPhones,
    });
    if (toPhones.length === 0) {
      throw new Error(
        "No WhatsApp numbers selected — set vendor WhatsApp/phone or a POC phone on the Vendors page."
      );
    }
  }

  const outreach = await prisma.vendorOutreach.upsert({
    where: {
      rfqId_vendorId: { rfqId: input.rfqId, vendorId: vendor.id },
    },
    create: {
      rfqId: input.rfqId,
      vendorId: vendor.id,
      productKey,
      threadRef,
      status: "PENDING",
      outboundSubject: emailSubject || `WhatsApp request [REF:${threadRef}]`,
      outboundBody: body,
      requestedLineNumbers: storedLineNumbers ?? Prisma.DbNull,
    },
    update: {
      productKey,
      threadRef,
      status: existing?.status === "REPLIED" ? "REPLIED" : "PENDING",
      outboundSubject: emailSubject || `WhatsApp request [REF:${threadRef}]`,
      outboundBody: body,
      outboundMsgId: "",
      requestedLineNumbers: storedLineNumbers ?? Prisma.DbNull,
      errorMessage: "",
    },
  });

  try {
    let messageId = "";
    if (channel === "EMAIL") {
      const sent = await sendGmailEmail({
        to: toEmails.join(", "),
        subject: emailSubject,
        text: body,
      });
      messageId = sent.messageId;
    } else {
      const waBody = emailSubject
        ? `*${emailSubject}*\n\n${body}`
        : body;
      const sentIds: string[] = [];
      for (const phone of toPhones) {
        const sent = await sendWhatsAppText({ to: phone, body: waBody });
        sentIds.push(sent.messageId);
      }
      messageId = sentIds[0] || "";
    }

    const updated = await prisma.vendorOutreach.update({
      where: { id: outreach.id },
      data: {
        status:
          existing?.quotedPrice != null ||
          (Array.isArray(existing?.quotedLineItems) &&
            existing.quotedLineItems.length > 0)
            ? "REPLIED"
            : "SENT",
        outboundMsgId: messageId,
        sentAt: new Date(),
        errorMessage: "",
      },
    });

    await prisma.rfqMessage.create({
      data: {
        rfqId: input.rfqId,
        direction: "OUT",
        channel,
        body:
          channel === "EMAIL"
            ? `Recore emailed to ${vendor.name} <${toEmails.join(", ")}>\n\n${body}`
            : `Recore WhatsApp to ${vendor.name} <${toPhones.map((n) => `+${n}`).join(", ")}>\n\n${body}`,
        meta: {
          type: "vendor_recore",
          channel,
          vendorId: vendor.id,
          outreachId: outreach.id,
          threadRef,
          messageId,
          itemCount: items.length,
          recipients: channel === "EMAIL" ? toEmails : toPhones,
          contactIds: input.contactIds || [],
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

/** Send a negotiation email on the same Recore thread (AI-polished or manual). */
export async function sendVendorNegotiation(input: {
  rfqId: string;
  vendorId: string;
  mode?: "ai" | "manual";
  plainNote?: string;
  subject?: string;
  body?: string;
}) {
  const mode = input.mode === "manual" ? "manual" : "ai";
  const note = (input.plainNote || "").trim();

  const outreach = await prisma.vendorOutreach.findUnique({
    where: {
      rfqId_vendorId: { rfqId: input.rfqId, vendorId: input.vendorId },
    },
    include: {
      vendor: true,
      rfq: true,
    },
  });
  if (!outreach) {
    throw new Error("Send a Recore email and get a price before negotiating.");
  }
  if (!outreach.vendor.email) {
    throw new Error("Vendor has no email address.");
  }

  const lineItems = preferPlausibleLinePrices({
    previous: asQuotedLineItems(outreach.previousQuotedLineItems),
    next: asQuotedLineItems(outreach.quotedLineItems),
  });
  const hasPrice =
    outreach.quotedPrice != null || lineItems.length > 0;
  if (!hasPrice) {
    throw new Error("No vendor price yet — wait for a reply, then negotiate.");
  }

  const currentTotal =
    lineItems.length > 0
      ? lineItems.reduce((sum, line) => sum + line.lineTotal, 0)
      : outreach.quotedPrice
        ? Number(outreach.quotedPrice)
        : null;
  const rfqItems = expectedItemsForOutreach(
    outreach.rfq.parsedSpecs,
    outreach.rfq.rawText,
    outreach.requestedLineNumbers
  );

  const baseSubject =
    outreach.outboundSubject || `Quote negotiation [REF:${outreach.threadRef}]`;

  let subject: string;
  let body: string;
  if (mode === "manual") {
    subject = normalizeOutboundEmailText(input.subject || "");
    body = normalizeOutboundEmailText(input.body || "");
    if (!subject || body.length < 10) {
      throw new Error("Write the email subject and body before sending.");
    }
    if (!subject.includes(`[REF:${outreach.threadRef}]`)) {
      subject = `${subject} [REF:${outreach.threadRef}]`;
    }
    if (!/^re\s*:/i.test(subject)) {
      subject = `Re: ${subject}`;
    }
    if (!body.includes(`[REF:${outreach.threadRef}]`)) {
      body = `${body}\n\nReference: [REF:${outreach.threadRef}]`;
    }
  } else {
    if (note.length < 3) {
      throw new Error("Write a short negotiation note first.");
    }
    const drafted = await formatVendorNegotiationEmail({
      vendorName: outreach.vendor.name,
      plainNote: note,
      threadRef: outreach.threadRef,
      currentTotal,
      lineItems,
      rfqItems,
      subject: baseSubject,
    });
    subject = drafted.subject;
    body = drafted.body;
  }

  const inReplyTo = outreach.replyMsgId || outreach.outboundMsgId || undefined;
  const sent = await sendGmailEmail({
    to: outreach.vendor.email,
    subject,
    text: body,
    inReplyTo,
    references: inReplyTo,
  });

  const now = new Date();
  const noteForLog =
    mode === "manual"
      ? (note || body).slice(0, 4000)
      : note.slice(0, 4000);
  await prisma.vendorOutreach.update({
    where: { id: outreach.id },
    data: {
      negotiationNote: noteForLog,
      negotiatedAt: now,
      outboundSubject: subject,
      outboundBody: body,
      outboundMsgId: sent.messageId,
      replyIntent: "",
      previousQuotedPrice:
        currentTotal != null ? currentTotal : outreach.quotedPrice,
      previousQuotedLineItems:
        lineItems.length > 0 ? lineItems : outreach.quotedLineItems ?? Prisma.DbNull,
      errorMessage: "",
    },
  });
  await setOutreachStatus(outreach.id, "NEGOTIATING");
  const updated = await prisma.vendorOutreach.findUniqueOrThrow({
    where: { id: outreach.id },
  });

  await prisma.rfqMessage.create({
    data: {
      rfqId: outreach.rfqId,
      direction: "OUT",
      channel: "EMAIL",
      body:
        mode === "manual"
          ? `Negotiation (manual) sent to ${outreach.vendor.name} <${outreach.vendor.email}>\n\n${body}`
          : `Negotiation sent to ${outreach.vendor.name} <${outreach.vendor.email}>\n\nPlain note: ${note}\n\n${body}`,
      meta: {
        type: "vendor_negotiation",
        mode,
        vendorId: outreach.vendorId,
        outreachId: outreach.id,
        threadRef: outreach.threadRef,
        messageId: sent.messageId,
        plainNote: note || null,
      },
    },
  });

  return updated;
}

export type VendorReplyResult =
  | { handled: false }
  | {
      handled: true;
      outreachId: string;
      rfqId: string;
      vendorId: string;
      quotedPrice: number | null;
      quotedLineItems: VendorQuotedLineItem[];
      replyIntent?: string;
    };

/** Match an inbound mailbox message to a vendor outreach reply. */
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
      include: { vendor: true, rfq: true },
    });
    if (duplicate) {
      const existingLines = asQuotedLineItems(duplicate.quotedLineItems);
      const hasPrices =
        existingLines.length > 0 || duplicate.quotedPrice != null;
      if (hasPrices) {
        return {
          handled: true,
          outreachId: duplicate.id,
          rfqId: duplicate.rfqId,
          vendorId: duplicate.vendorId,
          quotedPrice: duplicate.quotedPrice
            ? Number(duplicate.quotedPrice)
            : null,
          quotedLineItems: existingLines,
        };
      }
      // Same reply already linked but prices missing — re-run AI parse below.
      // Fall through using this outreach.
    }
  }

  const threadRef =
    extractThreadRef(`${parsed.subject || ""}\n${text}`) || null;
  const referenceIds = collectReferenceIds(parsed);

  let outreach =
    messageId
      ? await prisma.vendorOutreach.findFirst({
          where: { replyMsgId: messageId },
          include: { vendor: true, rfq: true },
        })
      : null;

  if (!outreach && threadRef) {
    outreach = await prisma.vendorOutreach.findUnique({
      where: { threadRef },
      include: { vendor: true, rfq: true },
    });
  }

  // Older Recore emails may still carry a REF that was rewritten on re-send.
  if (!outreach && threadRef) {
    outreach = await prisma.vendorOutreach.findFirst({
      where: {
        OR: [
          { outboundSubject: { contains: threadRef } },
          { outboundBody: { contains: `[REF:${threadRef}]` } },
          { outboundBody: { contains: `[REF:${threadRef.toLowerCase()}]` } },
        ],
      },
      include: { vendor: true, rfq: true },
      orderBy: { sentAt: "desc" },
    });
  }

  if (!outreach && referenceIds.length > 0) {
    outreach = await prisma.vendorOutreach.findFirst({
      where: { outboundMsgId: { in: referenceIds } },
      include: { vendor: true, rfq: true },
      orderBy: { sentAt: "desc" },
    });
  }

  if (!outreach) {
    outreach = await prisma.vendorOutreach.findFirst({
      where: {
        status: { in: ["SENT", "REPLIED", "PENDING", "NEGOTIATING", "DECLINED"] },
        vendor: { email: { equals: fromEmail, mode: "insensitive" } },
      },
      include: { vendor: true, rfq: true },
      orderBy: { sentAt: "desc" },
    });
  }

  // WhatsApp replies: match open outreach by vendor phone / WhatsApp id.
  const whatsappPhone = fromEmail.match(/^(\d{10,15})@whatsapp\.local$/i)?.[1] || "";
  if (!outreach && whatsappPhone) {
    const tail = whatsappPhone.slice(-10);
    outreach = await prisma.vendorOutreach.findFirst({
      where: {
        status: { in: ["SENT", "REPLIED", "PENDING", "NEGOTIATING", "DECLINED"] },
        vendor: {
          OR: [
            { phone: { contains: tail } },
            { whatsappId: { contains: tail } },
            { contacts: { some: { phone: { contains: tail } } } },
          ],
        },
      },
      include: { vendor: true, rfq: true },
      orderBy: { sentAt: "desc" },
    });
  }

  if (!outreach) return { handled: false };

  // Only enforce from==vendor when we matched solely by email (no REF / In-Reply-To).
  const matchedByThread =
    Boolean(threadRef) || referenceIds.length > 0 || Boolean(whatsappPhone);
  const vendorEmail = outreach.vendor.email?.toLowerCase();
  if (
    !matchedByThread &&
    vendorEmail &&
    fromEmail !== vendorEmail
  ) {
    return { handled: false };
  }

  const items = expectedItemsForOutreach(
    outreach.rfq.parsedSpecs,
    outreach.rfq.rawText,
    outreach.requestedLineNumbers
  );
  const previousLines = preferPlausibleLinePrices({
    previous: asQuotedLineItems(outreach.previousQuotedLineItems),
    next: asQuotedLineItems(outreach.quotedLineItems),
    expectCount: items.length,
  });
  const previousTotal =
    previousLines.length > 0
      ? previousLines.reduce((sum, line) => sum + line.lineTotal, 0)
      : outreach.quotedPrice
        ? Number(outreach.quotedPrice)
        : null;

  // Snapshot from when we sent the negotiation — use this as the discount base
  // so re-processing an "ok 7% discount" reply stays idempotent.
  const negotiationBaseline = (() => {
    const prev = asQuotedLineItems(outreach.previousQuotedLineItems);
    if (lineItemsLookPlausible(prev, { minUnitPrice: 100 })) return prev;
    return previousLines;
  })();

  const cleanReply = stripEmailQuotedHistory(text) || text;
  const parsedPrices = await parseVendorReplyWithAi({
    replyText: cleanReply,
    subject: parsed.subject || "",
    items,
    vendorName: outreach.vendor.name,
  });
  let quotedLineItems = parsedPrices.lines;
  let quotedPrice = parsedPrices.total;
  const now = new Date();

  const hadNegotiation =
    outreach.status === "NEGOTIATING" || Boolean(outreach.negotiatedAt);

  const intentResult = await classifyVendorReplyIntent({
    replyText: cleanReply,
    subject: parsed.subject || "",
    hadNegotiation,
    previousTotal,
    newTotal: quotedPrice,
  });

  const declined = intentResult.intent === "DECLINED";
  const accepted =
    intentResult.intent === "ACCEPTED" || intentResult.intent === "COUNTER";

  // Drop garbage prices extracted from quoted threads / percentages / years.
  if (
    quotedLineItems.length > 0 &&
    !lineItemsLookPlausible(quotedLineItems, {
      minUnitPrice: 50,
      expectCount: items.length,
    })
  ) {
    quotedLineItems = [];
    quotedPrice = null;
  }

  // Vendor accepted / offered a % in the reply without new absolute prices.
  // Apply that % to the previous quote (vendor reply wins over admin ask).
  const vendorStatedDiscount =
    hadNegotiation &&
    /\d+(?:\.\d+)?\s*%/.test(cleanReply) &&
    /discount|off|less|ok|agree|will do|can do|accepted|lets?\s+do/i.test(
      cleanReply
    );

  if (!declined && hadNegotiation && negotiationBaseline.length > 0) {
    const noUsableNewPrices =
      quotedLineItems.length === 0 ||
      !lineItemsLookPlausible(quotedLineItems, {
        minUnitPrice: 50,
        expectCount: items.length,
      });

    if (vendorStatedDiscount || (accepted && noUsableNewPrices)) {
      const applied = applyAcceptedNegotiationDiscounts({
        previousLines: negotiationBaseline,
        negotiationNote: outreach.negotiationNote || "",
        negotiationEmailBody: outreach.outboundBody || "",
        vendorReplyText: cleanReply,
      });
      if (applied) {
        quotedLineItems = applied.lines;
        quotedPrice = applied.total;
      } else if (accepted && noUsableNewPrices && previousLines.length > 0) {
        quotedLineItems = previousLines;
        quotedPrice = previousTotal;
      }
    }
  }

  if (declined) {
    quotedLineItems =
      previousLines.length > 0
        ? previousLines
        : asQuotedLineItems(outreach.quotedLineItems);
    quotedPrice =
      previousTotal ??
      (outreach.quotedPrice ? Number(outreach.quotedPrice) : null);
  }

  const nextStatus = declined
    ? "DECLINED"
    : quotedPrice != null || quotedLineItems.length > 0
      ? "REPLIED"
      : outreach.status === "NEGOTIATING"
        ? "NEGOTIATING"
        : "REPLIED";

  await prisma.vendorOutreach.update({
    where: { id: outreach.id },
    data: {
      replyText: text.slice(0, 20000),
      replyMsgId: messageId,
      replyIntent: intentResult.intent,
      quotedPrice: quotedPrice != null ? quotedPrice : outreach.quotedPrice,
      quotedLineItems:
        quotedLineItems.length > 0
          ? quotedLineItems
          : outreach.quotedLineItems ?? Prisma.DbNull,
      repliedAt: now,
    },
  });
  await setOutreachStatus(outreach.id, nextStatus);

  if (!declined && quotedLineItems.length > 0) {
    for (const line of quotedLineItems) {
      const rfqItem = items.find((item) => item.lineNumber === line.lineNumber);
      const productKey = rfqItem
        ? normalizeProductKey({
            parsedCategory: rfqItem.category || outreach.rfq.parsedCategory,
            parsedSpecs: {
              description: rfqItem.description,
              brand: rfqItem.brand,
              quantity: rfqItem.quantity,
              unit: rfqItem.unit,
              category: rfqItem.category,
            },
            subject: rfqItem.description,
          })
        : outreach.productKey || `line-${line.lineNumber}`;
      if (!productKey) continue;
      await prisma.vendorProductHistory.upsert({
        where: {
          vendorId_productKey: {
            vendorId: outreach.vendorId,
            productKey,
          },
        },
        create: {
          vendorId: outreach.vendorId,
          productKey,
          lastPrice: line.unitPrice,
          lastQuotedAt: now,
          sourceRfqId: outreach.rfqId,
        },
        update: {
          lastPrice: line.unitPrice,
          lastQuotedAt: now,
          sourceRfqId: outreach.rfqId,
        },
      });
    }
  } else if (!declined && quotedPrice != null && outreach.productKey) {
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

  const displayTotal =
    quotedPrice ??
    (quotedLineItems.length > 0
      ? quotedLineItems.reduce((sum, l) => sum + l.lineTotal, 0)
      : null);

  const priceSummary = declined
    ? `\nIntent: DECLINED — ${intentResult.summary}`
    : quotedLineItems.length > 0
      ? `\nQuoted lines (${parsedPrices.source}):\n${quotedLineItems
          .map(
            (l) =>
              `${l.lineNumber}. ${l.description} — ₹${l.unitPrice.toLocaleString("en-IN")} × ${l.quantity} = ₹${l.lineTotal.toLocaleString("en-IN")}`
          )
          .join("\n")}\nTotal: ₹${(displayTotal ?? 0).toLocaleString("en-IN")}\nIntent: ${intentResult.intent} — ${intentResult.summary}`
      : displayTotal != null
        ? `\nQuoted price: ₹${displayTotal.toLocaleString("en-IN")}\nIntent: ${intentResult.intent} — ${intentResult.summary}`
        : `\nNo prices extracted. Intent: ${intentResult.intent} — ${intentResult.summary}`;

  const replyChannel = whatsappPhone ? "WHATSAPP" : "EMAIL";
  const fromLabel = whatsappPhone
    ? `+${whatsappPhone}`
    : fromEmail;

  await prisma.rfqMessage.create({
    data: {
      rfqId: outreach.rfqId,
      direction: "IN",
      channel: replyChannel,
      body: `Vendor reply from ${outreach.vendor.name} <${fromLabel}>${priceSummary}\n\n${text}`,
      meta: {
        type: "vendor_reply",
        channel: replyChannel,
        vendorId: outreach.vendorId,
        outreachId: outreach.id,
        threadRef: outreach.threadRef,
        quotedPrice: displayTotal,
        quotedLineItems,
        replyIntent: intentResult.intent,
        parseSource: parsedPrices.source,
        parseConfidence: parsedPrices.confidence,
        parseSummary: parsedPrices.summary,
        messageId,
      },
    },
  });

  return {
    handled: true,
    outreachId: outreach.id,
    rfqId: outreach.rfqId,
    vendorId: outreach.vendorId,
    quotedPrice: displayTotal,
    quotedLineItems,
    replyIntent: intentResult.intent,
  };
}

/** Match an inbound WhatsApp text message to a vendor Recore / negotiation reply. */
export async function handleVendorReplyWhatsApp(input: {
  from: string;
  text: string;
  messageId: string;
}): Promise<VendorReplyResult> {
  const text = input.text.trim();
  if (!text) return { handled: false };

  let phone = "";
  try {
    phone = normalizeWhatsAppNumber(input.from);
  } catch {
    phone = input.from.replace(/[^\d]/g, "");
  }
  if (!phone) return { handled: false };

  // Only treat as vendor reply when REF is present or this phone has open outreach.
  // Product-requirement texts without a REF stay in the RFQ inbox even if the
  // sender number also exists on a vendor record.
  const threadRef = extractThreadRef(text);
  if (!threadRef) {
    const { messageLooksLikeRequirement } = await import(
      "@/lib/inbound-requirement"
    );
    if (messageLooksLikeRequirement(text)) {
      return { handled: false };
    }
    const tail = phone.slice(-10);
    const open = await prisma.vendorOutreach.findFirst({
      where: {
        status: { in: ["SENT", "PENDING", "NEGOTIATING"] },
        vendor: {
          OR: [
            { phone: { contains: tail } },
            { whatsappId: { contains: tail } },
            { contacts: { some: { phone: { contains: tail } } } },
          ],
        },
      },
      select: { id: true },
    });
    if (!open) return { handled: false };
  }

  const synthetic = {
    messageId: input.messageId,
    subject: threadRef ? `WhatsApp reply [REF:${threadRef}]` : "WhatsApp vendor reply",
    text,
    html: undefined,
    from: {
      text: `${phone}@whatsapp.local`,
      value: [{ address: `${phone}@whatsapp.local`, name: "" }],
    },
    references: undefined,
    inReplyTo: undefined,
    attachments: [],
    headers: new Map(),
    headerLines: [],
  } as unknown as ParsedMail;

  return handleVendorReplyEmail(synthetic);
}

/**
 * Re-run AI / discount application on stored vendor replies.
 * Also repairs rows where quoted prices look like garbage after a negotiation accept.
 */
export async function reparseStoredVendorReplies(rfqId: string): Promise<{
  scanned: number;
  updated: number;
  results: Array<{
    vendorId: string;
    vendorName: string;
    quotedPrice: number | null;
    lineCount: number;
    source: string;
  }>;
}> {
  const outreaches = await prisma.vendorOutreach.findMany({
    where: {
      rfqId,
      replyText: { not: "" },
    },
    include: {
      vendor: { select: { id: true, name: true } },
      rfq: { select: { parsedSpecs: true, rawText: true, parsedCategory: true } },
    },
  });

  const results: Array<{
    vendorId: string;
    vendorName: string;
    quotedPrice: number | null;
    lineCount: number;
    source: string;
  }> = [];
  let updated = 0;

  for (const outreach of outreaches) {
    const items = expectedItemsForOutreach(
      outreach.rfq.parsedSpecs,
      outreach.rfq.rawText,
      outreach.requestedLineNumbers
    );
    const existingLines = asQuotedLineItems(outreach.quotedLineItems);
    const existingOk = lineItemsLookPlausible(existingLines, {
      minUnitPrice: 100,
      expectCount: items.length,
    });

    // Recover baseline from prior RFQ messages if current/previous lines are bad.
    let baseline = preferPlausibleLinePrices({
      previous: asQuotedLineItems(outreach.previousQuotedLineItems),
      next: existingLines,
      expectCount: items.length,
    });
    if (!lineItemsLookPlausible(baseline, { minUnitPrice: 100, expectCount: items.length })) {
      const history = await prisma.rfqMessage.findMany({
        where: {
          rfqId,
          meta: {
            path: ["vendorId"],
            equals: outreach.vendorId,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      });
      for (const msg of history) {
        const meta = msg.meta as { quotedLineItems?: unknown; type?: string };
        if (meta.type !== "vendor_reply") continue;
        const lines = asQuotedLineItems(meta.quotedLineItems);
        if (lineItemsLookPlausible(lines, { minUnitPrice: 100, expectCount: items.length })) {
          baseline = lines;
          break;
        }
      }
    }

    const cleanReply =
      stripEmailQuotedHistory(outreach.replyText) || outreach.replyText;
    const replyOffersPercentDiscount =
      Boolean(outreach.negotiatedAt) &&
      /\d+(?:\.\d+)?\s*%/.test(cleanReply) &&
      /discount|off|less|ok|agree|will do|can do|accepted|lets?\s+do/i.test(
        cleanReply
      );

    const needsRepair =
      !existingOk ||
      (Boolean(outreach.negotiatedAt) &&
        outreach.replyIntent === "ACCEPTED" &&
        !existingOk) ||
      replyOffersPercentDiscount;

    if (existingOk && !needsRepair) {
      results.push({
        vendorId: outreach.vendorId,
        vendorName: outreach.vendor.name,
        quotedPrice: outreach.quotedPrice ? Number(outreach.quotedPrice) : null,
        lineCount: existingLines.length,
        source: "existing",
      });
      continue;
    }

    let lines: VendorQuotedLineItem[] = [];
    let total: number | null = null;
    let source = "repair";

    if (
      outreach.negotiatedAt &&
      /ok|agree|can do|will do|accepted|discount|\d+\s*%/i.test(cleanReply)
    ) {
      const preNegotiation = asQuotedLineItems(outreach.previousQuotedLineItems);
      const discountBase = lineItemsLookPlausible(preNegotiation, {
        minUnitPrice: 100,
      })
        ? preNegotiation
        : baseline;
      const applied = applyAcceptedNegotiationDiscounts({
        previousLines: discountBase,
        negotiationNote: outreach.negotiationNote || "",
        negotiationEmailBody: outreach.outboundBody || "",
        vendorReplyText: cleanReply,
      });
      if (applied) {
        lines = applied.lines;
        total = applied.total;
        source = "negotiation-accept";
      }
    }

    if (lines.length === 0) {
      const parsedPrices = await parseVendorReplyWithAi({
        replyText: cleanReply,
        items,
        vendorName: outreach.vendor.name,
      });
      if (
        lineItemsLookPlausible(parsedPrices.lines, {
          minUnitPrice: 100,
          expectCount: items.length,
        })
      ) {
        lines = parsedPrices.lines;
        total = parsedPrices.total;
        source = parsedPrices.source;
      } else if (baseline.length > 0) {
        lines = baseline;
        total = baseline.reduce((sum, line) => sum + line.lineTotal, 0);
        source = "baseline";
      }
    }

    if (lines.length === 0 && total == null) {
      results.push({
        vendorId: outreach.vendorId,
        vendorName: outreach.vendor.name,
        quotedPrice: null,
        lineCount: 0,
        source,
      });
      continue;
    }

    const now = new Date();
    await prisma.vendorOutreach.update({
      where: { id: outreach.id },
      data: {
        quotedPrice: total,
        quotedLineItems: lines.length > 0 ? lines : Prisma.DbNull,
        previousQuotedLineItems:
          baseline.length > 0 ? baseline : outreach.previousQuotedLineItems ?? Prisma.DbNull,
        previousQuotedPrice:
          baseline.length > 0
            ? baseline.reduce((sum, line) => sum + line.lineTotal, 0)
            : outreach.previousQuotedPrice,
        replyIntent: outreach.replyIntent || "ACCEPTED",
        repliedAt: outreach.repliedAt || now,
      },
    });
    if (outreach.status !== "DECLINED") {
      await setOutreachStatus(outreach.id, "REPLIED");
    }

    updated += 1;
    results.push({
      vendorId: outreach.vendorId,
      vendorName: outreach.vendor.name,
      quotedPrice: total,
      lineCount: lines.length,
      source,
    });
  }

  return { scanned: outreaches.length, updated, results };
}

export type VendorThreadMessage = {
  id: string;
  direction: string;
  createdAt: string;
  body: string;
  type: string;
};

/** RFQ message thread for one vendor (Recore / negotiation / replies). */
export async function getVendorOutreachThread(input: {
  rfqId: string;
  vendorId: string;
}): Promise<{
  vendorName: string;
  threadRef: string;
  status: string;
  replyIntent: string;
  messages: VendorThreadMessage[];
}> {
  const outreach = await prisma.vendorOutreach.findUnique({
    where: {
      rfqId_vendorId: { rfqId: input.rfqId, vendorId: input.vendorId },
    },
    include: { vendor: { select: { name: true } } },
  });
  if (!outreach) {
    throw new Error("No outreach found for this vendor on this RFQ.");
  }

  const rows = await prisma.rfqMessage.findMany({
    where: {
      rfqId: input.rfqId,
      meta: { path: ["vendorId"], equals: input.vendorId },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return {
    vendorName: outreach.vendor.name,
    threadRef: outreach.threadRef,
    status: outreach.status,
    replyIntent: outreach.replyIntent,
    messages: rows.map((row) => {
      const meta = row.meta as { type?: string };
      return {
        id: row.id,
        direction: row.direction,
        createdAt: row.createdAt.toISOString(),
        body: row.body,
        type: meta.type || "message",
      };
    }),
  };
}
