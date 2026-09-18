import { prisma } from "@/lib/prisma";
import type { QuoteStatus } from "@prisma/client";
import { decimalToNumber } from "@/lib/quotes";
import { toNumber } from "@/lib/accounting/money";
import { getArAgeing, getStockBalances, getTrialBalance } from "@/lib/accounting/reports";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { sendQuoteFollowUpEmail, makeQuoteThreadRef } from "@/lib/quote-thread";
import { getCompanyConfig } from "@/lib/company";

export type AdminToolResult = {
  source: string;
  data: unknown;
};

export const ADMIN_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "assistance_queue",
      description:
        "List quotes flagged needsAssistance=true (human must reply). This is NOT the same as status UNDER_NEGOTIATION. Do not use this to list quotes by status.",
      parameters: {
        type: "object",
        properties: {
          take: { type: "number", description: "Max rows (default 15, max 30)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "quote_lookup",
      description: "Look up a quote by quote number (e.g. Q-2026-0017) or buyer email. Returns totals, GST, status, and line items.",
      parameters: {
        type: "object",
        properties: {
          quoteNumber: { type: "string" },
          buyerEmail: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "invoice_lookup",
      description: "Look up a tax invoice by invoice number. Returns status, totals, GST, and balance due.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: { type: "string" },
        },
        required: ["invoiceNumber"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "quote_stats",
      description:
        "Counts only: total quotes, needsAssistance count, and count by status. Does not return quote numbers or buyer details. For a list, call quote_list.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "quote_list",
      description:
        "List quotations with details (number, buyer, status, total). Filter by status such as UNDER_NEGOTIATION, DRAFT, SENT, ACCEPTED. Use this whenever the user asks for a list or details of quotes in a status. Do not use assistance_queue for status filters.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Quote status: DRAFT, SENT, VIEWED, UNDER_NEGOTIATION, REVISED, ACCEPTED, REJECTED, INVOICE_GENERATED, PAYMENT_PENDING, PAYMENT_RECEIVED, DELIVERED, CLOSED. Omit to list recent quotes of any status.",
          },
          needsAssistance: {
            type: "boolean",
            description: "If true, only quotes flagged for human assistance.",
          },
          take: { type: "number", description: "Max rows (default 20, max 40)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "trial_balance",
      description: "Posted trial balance from the books (account codes, debit, credit).",
      parameters: {
        type: "object",
        properties: {
          asOf: { type: "string", description: "Optional ISO date YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ar_ageing",
      description: "Outstanding receivables ageing (unpaid / partially paid invoices).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "stock_balances",
      description: "On-hand stock by product and warehouse. Optionally filter by product code or name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Product code or name fragment" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "gst_summary",
      description: "Read-only outward GST summary from issued invoices in a YYYY-MM period (does not file or create a return).",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", description: "GST period YYYY-MM" },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_quote_email",
      description:
        "Prepare a buyer follow-up email for a quote without sending. Use when the admin asks to write/draft an email. Returns to-address, subject, last buyer message, and a suggested body.",
      parameters: {
        type: "object",
        properties: {
          quoteNumber: { type: "string", description: "Quote number e.g. Q-2026-0017" },
        },
        required: ["quoteNumber"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_quote_email",
      description:
        "Send a follow-up email to the quote buyer via Gmail and store it on the quote thread. ONLY call this when the admin explicitly says to send. confirm must be true. Never send a draft-only request.",
      parameters: {
        type: "object",
        properties: {
          quoteNumber: { type: "string" },
          body: {
            type: "string",
            description: "Email body without greeting/sign-off required; company signature is appended if missing.",
          },
          subject: { type: "string" },
          confirm: {
            type: "boolean",
            description: "Must be true. Refuses to send if false or omitted.",
          },
        },
        required: ["quoteNumber", "body", "confirm"],
      },
    },
  },
];

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function assistanceQueue(take: number): Promise<AdminToolResult> {
  const quotes = await prisma.quote.findMany({
    where: { needsAssistance: true },
    orderBy: { lastBuyerReplyAt: "desc" },
    take,
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      buyerName: true,
      buyerCompany: true,
      buyerEmail: true,
      grandTotal: true,
      lastReplyIntent: true,
      assistanceReason: true,
      lastBuyerReplyAt: true,
    },
  });
  return {
    source: "Quotes needing assistance",
    data: {
      count: quotes.length,
      quotes: quotes.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.status,
        buyer: q.buyerCompany || q.buyerName || q.buyerEmail,
        grandTotal: decimalToNumber(q.grandTotal),
        lastReplyIntent: q.lastReplyIntent,
        assistanceReason: q.assistanceReason,
        lastBuyerReplyAt: q.lastBuyerReplyAt?.toISOString() ?? null,
      })),
    },
  };
}

async function quoteLookup(args: Record<string, unknown>): Promise<AdminToolResult> {
  const quoteNumber =
    typeof args.quoteNumber === "string" ? args.quoteNumber.trim().toUpperCase() : "";
  const buyerEmail = typeof args.buyerEmail === "string" ? args.buyerEmail.trim() : "";
  if (!quoteNumber && !buyerEmail) {
    return { source: "quote_lookup", data: { error: "Provide quoteNumber or buyerEmail" } };
  }

  const quote = await prisma.quote.findFirst({
    where: quoteNumber
      ? { quoteNumber: { equals: quoteNumber, mode: "insensitive" } }
      : { buyerEmail: { equals: buyerEmail, mode: "insensitive" } },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sentAt: "desc" },
  });
  if (!quote) {
    return { source: "quote_lookup", data: { found: false } };
  }
  return {
    source: `Quote ${quote.quoteNumber}`,
    data: {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      buyerName: quote.buyerName,
      buyerCompany: quote.buyerCompany,
      buyerEmail: quote.buyerEmail,
      withGst: quote.withGst,
      subtotal: decimalToNumber(quote.subtotal),
      gstAmount: decimalToNumber(quote.gstAmount),
      deliveryCharge: decimalToNumber(quote.deliveryCharge),
      discountAmount: decimalToNumber(quote.discountAmount),
      grandTotal: decimalToNumber(quote.grandTotal),
      needsAssistance: quote.needsAssistance,
      assistanceReason: quote.assistanceReason,
      sentAt: quote.sentAt?.toISOString() ?? null,
      lineItems: quote.lineItems.map((li) => ({
        description: li.aliasName?.trim() || li.description,
        aliasName: li.aliasName || "",
        qty: decimalToNumber(li.qty),
        unit: li.unit,
        unitPrice: decimalToNumber(li.unitPrice),
        taxRate: decimalToNumber(li.taxRate),
        lineTotal: decimalToNumber(li.lineTotal),
      })),
    },
  };
}

async function invoiceLookup(invoiceNumber: string): Promise<AdminToolResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { number: { equals: invoiceNumber.trim(), mode: "insensitive" } },
    include: {
      party: { select: { legalName: true, gstin: true } },
      lines: true,
    },
  });
  if (!invoice) {
    return { source: "invoice_lookup", data: { found: false, invoiceNumber } };
  }
  return {
    source: `Invoice ${invoice.number}`,
    data: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      partyName: invoice.party.legalName,
      partyGstin: invoice.party.gstin,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      subtotal: toNumber(invoice.subtotal),
      taxAmount: toNumber(invoice.taxAmount),
      total: toNumber(invoice.total),
      balanceDue: toNumber(invoice.balanceDue),
      lineCount: invoice.lines.length,
    },
  };
}

async function quoteStats(): Promise<AdminToolResult> {
  const [byStatus, assistCount, total] = await Promise.all([
    prisma.quote.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.quote.count({ where: { needsAssistance: true } }),
    prisma.quote.count(),
  ]);
  return {
    source: "Quote counts",
    data: {
      total,
      needsAssistance: assistCount,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      note: "These are counts only. Call quote_list with status to get quote numbers and buyers.",
    },
  };
}

const QUOTE_STATUSES: QuoteStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "UNDER_NEGOTIATION",
  "REVISED",
  "ACCEPTED",
  "REJECTED",
  "INVOICE_GENERATED",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "DELIVERED",
  "CLOSED",
];

function normalizeQuoteStatus(raw: string): QuoteStatus | null {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((QUOTE_STATUSES as string[]).includes(compact)) return compact as QuoteStatus;
  const aliases: Record<string, QuoteStatus> = {
    NEGOTIATION: "UNDER_NEGOTIATION",
    UNDERNEGOTIATION: "UNDER_NEGOTIATION",
    INVOICE: "INVOICE_GENERATED",
    PAYMENT: "PAYMENT_PENDING",
  };
  return aliases[compact] ?? null;
}

async function quoteList(args: Record<string, unknown>): Promise<AdminToolResult> {
  const take = Math.min(40, Math.max(1, Number(args.take) || 20));
  const statusRaw = typeof args.status === "string" ? args.status.trim() : "";
  const status = statusRaw ? normalizeQuoteStatus(statusRaw) : null;
  if (statusRaw && !status) {
    return {
      source: "Quote list",
      data: {
        error: `Unknown status "${statusRaw}". Use one of: ${QUOTE_STATUSES.join(", ")}`,
      },
    };
  }

  const where = {
    ...(status ? { status } : {}),
    ...(typeof args.needsAssistance === "boolean" ? { needsAssistance: args.needsAssistance } : {}),
  };

  const [quotes, totalMatching] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        buyerName: true,
        buyerCompany: true,
        buyerEmail: true,
        grandTotal: true,
        gstAmount: true,
        sentAt: true,
        needsAssistance: true,
        lastReplyIntent: true,
        updatedAt: true,
      },
    }),
    prisma.quote.count({ where }),
  ]);

  return {
    source: status ? `Quotes with status ${status}` : "Quote list",
    data: {
      filter: { status: status ?? "ALL", needsAssistance: args.needsAssistance ?? null },
      totalMatching,
      returned: quotes.length,
      quotes: quotes.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.status,
        buyer: q.buyerCompany || q.buyerName || q.buyerEmail || "—",
        buyerEmail: q.buyerEmail,
        grandTotal: decimalToNumber(q.grandTotal),
        gstAmount: decimalToNumber(q.gstAmount),
        needsAssistance: q.needsAssistance,
        lastReplyIntent: q.lastReplyIntent,
        sentAt: q.sentAt?.toISOString() ?? null,
        updatedAt: q.updatedAt.toISOString(),
      })),
    },
  };
}

async function findQuoteByNumber(quoteNumber: string) {
  return prisma.quote.findFirst({
    where: { quoteNumber: { equals: quoteNumber.trim(), mode: "insensitive" } },
  });
}

async function draftQuoteEmail(quoteNumber: string): Promise<AdminToolResult> {
  const quote = await findQuoteByNumber(quoteNumber);
  if (!quote) {
    return { source: "draft_quote_email", data: { found: false, quoteNumber } };
  }
  if (!quote.buyerEmail.trim()) {
    return {
      source: `Draft email ${quote.quoteNumber}`,
      data: { error: "Quote has no buyer email.", quoteNumber: quote.quoteNumber },
    };
  }

  const lastInbound = await prisma.quoteMessage.findFirst({
    where: { quoteId: quote.id, direction: "IN" },
    orderBy: { createdAt: "desc" },
  });
  const analysis =
    lastInbound?.analysis && typeof lastInbound.analysis === "object"
      ? (lastInbound.analysis as { suggestedReply?: string; summary?: string })
      : null;
  const threadRef = quote.threadRef || makeQuoteThreadRef(quote.quoteNumber);
  const company = getCompanyConfig();
  const suggested =
    typeof analysis?.suggestedReply === "string" && analysis.suggestedReply.trim()
      ? analysis.suggestedReply.trim()
      : `Regarding quotation ${quote.quoteNumber}, please let us know if you would like to proceed.\n\nGrand total: INR ${decimalToNumber(quote.grandTotal).toLocaleString("en-IN")}`;

  return {
    source: `Draft email ${quote.quoteNumber}`,
    data: {
      sent: false,
      quoteNumber: quote.quoteNumber,
      to: quote.buyerEmail,
      buyer: quote.buyerName || quote.buyerCompany || quote.buyerEmail,
      subject: `Re: Quotation ${quote.quoteNumber} [${threadRef}]`,
      lastBuyerMessage: lastInbound?.body?.slice(0, 800) || null,
      suggestedBody: suggested,
      note: `This is a DRAFT only. Call send_quote_email with confirm=true to send via ${company.email || "Gmail"}.`,
    },
  };
}

async function sendQuoteEmail(
  args: Record<string, unknown>,
  userId?: string
): Promise<AdminToolResult> {
  const quoteNumber = typeof args.quoteNumber === "string" ? args.quoteNumber.trim() : "";
  const body = typeof args.body === "string" ? args.body.trim() : "";
  const confirm = args.confirm === true;
  if (!confirm) {
    return {
      source: "send_quote_email",
      data: {
        sent: false,
        error: "Refused: confirm must be true. Show the draft first, then send only if the admin asked to send.",
      },
    };
  }
  if (!quoteNumber || !body) {
    return {
      source: "send_quote_email",
      data: { sent: false, error: "quoteNumber and body are required." },
    };
  }
  const quote = await findQuoteByNumber(quoteNumber);
  if (!quote) {
    return { source: "send_quote_email", data: { sent: false, found: false, quoteNumber } };
  }

  const sent = await sendQuoteFollowUpEmail({
    quoteId: quote.id,
    body,
    subject: typeof args.subject === "string" ? args.subject : undefined,
    createdById: userId,
  });
  return {
    source: `Sent email ${sent.quoteNumber}`,
    data: {
      sent: true,
      quoteNumber: sent.quoteNumber,
      to: sent.to,
      subject: sent.subject,
      messageId: sent.messageId,
    },
  };
}

async function gstSummary(period: string): Promise<AdminToolResult> {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) {
    return { source: "gst_summary", data: { error: "period must be YYYY-MM" } };
  }
  const ctx = await getDefaultOrgContext();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const invoices = await prisma.invoice.findMany({
    where: {
      gstRegistrationId: ctx.gstRegistrationId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
      issueDate: { gte: start, lte: end },
    },
    include: { lines: true },
  });

  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const inv of invoices) {
    taxable += inv.lines.reduce((s, l) => s + toNumber(l.taxableValue), 0);
    cgst += inv.lines.reduce((s, l) => s + toNumber(l.cgstAmount), 0);
    sgst += inv.lines.reduce((s, l) => s + toNumber(l.sgstAmount), 0);
    igst += inv.lines.reduce((s, l) => s + toNumber(l.igstAmount), 0);
  }

  return {
    source: `GST outward ${period} (read-only, not filed)`,
    data: {
      period,
      gstin: ctx.gstin,
      invoiceCount: invoices.length,
      taxable: Math.round(taxable * 100) / 100,
      cgst: Math.round(cgst * 100) / 100,
      sgst: Math.round(sgst * 100) / 100,
      igst: Math.round(igst * 100) / 100,
      outwardTax: Math.round((cgst + sgst + igst) * 100) / 100,
    },
  };
}

export async function executeAdminTool(
  name: string,
  rawArgs: string,
  options?: { userId?: string }
): Promise<AdminToolResult> {
  const args = parseArgs(rawArgs);
  try {
    switch (name) {
      case "assistance_queue": {
        const take = Math.min(30, Math.max(1, Number(args.take) || 15));
        return assistanceQueue(take);
      }
      case "quote_lookup":
        return quoteLookup(args);
      case "invoice_lookup": {
        const num = typeof args.invoiceNumber === "string" ? args.invoiceNumber : "";
        if (!num.trim()) {
          return { source: "invoice_lookup", data: { error: "invoiceNumber is required" } };
        }
        return invoiceLookup(num);
      }
      case "quote_stats":
        return quoteStats();
      case "quote_list":
        return quoteList(args);
      case "trial_balance": {
        const asOf =
          typeof args.asOf === "string" && args.asOf.trim()
            ? new Date(args.asOf)
            : undefined;
        const tb = await getTrialBalance(asOf && !Number.isNaN(asOf.getTime()) ? asOf : undefined);
        return { source: "Trial balance", data: tb };
      }
      case "ar_ageing": {
        const rows = await getArAgeing();
        const totalDue = rows.reduce((s, r) => s + r.balanceDue, 0);
        return {
          source: "AR ageing",
          data: { count: rows.length, totalDue: Math.round(totalDue * 100) / 100, rows },
        };
      }
      case "stock_balances": {
        const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
        const rows = await getStockBalances();
        const mapped = rows
          .map((r) => ({
            productCode: r.product.code,
            productName: r.product.name,
            unit: r.product.unit,
            warehouse: r.warehouse.code,
            qtyOnHand: toNumber(r.quantityOnHand),
            qtyReserved: toNumber(r.quantityReserved),
            avgCost: toNumber(r.averageCost),
          }))
          .filter((r) =>
            query
              ? r.productCode.toLowerCase().includes(query) ||
                r.productName.toLowerCase().includes(query)
              : true
          );
        return { source: "Stock balances", data: { count: mapped.length, rows: mapped.slice(0, 40) } };
      }
      case "gst_summary": {
        const period = typeof args.period === "string" ? args.period.trim() : "";
        if (!period) return { source: "gst_summary", data: { error: "period YYYY-MM is required" } };
        return gstSummary(period);
      }
      case "draft_quote_email": {
        const num = typeof args.quoteNumber === "string" ? args.quoteNumber : "";
        if (!num.trim()) {
          return { source: "draft_quote_email", data: { error: "quoteNumber is required" } };
        }
        return draftQuoteEmail(num);
      }
      case "send_quote_email":
        return sendQuoteEmail(args, options?.userId);
      default:
        return { source: name, data: { error: `Unknown tool: ${name}` } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    return { source: name, data: { error: message } };
  }
}

export const ADMIN_TOOL_NAMES = ADMIN_TOOL_DEFINITIONS.map((t) => t.function.name);
