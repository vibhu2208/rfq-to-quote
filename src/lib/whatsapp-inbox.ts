import { prisma } from "@/lib/prisma";
import { createRfqWithMessage } from "@/lib/rfq";
import { messageLooksLikeRequirement } from "@/lib/inbound-requirement";
import { handleVendorReplyWhatsApp } from "@/lib/vendor-outreach";
import {
  extractWhatsAppInboundMessages,
  getWhatsAppConfig,
  type WhatsAppInboundMessage,
} from "@/lib/whatsapp";

export type WhatsAppIngestKind =
  | "rfq"
  | "vendor"
  | "skipped"
  | "duplicate"
  | "empty";

export type WhatsAppIngestResult = {
  kind: WhatsAppIngestKind;
  messageId: string;
  from: string;
  reason?: string;
  rfq?: { id: string; status: string; subject: string };
};

export type WhatsAppPollResult = {
  available: boolean;
  fetched: number;
  created: number;
  skipped: number;
  vendorReplies: number;
  duplicates: number;
  rfqs: Array<{ id: string; status: string; subject: string; from: string }>;
  note?: string;
};

async function alreadyImported(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const existing = await prisma.rfq.findFirst({
    where: { sourceRef: messageId },
    select: { id: true },
  });
  if (existing) return true;
  const msg = await prisma.rfqMessage.findFirst({
    where: {
      OR: [
        { meta: { path: ["messageId"], equals: messageId } },
        { meta: { path: ["sourceRef"], equals: messageId } },
      ],
    },
    select: { id: true },
  });
  return Boolean(msg);
}

/** Ingest one inbound WhatsApp message into RFQ inbox or vendor reply flow. */
export async function ingestWhatsAppInboundMessage(
  message: WhatsAppInboundMessage
): Promise<WhatsAppIngestResult> {
  const text = (message.text || "").trim();
  if (!text) {
    return {
      kind: "empty",
      messageId: message.messageId,
      from: message.from,
      reason: "empty",
    };
  }

  if (await alreadyImported(message.messageId)) {
    return {
      kind: "duplicate",
      messageId: message.messageId,
      from: message.from,
      reason: "already imported",
    };
  }

  const vendorReply = await handleVendorReplyWhatsApp({
    from: message.from,
    text,
    messageId: message.messageId,
  });
  if (vendorReply.handled) {
    return {
      kind: "vendor",
      messageId: message.messageId,
      from: message.from,
      reason: "vendor reply",
    };
  }

  // Non-requirement chats are stored as SKIPPED so they can be reviewed in Leads.
  if (!messageLooksLikeRequirement(text)) {
    const rfq = await createRfqWithMessage({
      channel: "WHATSAPP",
      sourceRef: message.messageId,
      subject: `WhatsApp from ${message.name || message.from}`,
      rawText: text.slice(0, 20000),
      customerName: message.name || message.from,
      customerPhone: message.from.startsWith("+")
        ? message.from
        : `+${message.from}`,
      autoParse: false,
      intakeKind: "SKIPPED",
      junkReason: "no product requirement detected",
    });
    return {
      kind: "skipped",
      messageId: message.messageId,
      from: message.from,
      reason: "no product requirement detected",
      rfq: {
        id: rfq.id,
        status: rfq.status,
        subject: rfq.subject || `WhatsApp from ${message.name || message.from}`,
      },
    };
  }

  const rfq = await createRfqWithMessage({
    channel: "WHATSAPP",
    sourceRef: message.messageId,
    subject: `WhatsApp from ${message.name || message.from}`,
    rawText: text.slice(0, 20000),
    customerName: message.name || message.from,
    customerPhone: message.from.startsWith("+")
      ? message.from
      : `+${message.from}`,
  });

  return {
    kind: "rfq",
    messageId: message.messageId,
    from: message.from,
    rfq: {
      id: rfq.id,
      status: rfq.status,
      subject: rfq.subject || `WhatsApp from ${message.name || message.from}`,
    },
  };
}

export async function ingestWhatsAppWebhookPayload(
  payload: unknown
): Promise<{
  received: number;
  created: number;
  skipped: number;
  vendorReplies: number;
  duplicates: number;
  results: WhatsAppIngestResult[];
}> {
  const messages = extractWhatsAppInboundMessages(payload);
  const results: WhatsAppIngestResult[] = [];
  let created = 0;
  let skipped = 0;
  let vendorReplies = 0;
  let duplicates = 0;

  for (const message of messages) {
    const result = await ingestWhatsAppInboundMessage(message);
    results.push(result);
    if (result.kind === "rfq") created += 1;
    else if (result.kind === "vendor") vendorReplies += 1;
    else if (result.kind === "duplicate") duplicates += 1;
    else skipped += 1;
  }

  return {
    received: messages.length,
    created,
    skipped,
    vendorReplies,
    duplicates,
    results,
  };
}

/**
 * WhatsApp Cloud API is push-only (webhooks). "Poll" here:
 * 1) Optionally accepts a webhook-shaped payload for manual replay.
 * 2) Reports recent WhatsApp RFQs so the inbox Poll action covers both channels.
 */
export async function pollWhatsAppInbox(options?: {
  limit?: number;
  payload?: unknown;
}): Promise<WhatsAppPollResult> {
  const available = Boolean(getWhatsAppConfig());
  const limit = Math.min(options?.limit ?? 20, 50);

  if (options?.payload) {
    const ingested = await ingestWhatsAppWebhookPayload(options.payload);
    return {
      available,
      fetched: ingested.received,
      created: ingested.created,
      skipped: ingested.skipped,
      vendorReplies: ingested.vendorReplies,
      duplicates: ingested.duplicates,
      rfqs: ingested.results
        .filter((row) => row.kind === "rfq" && row.rfq)
        .map((row) => ({
          id: row.rfq!.id,
          status: row.rfq!.status,
          subject: row.rfq!.subject,
          from: row.from,
        })),
      note: available
        ? "Processed WhatsApp payload (requirements only)."
        : "WhatsApp credentials missing; payload processed locally only.",
    };
  }

  const recent = await prisma.rfq.findMany({
    where: { channel: "WHATSAPP" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      subject: true,
      customerPhone: true,
      createdAt: true,
    },
  });

  return {
    available,
    fetched: 0,
    created: 0,
    skipped: 0,
    vendorReplies: 0,
    duplicates: 0,
    rfqs: recent.map((row) => ({
      id: row.id,
      status: row.status,
      subject: row.subject || "WhatsApp RFQ",
      from: row.customerPhone || "",
    })),
    note: available
      ? "WhatsApp is live via webhook — only requirement messages become RFQs. New chats appear as customers send them."
      : "WhatsApp is not configured (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID).",
  };
}
