import type { Prisma, QuoteStatus } from "@prisma/client";

/** Small enough that a few dozen quotes paginate instead of rendering the full set. */
export const QUOTE_LIST_PAGE_SIZE = 25;

export const QUOTE_LIST_SORTS = ["updated", "number", "buyer", "status", "total"] as const;

export type QuoteListSort = (typeof QUOTE_LIST_SORTS)[number];

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
  min: string;
  max: string;
  sort: string;
  dir: "asc" | "desc";
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
  const sortRaw = one(sp.sort);
  const sort = (QUOTE_LIST_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "";
  return {
    q: one(sp.q),
    client: one(sp.client),
    product: one(sp.product),
    from: one(sp.from),
    to: one(sp.to),
    status: one(sp.status),
    gst: one(sp.gst),
    assist: one(sp.assist),
    min: one(sp.min),
    max: one(sp.max),
    sort,
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
    page,
  };
}

export function quoteListHasFilters(f: QuoteListFilters): boolean {
  return Boolean(
    f.q || f.client || f.product || f.from || f.to || f.status || f.gst || f.assist || f.min || f.max
  );
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
  set("min", f.min);
  set("max", f.max);
  set("sort", f.sort);
  if (f.sort) set("dir", f.dir);
  const p = page ?? f.page ?? 1;
  if (p > 1) params.set("page", String(p));
  const qs = params.toString();
  return qs ? `/quotes?${qs}` : "/quotes";
}

function moneyBound(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function quoteListOrderBy(
  f: Pick<QuoteListFilters, "sort" | "dir">
): Prisma.QuoteOrderByWithRelationInput[] {
  const dir = f.dir === "asc" ? "asc" : "desc";
  switch (f.sort) {
    case "number":
      return [{ quoteNumber: dir }];
    case "buyer":
      return [{ buyerCompany: dir }, { buyerName: dir }];
    case "status":
      return [{ status: dir }, { updatedAt: "desc" }];
    case "total":
      return [{ grandTotal: dir }, { updatedAt: "desc" }];
    case "updated":
      return [{ updatedAt: dir }];
    default:
      return [{ needsAssistance: "desc" }, { updatedAt: "desc" }];
  }
}

/** Next sort link for a column header. Text columns start ascending; amounts and dates start descending. */
export function quoteListSortQuery(
  f: QuoteListFilters,
  column: QuoteListSort
): string {
  const active = f.sort === column;
  const dir: "asc" | "desc" = !active
    ? column === "buyer" || column === "number" || column === "status"
      ? "asc"
      : "desc"
    : f.dir === "asc"
      ? "desc"
      : "asc";
  return quoteListQuery({ ...f, sort: column, dir, page: 1 });
}

export function quoteListExportHref(f: Partial<QuoteListFilters>): string {
  const path = quoteListQuery({ ...f, page: 1 });
  const qs = path.startsWith("/quotes?") ? path.slice("/quotes".length) : "";
  return `/api/quotes/export${qs}`;
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type QuoteListCsvRow = {
  quoteNumber: string;
  quoteName: string;
  buyer: string;
  status: string;
  updated: string;
  grandTotal: number;
  withGst: boolean;
};

export function quoteListCsv(rows: QuoteListCsvRow[]): string {
  const header = ["Quote", "Name", "Buyer", "Status", "Updated", "Total", "GST"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.quoteNumber,
        row.quoteName,
        row.buyer,
        row.status,
        row.updated,
        row.grandTotal,
        row.withGst ? "Yes" : "No",
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  return lines.join("\n");
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

  const min = moneyBound(f.min);
  const max = moneyBound(f.max);
  if (min != null || max != null) {
    const range: Prisma.DecimalFilter = {};
    if (min != null) range.gte = min;
    if (max != null) range.lte = max;
    and.push({ grandTotal: range });
  }

  return and.length > 0 ? { AND: and } : {};
}
