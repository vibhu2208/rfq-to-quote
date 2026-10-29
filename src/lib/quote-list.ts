import type { Prisma, QuoteStatus } from "@prisma/client";

export const QUOTE_LIST_PAGE_SIZE = 100;

export const QUOTE_LIST_STATUSES = [
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
] as const;

export type QuoteListFilters = {
  q: string;
  client: string;
  product: string;
  from: string;
  to: string;
  status: string;
  gst: string;
  assist: string;
  page: number;
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return (v[0] || "").trim();
  return (v || "").trim();
}

export function parseQuoteListFilters(
  sp: Record<string, string | string[] | undefined>
): QuoteListFilters {
  const page = Math.max(1, Number(one(sp.page)) || 1);
  return {
    q: one(sp.q),
    client: one(sp.client),
    product: one(sp.product),
    from: one(sp.from),
    to: one(sp.to),
    status: one(sp.status),
    gst: one(sp.gst),
    assist: one(sp.assist),
    page,
  };
}

export function quoteListHasFilters(f: QuoteListFilters): boolean {
  return Boolean(f.q || f.client || f.product || f.from || f.to || f.status || f.gst || f.assist);
}

export function quoteListQuery(f: Partial<QuoteListFilters>, page?: number): string {
  const params = new URLSearchParams();
  const set = (k: string, v?: string | number) => {
    const s = String(v ?? "").trim();
    if (s) params.set(k, s);
  };
  set("q", f.q);
  set("client", f.client);
  set("product", f.product);
  set("from", f.from);
  set("to", f.to);
  set("status", f.status);
  set("gst", f.gst);
  set("assist", f.assist);
  const p = page ?? f.page ?? 1;
  if (p > 1) params.set("page", String(p));
  const qs = params.toString();
  return qs ? `/quotes?${qs}` : "/quotes";
}

function dayStart(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayEnd(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function quoteListWhere(f: QuoteListFilters): Prisma.QuoteWhereInput {
  const and: Prisma.QuoteWhereInput[] = [];

  if (f.q) {
    and.push({
      OR: [
        { quoteNumber: { contains: f.q, mode: "insensitive" } },
        { quoteName: { contains: f.q, mode: "insensitive" } },
        { buyerName: { contains: f.q, mode: "insensitive" } },
        { buyerCompany: { contains: f.q, mode: "insensitive" } },
        { buyerEmail: { contains: f.q, mode: "insensitive" } },
        { buyerPhone: { contains: f.q, mode: "insensitive" } },
        { buyerGstin: { contains: f.q, mode: "insensitive" } },
        {
          lineItems: {
            some: {
              OR: [
                { description: { contains: f.q, mode: "insensitive" } },
                { aliasName: { contains: f.q, mode: "insensitive" } },
                { product: { is: { name: { contains: f.q, mode: "insensitive" } } } },
                { product: { is: { code: { contains: f.q, mode: "insensitive" } } } },
              ],
            },
          },
        },
      ],
    });
  }

  if (f.client) {
    and.push({
      OR: [
        { buyerCompany: { contains: f.client, mode: "insensitive" } },
        { buyerName: { contains: f.client, mode: "insensitive" } },
        { buyerGstin: { contains: f.client, mode: "insensitive" } },
      ],
    });
  }

  if (f.product) {
    and.push({
      lineItems: {
        some: {
          OR: [
            { description: { contains: f.product, mode: "insensitive" } },
            { aliasName: { contains: f.product, mode: "insensitive" } },
            { product: { is: { name: { contains: f.product, mode: "insensitive" } } } },
            { product: { is: { code: { contains: f.product, mode: "insensitive" } } } },
          ],
        },
      },
    });
  }

  const from = f.from ? dayStart(f.from) : null;
  const to = f.to ? dayEnd(f.to) : null;
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    and.push({
      OR: [{ issuedAt: range }, { AND: [{ issuedAt: null }, { createdAt: range }] }],
    });
  }

  if (f.status && (QUOTE_LIST_STATUSES as readonly string[]).includes(f.status)) {
    and.push({ status: f.status as QuoteStatus });
  }

  if (f.gst === "yes") and.push({ withGst: true });
  if (f.gst === "no") and.push({ withGst: false });
  if (f.assist === "1") and.push({ needsAssistance: true });

  return and.length > 0 ? { AND: and } : {};
}
