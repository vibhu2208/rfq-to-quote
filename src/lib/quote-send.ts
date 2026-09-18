import type { RfqChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompanyConfig } from "@/lib/company";
import { sendGmailEmail } from "@/lib/gmail-smtp";
import { buildQuotePdfBuffer } from "@/lib/pdf/render-quote-buffer";
import { formatMoney } from "@/lib/tax";
import { decimalToNumber, makeQuoteThreadRef } from "@/lib/quotes";
import type { QuoteSendChannel } from "@/lib/quote-send-defaults";

export type { QuoteSendChannel } from "@/lib/quote-send-defaults";
export {
  resolveQuoteSendDefaults,
  type QuoteSendDefaults,
} from "@/lib/quote-send-defaults";

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildBuyerEmailBody(input: {
  buyerName: string;
  quoteNumber: string;
  grandTotal: number;
  companyName: string;
  threadRef: string;
}) {
  const greeting = input.buyerName.trim()
    ? `Hello ${input.buyerName.trim()},`
    : "Hello,";

  return `${greeting}

Please find attached our quotation ${input.quoteNumber}.

Grand total: ${formatMoney(input.grandTotal)}

If you have any questions or need changes, reply to this email.

Reference: [${input.threadRef}]

Thanks,
${input.companyName}`;
}

export type SendQuoteInput = {
  quoteId: string;
  channel: QuoteSendChannel;
  to: string;
  /** Optional note included in the outbound message body. */
  note?: string;
};

export type SendQuoteResult = {
  ok: true;
  channel: QuoteSendChannel;
  to: string;
  messageId?: string;
  status: string;
  sentAt: string | null;
};

export async function sendQuoteToBuyer(
  input: SendQuoteInput
): Promise<SendQuoteResult> {
  const to = input.to.trim();
  if (!to) {
    throw new Error("Destination is required.");
  }

  const quote = await prisma.quote.findUnique({
    where: { id: input.quoteId },
    include: {
      lineItems: {
        include: { product: { select: { code: true, hsnCode: true } } },
        orderBy: { sortOrder: "asc" },
      },
      rfq: {
        select: {
          id: true,
          channel: true,
          sourceRef: true,
          subject: true,
          customerEmail: true,
          customerPhone: true,
        },
      },
    },
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (input.channel === "WHATSAPP") {
    throw new Error(
      "WhatsApp sending is not configured yet. Choose email for now, or mark as sent after sharing manually."
    );
  }

  if (input.channel === "EMAIL" && !isEmailLike(to)) {
    throw new Error("Enter a valid email address.");
  }

  const company = getCompanyConfig();
  const { buffer, filename } = await buildQuotePdfBuffer(quote);
  const grandTotal = decimalToNumber(quote.grandTotal);
  const threadRef = quote.threadRef?.trim() || makeQuoteThreadRef(quote.quoteNumber);
  const subject = `Quotation ${quote.quoteNumber} [${threadRef}]${
    quote.rfq?.subject ? ` — ${quote.rfq.subject}` : ""
  }`;

  let text = buildBuyerEmailBody({
    buyerName: quote.buyerName,
    quoteNumber: quote.quoteNumber,
    grandTotal,
    companyName: company.name,
    threadRef,
  });
  if (input.note?.trim()) {
    text += `\n\nNote: ${input.note.trim()}`;
  }

  const inReplyTo =
    quote.rfq?.channel === "EMAIL" ||
    quote.rfq?.channel === "MARKETPLACE" ||
    quote.rfq?.channel === "WEB_FORM"
      ? quote.rfq.sourceRef || undefined
      : undefined;

  const sent = await sendGmailEmail({
    to,
    subject,
    text,
    inReplyTo,
    references: inReplyTo,
    attachments: [
      {
        filename,
        content: buffer,
        contentType: "application/pdf",
      },
    ],
  });

  const now = new Date();
  const outboundChannel: RfqChannel = "EMAIL";

  await prisma.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        sentAt: quote.sentAt ?? now,
        outboundMsgId: sent.messageId,
        threadRef,
        needsAssistance: false,
        assistanceReason: "",
        // Keep buyerEmail in sync with the address we actually emailed so
        // per-quote thread checks search the right "from:" mailbox.
        ...(isEmailLike(to) ? { buyerEmail: to } : {}),
      },
    });

    await tx.quoteMessage.create({
      data: {
        quoteId: quote.id,
        direction: "OUT",
        channel: outboundChannel,
        subject,
        body: text,
        messageId: sent.messageId,
        inReplyTo: inReplyTo || "",
        fromEmail: process.env.GMAIL_USER?.trim() || "",
        toEmail: to,
        analysis: { kind: "quote_send", filename },
      },
    });

    if (quote.rfqId) {
      await tx.rfqMessage.create({
        data: {
          rfqId: quote.rfqId,
          direction: "OUT",
          channel: outboundChannel,
          body: text,
          meta: {
            kind: "quote_send",
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            to,
            messageId: sent.messageId,
            filename,
            threadRef,
          },
        },
      });
    }
  });

  return {
    ok: true,
    channel: input.channel,
    to,
    messageId: sent.messageId,
    status: "SENT",
    sentAt: (quote.sentAt ?? now).toISOString(),
  };
}
