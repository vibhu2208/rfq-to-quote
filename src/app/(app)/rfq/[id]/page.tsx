"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  Check,
  ChevronDown,
  Mail,
  MessageCircle,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { StatusBadge, Money } from "@/components/ui";
import { ProductLastPriceInput } from "@/components/product-last-price-input";
import { AddCatalogProductDialog } from "@/components/add-catalog-product-dialog";
import {
  ProductStockCell,
  RfqProductSearch,
  useInventoryMap,
  type PickableProduct,
} from "@/components/rfq-product-picker";
import { extractRfqItems } from "@/lib/rfq-items";
import {
  vendorCostTotal,
  vendorPricedLineNumbers,
  vendorUnitCostForLine,
  vendorsWithPriceForLine,
} from "@/lib/vendor-line-price";
import type { CatalogRequirementInput } from "@/lib/catalog-product-draft";
import { parseApiJson, userFacingFetchError } from "@/lib/fetch-error";
import {
  clearRecoreDraft,
  loadRecoreDraft,
  saveRecoreDraft,
  type RecoreChannel,
} from "@/lib/recore-draft";

type ProductMatch = {
  score: number;
  matchedTokens: string[];
  product: {
    id: string;
    code: string;
    name: string;
    description: string;
    unit: string;
    offerPrice: number;
    lastPrice?: number | null;
    taxRate: number;
  };
};

type ProductSelections = {
  lineSelection?: Record<string, string>;
  /** Map of RFQ lineNumber → vendorId for sell-price override on convert. */
  lineVendorSelection?: Record<string, string>;
  selectedIds?: string[];
  extras?: Array<{
    lineNumber?: number;
    product: ProductMatch["product"];
  }>;
};

type RfqDetail = {
  id: string;
  channel: string;
  sourceRef: string;
  subject: string;
  rawText: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCompany: string;
  status: string;
  parsedCategory: string | null;
  parsedSpecs: Record<string, unknown> | null;
  parseConfidence: number | null;
  parseError: string | null;
  productSelections: ProductSelections | null;
  createdAt: string;
  messages: Array<{
    id: string;
    direction: string;
    channel: string;
    body: string;
    createdAt: string;
  }>;
  quotes: Array<{
    id: string;
    quoteNumber: string;
    status: string;
    grandTotal: unknown;
  }>;
};

type RfqRequirementItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  brand?: string | null;
  category?: string | null;
  model?: string | null;
  code?: string | null;
  extraNotes?: string | null;
};

type RequirementMatch = {
  lineNumber: number;
  requirement: RfqRequirementItem;
  keywords: string[];
  matches: ProductMatch[];
};

type VendorQuotedLineItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

type VendorLineQuote = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
  productKey: string;
};

type VendorContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

type VendorMatch = {
  vendor: {
    id: string;
    name: string;
    phone: string;
    email: string;
    whatsappId: string;
    preferredChannel: "EMAIL" | "WHATSAPP";
    contacts?: VendorContact[];
  };
  category: string;
  subcategory: string;
  matchedKeywords: string[];
  score: number;
  productKey: string;
  lastPrice: number | null;
  lastQuotedAt: string | null;
  matchedLines?: VendorLineQuote[];
  estimatedTotal?: number | null;
  outreach: {
    id: string;
    status: string;
    threadRef: string;
    quotedPrice: number | null;
    quotedLineItems?: VendorQuotedLineItem[];
    quotedTotal?: number | null;
    requestedLineNumbers?: number[] | null;
    replyIntent?: string;
    negotiationNote?: string;
    previousQuotedPrice?: number | null;
    sentAt: string | null;
    repliedAt: string | null;
    negotiatedAt?: string | null;
    errorMessage: string;
  } | null;
};

type VendorDirectoryRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsappId: string;
  preferredChannel: "EMAIL" | "WHATSAPP";
  contacts?: VendorContact[];
  categories?: Array<{ category: string; subcategory?: string }>;
  productHistory?: Array<{
    productKey?: string;
    lastPrice?: number | null;
    lastQuotedAt?: string | null;
  }>;
};

function buildContactsForVendor(vendor: {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsappId?: string;
  contacts?: VendorContact[];
}): VendorContact[] {
  const mapped =
    vendor.contacts && vendor.contacts.length > 0
      ? vendor.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name || "",
          email: contact.email || "",
          phone: contact.phone || "",
          role: contact.role || "",
          isPrimary: Boolean(contact.isPrimary),
        }))
      : [];
  const vendorWa = (vendor.whatsappId || vendor.phone || "").trim();
  const hasPhone = mapped.some((contact) => Boolean(contact.phone?.trim()));
  if (vendorWa && !hasPhone) {
    mapped.push({
      id: `vendor-${vendor.id}-wa`,
      name: vendor.name,
      email: vendor.email || "",
      phone: vendorWa,
      role: "WhatsApp",
      isPrimary: mapped.length === 0,
    });
  } else if (mapped.length === 0 && (vendor.email || vendorWa)) {
    mapped.push({
      id: `vendor-${vendor.id}`,
      name: vendor.name,
      email: vendor.email || "",
      phone: vendorWa,
      role: "",
      isPrimary: true,
    });
  }
  return mapped;
}

/** Manual intake from the vendors directory when auto-match misses. */
function vendorDirectoryToMatch(
  vendor: VendorDirectoryRow,
  options?: {
    productKey?: string;
    lines?: Array<{
      lineNumber: number;
      description: string;
      quantity: number;
      unit: string;
    }>;
  }
): VendorMatch {
  const category = vendor.categories?.[0]?.category || "Manual";
  const subcategory = vendor.categories?.[0]?.subcategory || "";
  const productKey = options?.productKey || "manual";
  const history = vendor.productHistory?.[0];
  const lastPrice =
    history?.lastPrice != null && Number.isFinite(Number(history.lastPrice))
      ? Number(history.lastPrice)
      : null;
  const matchedLines = (options?.lines || []).map((line) => ({
    lineNumber: line.lineNumber,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: lastPrice,
    lineTotal:
      lastPrice != null ? lastPrice * (line.quantity > 0 ? line.quantity : 1) : null,
    productKey,
  }));
  return {
    vendor: {
      id: vendor.id,
      name: vendor.name,
      phone: vendor.phone || "",
      email: vendor.email || "",
      whatsappId: vendor.whatsappId || "",
      preferredChannel: vendor.preferredChannel || "EMAIL",
      contacts: buildContactsForVendor(vendor),
    },
    category,
    subcategory,
    matchedKeywords: ["manual"],
    score: 0,
    productKey,
    lastPrice,
    lastQuotedAt: history?.lastQuotedAt || null,
    matchedLines,
    estimatedTotal:
      matchedLines.length > 0 &&
      matchedLines.every((line) => line.lineTotal != null)
        ? matchedLines.reduce((sum, line) => sum + (line.lineTotal || 0), 0)
        : lastPrice,
    outreach: null,
  };
}

function vendorDisplayPrice(match: VendorMatch): {
  amount: number | null;
  source: string | null;
  lines: Array<{
    lineNumber: number;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
} {
  const repliedLines = match.outreach?.quotedLineItems || [];
  if (repliedLines.length > 0) {
    const total =
      match.outreach?.quotedTotal ??
      repliedLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const declined = match.outreach?.status === "DECLINED";
    return {
      amount: total,
      source: declined
        ? "Declined"
        : match.outreach?.status === "NEGOTIATING"
          ? "Negotiating"
          : match.outreach?.previousQuotedPrice != null &&
              match.outreach.previousQuotedPrice !== total
            ? "Updated quote"
            : "Vendor reply",
      lines: repliedLines,
    };
  }
  if (match.outreach?.quotedPrice != null) {
    const declined = match.outreach?.status === "DECLINED";
    return {
      amount: match.outreach.quotedPrice,
      source: declined
        ? "Declined"
        : match.outreach?.status === "NEGOTIATING"
          ? "Negotiating"
          : match.outreach?.previousQuotedPrice != null &&
              match.outreach.previousQuotedPrice !== match.outreach.quotedPrice
            ? "Updated quote"
            : "Vendor reply",
      lines: match.matchedLines || [],
    };
  }
  if (match.matchedLines && match.matchedLines.length > 0) {
    const withPrice = match.matchedLines.filter((l) => l.unitPrice != null);
    if (withPrice.length > 0) {
      return {
        amount:
          match.estimatedTotal ??
          withPrice.reduce((sum, l) => sum + (l.lineTotal || 0), 0),
        source: "Last quoted",
        lines: match.matchedLines,
      };
    }
  }
  if (match.lastPrice != null) {
    return {
      amount: match.lastPrice,
      source: "Last quoted",
      lines: match.matchedLines || [],
    };
  }
  return { amount: null, source: null, lines: match.matchedLines || [] };
}

type MarketplaceListing = {
  source: "amazon" | "flipkart" | "indiamart";
  title: string;
  price: number | null;
  currency: "INR";
  link: string;
  rating?: number;
  reviews?: number;
  thumbnail?: string;
  supplier?: string;
  moq?: string;
};

type MarketplaceComparison = {
  query: string;
  budget: number | null;
  catalogPrice: number | null;
  catalogProductName: string | null;
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
  fetchedAt: string;
  cached?: boolean;
  needsFetch?: boolean;
  errors?: string[];
};

function PriceDelta({ value }: { value: number }) {
  const color =
    value > 0 ? "text-red-700" : value < 0 ? "text-dark-primary" : "text-mid-green";
  return (
    <span className={color}>
      {value > 0 ? "+" : ""}
      <Money value={value} />
    </span>
  );
}

/** Compact, price-first cell shared by marketplace + vendor columns for easy comparison. */
function ComparePriceCell({
  title,
  price,
  meta,
  href,
  marketplace,
  best,
}: {
  title: string;
  price: number | null;
  meta?: string;
  href?: string;
  marketplace: MarketplaceComparison;
  best?: boolean;
}) {
  return (
    <div
      className={`space-y-1.5 rounded-lg px-3 py-2.5 ${
        best ? "bg-mid-green/15 ring-1 ring-mid-green/40" : ""
      }`}
    >
      <div
        className={`rounded-md px-2.5 py-1.5 ${
          best ? "bg-mid-green/25" : "bg-dark-secondary/5"
        }`}
      >
        {price != null ? (
          <div className="text-base font-semibold tabular-nums text-dark-primary">
            <Money value={price} />
            {best ? (
              <span className="ml-1.5 align-middle text-[10px] font-medium uppercase tracking-wide text-mid-green">
                Best
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-medium text-mid-green">No price</div>
        )}
        {price != null && (marketplace.budget != null || marketplace.catalogPrice != null) ? (
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs leading-tight">
            {marketplace.budget != null ? (
              <span>
                bud <PriceDelta value={price - marketplace.budget} />
              </span>
            ) : null}
            {marketplace.catalogPrice != null ? (
              <span>
                cat <PriceDelta value={price - marketplace.catalogPrice} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="line-clamp-1 text-sm font-medium text-dark-primary" title={title}>
        {title}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-mid-green">
        <span className="truncate">{meta || "—"}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium hover:underline"
          >
            View
          </a>
        ) : null}
      </div>
    </div>
  );
}

function MarketplaceListingCell({
  listing,
  marketplace,
  best,
}: {
  listing: MarketplaceListing | undefined;
  marketplace: MarketplaceComparison;
  best?: boolean;
}) {
  if (!listing) {
    return <span className="block px-2 py-3 text-center text-xs text-mid-green">—</span>;
  }

  const metaParts = [
    listing.supplier,
    listing.rating != null
      ? `${listing.rating}★${listing.reviews != null ? ` (${listing.reviews.toLocaleString()})` : ""}`
      : null,
    listing.moq,
  ].filter(Boolean);

  return (
    <ComparePriceCell
      title={listing.title}
      price={listing.price}
      meta={metaParts.join(" · ")}
      href={listing.link}
      marketplace={marketplace}
      best={best}
    />
  );
}

function VendorListingCell({
  match,
  marketplace,
  best,
}: {
  match: VendorMatch | undefined;
  marketplace: MarketplaceComparison;
  best?: boolean;
}) {
  if (!match) {
    return <span className="block px-2 py-3 text-center text-xs text-mid-green">—</span>;
  }

  const display = vendorDisplayPrice(match);
  const meta = [match.vendor.name, display.source, `Score ${match.score}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <ComparePriceCell
      title={match.category + (match.subcategory ? ` / ${match.subcategory}` : "")}
      price={display.amount}
      meta={meta}
      marketplace={marketplace}
      best={best}
    />
  );
}

const MARKETPLACE_ROW_COUNT = 5;

function VendorPriceDetailModal({
  match,
  selectedByLine,
  onClose,
  onProductPriceSaved,
}: {
  match: VendorMatch;
  selectedByLine: Record<number, { id: string; name: string; offerPrice: number } | undefined>;
  onClose: () => void;
  onProductPriceSaved: (productId: string, price: number) => void;
}) {
  const display = vendorDisplayPrice(match);
  const lines =
    display.lines.length > 0
      ? display.lines
      : match.matchedLines || [];
  const sum =
    display.amount ??
    (lines.every((l) => l.lineTotal != null)
      ? lines.reduce((acc, l) => acc + (l.lineTotal || 0), 0)
      : null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-price-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="vendor-price-title"
              className="text-base font-semibold text-dark-primary"
            >
              {match.vendor.name}
            </h3>
            <p className="mt-0.5 text-xs text-mid-green">
              Quote by product
              {display.source ? ` · ${display.source}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-mid-green hover:bg-dark-secondary/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-mid-green">
            No per-product prices yet. Send a Recore email — the vendor reply will
            fill line prices here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-dark-secondary/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-dark-secondary/5 text-xs text-mid-green">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Vendor</th>
                  <th className="px-3 py-2 text-right font-medium">Last price</th>
                  <th className="px-3 py-2 text-right font-medium">Line</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.lineNumber}
                    className="border-t border-dark-secondary/10"
                  >
                    <td className="px-3 py-2 text-mid-green">{line.lineNumber}</td>
                    <td className="px-3 py-2 text-dark-primary">
                      {line.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.unitPrice != null ? (
                        <Money value={line.unitPrice} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {selectedByLine[line.lineNumber] ? (
                        <ProductLastPriceInput
                          productId={selectedByLine[line.lineNumber]!.id}
                          value={
                            selectedByLine[line.lineNumber]!.offerPrice ||
                            line.unitPrice ||
                            0
                          }
                          onSaved={(price) =>
                            onProductPriceSaved(
                              selectedByLine[line.lineNumber]!.id,
                              price
                            )
                          }
                        />
                      ) : (
                        <span className="text-xs font-normal text-mid-green">
                          Pick a product
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {line.lineTotal != null ? (
                        <Money value={line.lineTotal} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-dark-secondary/20 bg-mid-green/10">
                  <td
                    colSpan={5}
                    className="px-3 py-2.5 text-right text-sm font-medium text-dark-primary"
                  >
                    Sum
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-dark-primary">
                    {sum != null ? <Money value={sum} /> : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type NegotiateSendPayload =
  | { mode: "ai"; plainNote: string }
  | { mode: "manual"; subject: string; body: string; plainNote?: string };

function buildManualNegotiationDraft(match: VendorMatch) {
  const company = "QuoteFlow";
  const threadRef = match.outreach?.threadRef || "";
  const baseSubject =
    match.outreach?.threadRef
      ? match.outreach.quotedPrice != null ||
        (match.outreach.quotedLineItems && match.outreach.quotedLineItems.length > 0)
        ? `Re: Quote negotiation [REF:${threadRef}]`
        : `Re: Quote request [REF:${threadRef}]`
      : "Re: Quote negotiation";
  const display = vendorDisplayPrice(match);
  const priceLine =
    display.amount != null
      ? `Your current quote totals about Rs.${Number(display.amount).toLocaleString("en-IN")}.\n\n`
      : "";
  const body = `Hello ${match.vendor.name},

Thank you for your quotation. We would like to negotiate as follows:

${priceLine}[Write your ask here]

Please reply with your best revised unit prices (INR) for each line, or let us know if you cannot revise.

Reference: [REF:${threadRef || "—"}]

Thanks,
${company}`;
  return { subject: baseSubject, body };
}

function VendorNegotiateModal({
  match,
  busy,
  onClose,
  onSend,
}: {
  match: VendorMatch;
  busy: boolean;
  onClose: () => void;
  onSend: (payload: NegotiateSendPayload) => Promise<void>;
}) {
  const display = vendorDisplayPrice(match);
  const manualSeed = useMemo(() => buildManualNegotiationDraft(match), [match]);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState(manualSeed.subject);
  const [body, setBody] = useState(manualSeed.body);
  const [localError, setLocalError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const main = document.querySelector("main");
    const scrollTop = main instanceof HTMLElement ? main.scrollTop : 0;
    const locked: Array<{ el: HTMLElement; overflow: string }> = [];
    for (const el of [document.documentElement, document.body, main]) {
      if (!(el instanceof HTMLElement)) continue;
      locked.push({ el, overflow: el.style.overflow });
      el.style.overflow = "hidden";
    }
    if (main instanceof HTMLElement) main.scrollTop = scrollTop;
    return () => {
      for (const entry of locked) entry.el.style.overflow = entry.overflow;
      if (main instanceof HTMLElement) main.scrollTop = scrollTop;
    };
  }, []);

  async function submit() {
    setLocalError("");
    try {
      if (mode === "ai") {
        if (note.trim().length < 3) {
          setLocalError("Write a short note in your own words.");
          return;
        }
        await onSend({ mode: "ai", plainNote: note.trim() });
        return;
      }
      if (!subject.trim()) {
        setLocalError("Add an email subject.");
        return;
      }
      if (body.trim().length < 10) {
        setLocalError("Write the full email body before sending.");
        return;
      }
      await onSend({
        mode: "manual",
        subject: subject.trim(),
        body: body.trim(),
        plainNote: note.trim() || undefined,
      });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not send");
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overscroll-none bg-dark-primary/50 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="negotiate-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-light-green/30 bg-white shadow-[0_24px_80px_rgba(11,43,38,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-light-green/25 px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-mid-green/10 px-2.5 py-1 text-[11px] font-medium text-mid-green">
              <Mail className="h-3 w-3" strokeWidth={1.75} />
              Same Recore thread
            </div>
            <h3
              id="negotiate-title"
              className="mt-2 text-lg font-semibold tracking-tight text-dark-primary"
            >
              Negotiate · {match.vendor.name}
            </h3>
            <p className="mt-1 text-sm text-mid-green">
              {display.amount != null ? (
                <>
                  Current quote sum <Money value={display.amount} /> ·{" "}
                </>
              ) : null}
              Choose AI polish or write the email yourself.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-mid-green transition hover:bg-dark-secondary/8 hover:text-dark-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="shrink-0 px-5 pt-4">
          <div className="inline-flex rounded-full bg-dark-secondary/[0.05] p-1">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                mode === "ai"
                  ? "bg-mid-green text-background shadow-sm"
                  : "text-mid-green hover:bg-light-green/20"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              Write with AI
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                mode === "manual"
                  ? "bg-mid-green text-background shadow-sm"
                  : "text-mid-green hover:bg-light-green/20"
              }`}
            >
              <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} />
              Write manually
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {mode === "ai" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-light-green/25 bg-light-green/10 px-3 py-2.5 text-xs text-mid-green">
                Type a casual note. AI will turn it into a polite business email and send
                it on the same thread.
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-mid-green">
                  Your note
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={8}
                  placeholder="e.g. price too high, ask 10% less on monitors and UPS, need best rate this week"
                  className="w-full resize-none rounded-xl border border-light-green/35 bg-white px-3 py-3 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-light-green/25 bg-light-green/10 px-3 py-2.5 text-xs text-mid-green">
                Edit the subject and full email. Thread reference is kept automatically.
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-mid-green">
                  Subject
                </span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 w-full rounded-xl border border-light-green/35 bg-white px-3 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-mid-green">
                  Message
                </span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full resize-none rounded-xl border border-light-green/35 bg-white px-3 py-3 font-mono text-[12px] leading-relaxed text-dark-primary outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                />
              </label>
            </div>
          )}
          {localError ? (
            <p className="mt-3 text-xs text-red-700">{localError}</p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-light-green/25 px-5 py-3.5">
          <p className="text-xs text-mid-green">
            {mode === "ai"
              ? "AI formats your note, then sends"
              : "Sends your email exactly as written"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-mid-green transition hover:bg-dark-secondary/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-mid-green px-4 py-2 text-sm font-medium text-background shadow-[0_8px_20px_rgba(45,106,79,0.25)] transition hover:bg-dark-secondary disabled:opacity-60"
            >
              {mode === "ai" ? (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {busy
                ? "Sending…"
                : mode === "ai"
                  ? "Format & send"
                  : "Send email"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function VendorRecoreLinePickerModal({
  match,
  rfqId,
  items,
  busy,
  onClose,
  onSend,
}: {
  match: VendorMatch;
  rfqId: string;
  items: RfqRequirementItem[];
  busy: boolean;
  onClose: () => void;
  onSend: (input: {
    channel: RecoreChannel;
    lineNumbers: number[];
    contactIds: string[];
    subject: string;
    body: string;
  }) => Promise<void>;
}) {
  const matchedSet = useMemo(
    () => new Set((match.matchedLines || []).map((line) => line.lineNumber)),
    [match.matchedLines]
  );
  const savedDraft = useMemo(
    () => loadRecoreDraft(rfqId, match.vendor.id),
    [rfqId, match.vendor.id]
  );
  const defaultChecked = useMemo(
    () =>
      items.length === 0
        ? []
        : items
            .filter(
              (item) => matchedSet.size === 0 || matchedSet.has(item.lineNumber)
            )
            .map((item) => item.lineNumber),
    [items, matchedSet]
  );

  function contactReachable(contact: VendorContact, channel: RecoreChannel) {
    return channel === "WHATSAPP"
      ? Boolean(contact.phone?.trim())
      : Boolean(contact.email?.trim());
  }

  function buildVendorContacts(vendor: VendorMatch["vendor"]): VendorContact[] {
    let list =
      vendor.contacts && vendor.contacts.length > 0 ? [...vendor.contacts] : [];
    const vendorWa = (vendor.whatsappId || vendor.phone || "").trim();
    const hasWa = list.some((contact) => Boolean(contact.phone?.trim()));
    if (vendorWa && !hasWa) {
      list = [
        ...list,
        {
          id: `vendor-${vendor.id}-wa`,
          name: vendor.name,
          email: vendor.email || "",
          phone: vendorWa,
          role: "WhatsApp",
          isPrimary: list.length === 0,
        },
      ];
    } else if (list.length === 0 && (vendor.email || vendorWa)) {
      list = [
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
    return list;
  }

  function pickDefaultChannel(
    list: VendorContact[],
    vendor: VendorMatch["vendor"],
    draftChannel?: RecoreChannel
  ): RecoreChannel {
    const hasEmail = list.some((contact) => Boolean(contact.email?.trim()));
    const hasPhone = list.some((contact) => Boolean(contact.phone?.trim()));
    if (draftChannel === "WHATSAPP" && hasPhone) return "WHATSAPP";
    if (draftChannel === "EMAIL" && hasEmail) return "EMAIL";
    if (vendor.preferredChannel === "WHATSAPP" && hasPhone) return "WHATSAPP";
    if (vendor.preferredChannel === "EMAIL" && hasEmail) return "EMAIL";
    // Phone-only vendors (e.g. NetWire without email) must open on WhatsApp.
    if (hasPhone && !hasEmail) return "WHATSAPP";
    if (hasEmail) return "EMAIL";
    if (hasPhone) return "WHATSAPP";
    return "EMAIL";
  }

  const fallbackContacts: VendorContact[] = useMemo(
    () => buildVendorContacts(match.vendor),
    [match.vendor]
  );
  const defaultChannel: RecoreChannel = pickDefaultChannel(
    fallbackContacts,
    match.vendor,
    savedDraft?.channel
  );

  function seedContactIds(
    list: VendorContact[],
    channel: RecoreChannel,
    preferredIds?: string[]
  ): Set<string> {
    if (preferredIds && preferredIds.length > 0) {
      const kept = preferredIds.filter((id) => {
        const contact = list.find((row) => row.id === id);
        return contact ? contactReachable(contact, channel) : false;
      });
      if (kept.length > 0) return new Set(kept);
    }
    if (channel === "WHATSAPP") {
      const primary = list.find(
        (contact) => contact.isPrimary && contact.phone?.trim()
      );
      const first = list.find((contact) => contact.phone?.trim());
      const seed = primary || first;
      return new Set(seed ? [seed.id] : []);
    }
    const primary = list.find(
      (contact) => contact.isPrimary && contact.email?.trim()
    );
    const first = list.find((contact) => contact.email?.trim());
    const seed = primary || first;
    return new Set(seed ? [seed.id] : []);
  }

  const initialLines =
    savedDraft && savedDraft.lineNumbers.length > 0
      ? savedDraft.lineNumbers.filter((lineNumber) =>
          items.length === 0
            ? true
            : items.some((item) => item.lineNumber === lineNumber)
        )
      : defaultChecked.length > 0
        ? defaultChecked
        : items.map((item) => item.lineNumber);

  const [channel, setChannel] = useState<RecoreChannel>(defaultChannel);
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(initialLines)
  );
  const [contacts, setContacts] = useState<VendorContact[]>(fallbackContacts);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    () =>
      seedContactIds(
        fallbackContacts,
        defaultChannel,
        savedDraft?.contactIds
      )
  );
  const hasRestoredEmail = Boolean(
    savedDraft?.draftTouched && (savedDraft.subject || savedDraft.body)
  );
  const [subject, setSubject] = useState(savedDraft?.subject || "");
  const [body, setBody] = useState(savedDraft?.body || "");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftTick, setDraftTick] = useState(0);
  const [localError, setLocalError] = useState("");
  const [addRecipientOpen, setAddRecipientOpen] = useState(false);
  const [addingRecipient, setAddingRecipient] = useState(false);
  const [newRecipient, setNewRecipient] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    isPrimary: false,
  });
  const draftTouchedRef = useRef(Boolean(savedDraft?.draftTouched));
  const contactsLoadedRef = useRef(fallbackContacts.length > 0);
  const lastDraftKeyRef = useRef(hasRestoredEmail ? "restored" : "");
  const skipPreviewOnceRef = useRef(hasRestoredEmail);
  const channelRef = useRef(channel);
  const checkedRef = useRef(checked);
  const selectedContactIdsRef = useRef(selectedContactIds);
  const subjectRef = useRef(subject);
  const bodyRef = useRef(body);
  channelRef.current = channel;
  checkedRef.current = checked;
  selectedContactIdsRef.current = selectedContactIds;
  subjectRef.current = subject;
  bodyRef.current = body;

  const lineKey = useMemo(
    () => [...checked].sort((a, b) => a - b).join(","),
    [checked]
  );

  function toggle(lineNumber: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function markDraftEdited() {
    draftTouchedRef.current = true;
  }

  function persistDraft() {
    saveRecoreDraft(rfqId, match.vendor.id, {
      channel: channelRef.current,
      lineNumbers: [...checkedRef.current].sort((a, b) => a - b),
      contactIds: [...selectedContactIdsRef.current],
      subject: subjectRef.current,
      body: bodyRef.current,
      draftTouched: draftTouchedRef.current,
    });
  }

  function switchChannel(next: RecoreChannel) {
    if (next === channel) return;
    setChannel(next);
    setSelectedContactIds((prev) => {
      const kept = [...prev].filter((id) => {
        const contact = contacts.find((row) => row.id === id);
        if (!contact) return false;
        return next === "WHATSAPP" ? Boolean(contact.phone) : Boolean(contact.email);
      });
      if (kept.length > 0) return new Set(kept);
      return seedContactIds(contacts, next);
    });
    setLocalError("");
  }

  function resetNewRecipientForm() {
    setNewRecipient({
      name: "",
      email: "",
      phone: "",
      role: "",
      isPrimary: false,
    });
  }

  async function saveNewRecipient() {
    setLocalError("");
    const name = newRecipient.name.trim();
    const email = newRecipient.email.trim();
    const phone = newRecipient.phone.trim();
    const role = newRecipient.role.trim();
    if (!name && !email && !phone) {
      setLocalError("Enter a name, email, or phone for the recipient.");
      return;
    }
    if (channel === "EMAIL" && !email) {
      setLocalError("Add an email address to send Recore by email.");
      return;
    }
    if (channel === "WHATSAPP" && !phone) {
      setLocalError("Add a WhatsApp / phone number to send Recore by WhatsApp.");
      return;
    }
    setAddingRecipient(true);
    try {
      const res = await fetch(`/api/vendors/${match.vendor.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          role,
          isPrimary: newRecipient.isPrimary,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error?.formErrors?.[0] ||
              "Could not save recipient on this vendor.";
        setLocalError(message);
        return;
      }
      const created: VendorContact = {
        id: String(data.id),
        name: String(data.name || name),
        email: String(data.email || email),
        phone: String(data.phone || phone),
        role: String(data.role || role),
        isPrimary: Boolean(data.isPrimary),
      };
      setContacts((prev) => {
        const withoutSynthetic = prev.filter(
          (contact) => !String(contact.id).startsWith(`vendor-${match.vendor.id}`)
        );
        const next = created.isPrimary
          ? withoutSynthetic.map((contact) => ({ ...contact, isPrimary: false }))
          : withoutSynthetic;
        return [...next, created];
      });
      setSelectedContactIds((prev) => new Set([...prev, created.id]));
      resetNewRecipientForm();
      setAddRecipientOpen(false);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Could not save recipient"
      );
    } finally {
      setAddingRecipient(false);
    }
  }

  function handleClose() {
    persistDraft();
    onClose();
  }

  function reloadDraft() {
    draftTouchedRef.current = false;
    lastDraftKeyRef.current = "";
    skipPreviewOnceRef.current = false;
    setDraftTick((tick) => tick + 1);
  }

  // Autosave while editing + flush on tab hide / unload.
  useEffect(() => {
    const timer = window.setTimeout(persistDraft, 400);
    return () => window.clearTimeout(timer);
  }, [channel, checked, selectedContactIds, subject, body, rfqId, match.vendor.id]);

  useEffect(() => {
    const flush = () => persistDraft();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      persistDraft();
    };
  }, [rfqId, match.vendor.id]);

  useEffect(() => {
    // Restored drafts already have subject/body — skip the first preview when
    // contacts are already available from the vendor match payload.
    if (skipPreviewOnceRef.current && contactsLoadedRef.current) {
      skipPreviewOnceRef.current = false;
      lastDraftKeyRef.current = `${lineKey}::${draftTick}`;
      return;
    }
    skipPreviewOnceRef.current = false;

    const draftKey = `${lineKey}::${draftTick}`;
    let cancelled = false;
    const controller = new AbortController();
    const lineNumbers = lineKey
      ? lineKey
          .split(",")
          .map((value) => Number(value))
          .filter((n) => n > 0)
      : [];

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      if (lastDraftKeyRef.current === draftKey) return;
      setDraftBusy(true);
      try {
        const res = await fetch(
          `/api/rfqs/${rfqId}/vendors/${match.vendor.id}/recore`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              preview: true,
              productKey: match.productKey,
              ...(lineNumbers.length > 0 ? { lineNumbers } : {}),
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLocalError(
            typeof data.error === "string"
              ? data.error
              : "Could not load email draft"
          );
          return;
        }
        lastDraftKeyRef.current = draftKey;
        setLocalError("");
        if (Array.isArray(data.contacts) && data.contacts.length > 0) {
          contactsLoadedRef.current = true;
          const nextContacts = data.contacts as VendorContact[];
          setContacts(nextContacts);
          const nextChannel = pickDefaultChannel(
            nextContacts,
            {
              ...match.vendor,
              preferredChannel:
                data.preferredChannel === "WHATSAPP" ? "WHATSAPP" : match.vendor.preferredChannel,
              whatsappId:
                typeof data.whatsappId === "string"
                  ? data.whatsappId
                  : match.vendor.whatsappId,
              phone:
                typeof data.phone === "string" ? data.phone : match.vendor.phone,
            },
            channelRef.current
          );
          if (nextChannel !== channelRef.current) {
            setChannel(nextChannel);
          }
          setSelectedContactIds((prev) =>
            seedContactIds(nextContacts, nextChannel, [...prev])
          );
        }
        if (!draftTouchedRef.current) {
          setSubject(typeof data.subject === "string" ? data.subject : "");
          setBody(typeof data.body === "string" ? data.body : "");
        }
      } catch (error) {
        if (
          cancelled ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setLocalError("Could not load email draft");
      } finally {
        if (!cancelled) setDraftBusy(false);
      }
    }, draftTick > 0 ? 0 : 450);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [lineKey, draftTick, match.productKey, match.vendor.id, rfqId]);

  async function submit() {
    setLocalError("");
    const lineNumbers = [...checked].sort((a, b) => a - b);
    if (items.length > 0 && lineNumbers.length === 0) {
      setLocalError("Select at least one line to request from this vendor.");
      return;
    }
    const contactIds = [...selectedContactIds];
    if (contactIds.length === 0) {
      setLocalError(
        channel === "WHATSAPP"
          ? "Select at least one WhatsApp contact."
          : "Select at least one POC to email."
      );
      return;
    }
    if (!body.trim()) {
      setLocalError("Write the message body before sending.");
      return;
    }
    if (channel === "EMAIL" && !subject.trim()) {
      setLocalError("Write the email subject and body before sending.");
      return;
    }
    try {
      await onSend({
        channel,
        lineNumbers,
        contactIds,
        subject: subject.trim(),
        body: body.trim(),
      });
      clearRecoreDraft(rfqId, match.vendor.id);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not send");
    }
  }

  const selectedRecipients = contacts.filter((contact) =>
    selectedContactIds.has(contact.id)
  );
  const reachableContacts = contacts.filter((contact) =>
    channel === "WHATSAPP" ? Boolean(contact.phone) : Boolean(contact.email)
  );
  const allLinesSelected = items.length > 0 && checked.size === items.length;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep the RFQ page from scrolling/jumping while the overlay is open.
  // Modals are portaled to body because the RFQ layout uses a CSS transform
  // (which traps position:fixed inside the scroll container).
  useEffect(() => {
    const main = document.querySelector("main");
    const scrollTop = main instanceof HTMLElement ? main.scrollTop : 0;
    const locked: Array<{ el: HTMLElement; overflow: string }> = [];
    for (const el of [document.documentElement, document.body, main]) {
      if (!(el instanceof HTMLElement)) continue;
      locked.push({ el, overflow: el.style.overflow });
      el.style.overflow = "hidden";
    }
    if (main instanceof HTMLElement) main.scrollTop = scrollTop;

    return () => {
      for (const entry of locked) {
        entry.el.style.overflow = entry.overflow;
      }
      if (main instanceof HTMLElement) main.scrollTop = scrollTop;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overscroll-none bg-dark-primary/50 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recore-lines-title"
      onClick={handleClose}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div
        className="flex max-h-[min(92vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-light-green/30 bg-white shadow-[0_24px_80px_rgba(11,43,38,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-light-green/25 bg-[linear-gradient(180deg,rgba(232,242,236,0.55),rgba(255,255,255,0.95))] px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-mid-green/10 px-2.5 py-1 text-[11px] font-medium text-mid-green">
              {channel === "WHATSAPP" ? (
                <MessageCircle className="h-3 w-3" strokeWidth={1.75} />
              ) : (
                <Mail className="h-3 w-3" strokeWidth={1.75} />
              )}
              Vendor request
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="recore-lines-title"
                  className="text-lg font-semibold tracking-tight text-dark-primary"
                >
                  Recore · {match.vendor.name}
                </h3>
                <p className="mt-1 text-sm text-mid-green">
                  Choose channel, recipients, and lines — then refine the draft.
                </p>
              </div>
              <div className="inline-flex shrink-0 rounded-xl border border-light-green/35 bg-white p-1">
                <button
                  type="button"
                  onClick={() => switchChannel("EMAIL")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    channel === "EMAIL"
                      ? "bg-mid-green text-background shadow-sm"
                      : "text-mid-green hover:bg-light-green/30"
                  }`}
                >
                  <Mail className="h-3 w-3" strokeWidth={1.75} />
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => switchChannel("WHATSAPP")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    channel === "WHATSAPP"
                      ? "bg-mid-green text-background shadow-sm"
                      : "text-mid-green hover:bg-light-green/30"
                  }`}
                >
                  <MessageCircle className="h-3 w-3" strokeWidth={1.75} />
                  WhatsApp
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-mid-green transition hover:bg-dark-secondary/8 hover:text-dark-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)_minmax(0,1.35fr)]">
          <section className="flex min-h-0 flex-col border-b border-light-green/20 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-light-green/15 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-dark-primary">
                <Users className="h-3.5 w-3.5 text-mid-green" strokeWidth={1.75} />
                Recipients
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-dark-secondary/5 px-2 py-0.5 text-[11px] tabular-nums text-mid-green">
                  {selectedRecipients.length}/{reachableContacts.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAddRecipientOpen((open) => !open);
                    setLocalError("");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-light-green/35 bg-white px-2 py-1 text-[11px] font-medium text-mid-green transition hover:bg-light-green/20"
                >
                  <Plus className="h-3 w-3" strokeWidth={1.75} />
                  Add
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {addRecipientOpen ? (
                <div className="mb-3 space-y-2 rounded-xl border border-mid-green/25 bg-mid-green/[0.04] p-3">
                  <div className="text-[11px] font-medium text-dark-primary">
                    New recipient · saved on {match.vendor.name}
                  </div>
                  <input
                    value={newRecipient.name}
                    onChange={(event) =>
                      setNewRecipient((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Name"
                    className="h-9 w-full rounded-lg border border-light-green/35 bg-white px-2.5 text-sm outline-none focus:border-mid-green"
                  />
                  <input
                    value={newRecipient.role}
                    onChange={(event) =>
                      setNewRecipient((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                    placeholder="Role (optional)"
                    className="h-9 w-full rounded-lg border border-light-green/35 bg-white px-2.5 text-sm outline-none focus:border-mid-green"
                  />
                  <input
                    type="email"
                    value={newRecipient.email}
                    onChange={(event) =>
                      setNewRecipient((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Email"
                    className="h-9 w-full rounded-lg border border-light-green/35 bg-white px-2.5 text-sm outline-none focus:border-mid-green"
                  />
                  <input
                    value={newRecipient.phone}
                    onChange={(event) =>
                      setNewRecipient((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="WhatsApp / phone (+91…)"
                    className="h-9 w-full rounded-lg border border-light-green/35 bg-white px-2.5 text-sm outline-none focus:border-mid-green"
                  />
                  <label className="flex items-center gap-2 text-[11px] text-mid-green">
                    <input
                      type="checkbox"
                      checked={newRecipient.isPrimary}
                      onChange={(event) =>
                        setNewRecipient((current) => ({
                          ...current,
                          isPrimary: event.target.checked,
                        }))
                      }
                    />
                    Set as primary POC
                  </label>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={addingRecipient}
                      onClick={() => {
                        resetNewRecipientForm();
                        setAddRecipientOpen(false);
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-mid-green hover:bg-white/80 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={addingRecipient}
                      onClick={() => void saveNewRecipient()}
                      className="inline-flex items-center gap-1 rounded-lg bg-mid-green px-2.5 py-1.5 text-[11px] font-medium text-background disabled:opacity-60"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.75} />
                      {addingRecipient ? "Saving…" : "Save recipient"}
                    </button>
                  </div>
                </div>
              ) : null}
              {contacts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-light-green/40 bg-light-green/10 px-3 py-6 text-center text-xs leading-relaxed text-mid-green">
                  No POCs yet. Use <span className="font-medium">Add</span> to save a
                  recipient on this vendor
                  {channel === "WHATSAPP"
                    ? " (include a WhatsApp number)."
                    : " (include an email)."}
                </div>
              ) : reachableContacts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-light-green/40 bg-light-green/10 px-3 py-6 text-center text-xs leading-relaxed text-mid-green">
                  {channel === "WHATSAPP"
                    ? "No WhatsApp numbers on file. Add a recipient with a phone number."
                    : "No emails on file. Add a recipient with an email address."}
                </div>
              ) : (
                <ul className="space-y-2">
                  {contacts.map((contact) => {
                    const reachable =
                      channel === "WHATSAPP"
                        ? Boolean(contact.phone)
                        : Boolean(contact.email);
                    const selected = selectedContactIds.has(contact.id);
                    return (
                      <li key={contact.id}>
                        <label
                          className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 transition ${
                            selected
                              ? "border-mid-green/40 bg-mid-green/10 shadow-[inset_0_0_0_1px_rgba(45,106,79,0.08)]"
                              : "border-light-green/25 bg-white hover:border-mid-green/25 hover:bg-light-green/10"
                          } ${!reachable ? "cursor-not-allowed opacity-55" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selected}
                            disabled={!reachable}
                            onChange={() => toggleContact(contact.id)}
                          />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-dark-primary">
                                {contact.name || "Contact"}
                              </span>
                              {contact.isPrimary ? (
                                <span className="rounded-full bg-dark-secondary/8 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mid-green">
                                  Primary
                                </span>
                              ) : null}
                            </span>
                            {contact.role ? (
                              <span className="mt-0.5 block text-[11px] text-mid-green">
                                {contact.role}
                              </span>
                            ) : null}
                            <span className="mt-1 block truncate text-xs text-dark-primary/80">
                              {channel === "WHATSAPP"
                                ? contact.phone || "No WhatsApp number"
                                : contact.email || "No email"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col border-b border-light-green/20 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-light-green/15 px-4 py-3">
              <div className="text-sm font-medium text-dark-primary">Lines</div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-dark-secondary/5 px-2 py-0.5 text-[11px] tabular-nums text-mid-green">
                  {checked.size}/{items.length || 0}
                </span>
                {items.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setChecked(
                        allLinesSelected
                          ? new Set()
                          : new Set(items.map((item) => item.lineNumber))
                      )
                    }
                    className="text-[11px] font-medium text-mid-green underline-offset-2 hover:underline"
                  >
                    {allLinesSelected ? "Clear" : "Select all"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-light-green/40 bg-light-green/10 px-3 py-6 text-center text-xs leading-relaxed text-mid-green">
                  No structured lines — the full RFQ text will go in the message.
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const matched = matchedSet.has(item.lineNumber);
                    const selected = checked.has(item.lineNumber);
                    return (
                      <li key={item.lineNumber}>
                        <label
                          className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 transition ${
                            selected
                              ? "border-mid-green/40 bg-mid-green/10"
                              : "border-light-green/25 bg-white hover:border-mid-green/25 hover:bg-light-green/10"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selected}
                            onChange={() => toggle(item.lineNumber)}
                          />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-mid-green">
                              <span className="font-medium">Line {item.lineNumber}</span>
                              <span>·</span>
                              <span>
                                qty {item.quantity} {item.unit}
                              </span>
                              {matched ? (
                                <span className="rounded-full bg-mid-green/15 px-1.5 py-0.5 text-[10px] font-medium text-dark-primary">
                                  matched
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-sm leading-snug text-dark-primary">
                              {item.description}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-[#f7faf8]/70">
            <div className="flex items-center justify-between gap-2 border-b border-light-green/15 px-4 py-3">
              <div className="text-sm font-medium text-dark-primary">
                {channel === "WHATSAPP" ? "WhatsApp draft" : "Email draft"}
              </div>
              <button
                type="button"
                disabled={draftBusy}
                onClick={reloadDraft}
                className="inline-flex items-center gap-1.5 rounded-lg border border-light-green/35 bg-white px-2.5 py-1 text-[11px] font-medium text-mid-green transition hover:bg-light-green/20 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${draftBusy ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                />
                {draftBusy ? "Updating…" : "Reload draft"}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="rounded-xl border border-light-green/30 bg-white px-3 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
                  To
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selectedRecipients.length > 0 ? (
                    selectedRecipients.map((contact) => (
                      <span
                        key={contact.id}
                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-mid-green/10 px-2.5 py-1 text-[11px] text-dark-primary"
                      >
                        <span className="truncate font-medium">
                          {contact.name ||
                            (channel === "WHATSAPP" ? contact.phone : contact.email)}
                        </span>
                        {channel === "WHATSAPP" ? (
                          contact.phone ? (
                            <span className="truncate text-mid-green">
                              {contact.phone}
                            </span>
                          ) : null
                        ) : contact.email ? (
                          <span className="truncate text-mid-green">{contact.email}</span>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-mid-green">No recipients selected</span>
                  )}
                </div>
              </div>
              {channel === "EMAIL" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-mid-green">
                    Subject
                  </span>
                  <input
                    value={subject}
                    onChange={(event) => {
                      markDraftEdited();
                      setSubject(event.target.value);
                    }}
                    className="h-10 w-full rounded-xl border border-light-green/35 bg-white px-3 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                  />
                </label>
              ) : (
                <div className="rounded-xl border border-light-green/25 bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-mid-green">
                  Subject is folded into the WhatsApp message as a bold first line.
                  {subject.trim() ? (
                    <span className="mt-1 block truncate text-dark-primary/80">
                      *{subject.trim()}*
                    </span>
                  ) : null}
                </div>
              )}
              <label className="flex min-h-[18rem] flex-1 flex-col">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-mid-green">
                  Message
                </span>
                <textarea
                  value={body}
                  onChange={(event) => {
                    markDraftEdited();
                    setBody(event.target.value);
                  }}
                  className="min-h-[18rem] flex-1 resize-none rounded-xl border border-light-green/35 bg-white px-3 py-3 font-mono text-[12px] leading-relaxed text-dark-primary outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                />
              </label>
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-light-green/25 bg-white px-5 py-3.5 sm:px-6">
          <div className="min-w-0 text-xs text-mid-green">
            {localError ? (
              <span className="text-red-700">{localError}</span>
            ) : (
              <span>
                {channel === "WHATSAPP" ? "WhatsApp" : "Email"} to{" "}
                {selectedRecipients.length} contact
                {selectedRecipients.length === 1 ? "" : "s"}
                {items.length > 0
                  ? ` · ${checked.size} line${checked.size === 1 ? "" : "s"}`
                  : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-mid-green transition hover:bg-dark-secondary/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || draftBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-mid-green px-4 py-2 text-sm font-medium text-background shadow-[0_8px_20px_rgba(45,106,79,0.25)] transition hover:bg-dark-secondary disabled:opacity-60"
            >
              {channel === "WHATSAPP" ? (
                <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {busy
                ? "Sending…"
                : channel === "WHATSAPP"
                  ? "Send WhatsApp"
                  : "Send Recore"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}

type VendorThreadMessage = {
  id: string;
  direction: string;
  createdAt: string;
  body: string;
  type: string;
};

function VendorThreadModal({
  vendorName,
  threadRef,
  status,
  messages,
  loading,
  onClose,
}: {
  vendorName: string;
  threadRef: string;
  status: string;
  messages: VendorThreadMessage[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-thread-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-dark-secondary/10 px-5 py-4">
          <div>
            <h3
              id="vendor-thread-title"
              className="text-base font-semibold text-dark-primary"
            >
              {vendorName} · email thread
            </h3>
            <p className="mt-0.5 text-xs text-mid-green">
              {threadRef ? `REF ${threadRef}` : "Negotiation / Recore thread"}
              {status ? ` · ${status}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-mid-green hover:bg-dark-secondary/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-mid-green">Loading thread…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-mid-green">No emails in this thread yet.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-lg border px-3 py-2.5 text-sm ${
                  message.direction === "OUT"
                    ? "border-mid-green/30 bg-mid-green/10"
                    : "border-dark-secondary/10 bg-dark-secondary/5"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-mid-green">
                  <span>
                    {message.direction === "OUT" ? "Sent" : "Received"}
                    {message.type ? ` · ${message.type.replace(/_/g, " ")}` : ""}
                  </span>
                  <span>
                    {format(new Date(message.createdAt), "dd MMM yyyy HH:mm")}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-dark-primary">
                  {message.body.length > 4000
                    ? `${message.body.slice(0, 4000)}…`
                    : message.body}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function rowPrices(
  amazon: MarketplaceListing | undefined,
  flipkart: MarketplaceListing | undefined,
  indiamart: MarketplaceListing | undefined,
  vendor: VendorMatch | undefined
): { amazon: number | null; flipkart: number | null; indiamart: number | null; vendor: number | null; best: number | null } {
  const vendorPrice = vendor == null ? null : vendorDisplayPrice(vendor).amount;
  const prices = {
    amazon: amazon?.price ?? null,
    flipkart: flipkart?.price ?? null,
    indiamart: indiamart?.price ?? null,
    vendor: vendorPrice,
  };
  const numbered = Object.values(prices).filter((p): p is number => p != null);
  return { ...prices, best: numbered.length ? Math.min(...numbered) : null };
}

function MarketplaceComparisonGrid({
  marketplace,
  vendorMatches,
}: {
  marketplace: MarketplaceComparison;
  vendorMatches: VendorMatch[];
}) {
  const amazon = marketplace.amazon ?? [];
  const flipkart = marketplace.flipkart ?? [];
  const indiamart = marketplace.indiamart ?? [];
  const rows = Array.from({ length: MARKETPLACE_ROW_COUNT }, (_, index) => index);
  const hasAny =
    amazon.length > 0 || flipkart.length > 0 || indiamart.length > 0 || vendorMatches.length > 0;

  return (
    <div className="space-y-2">
      {(marketplace.catalogPrice != null || marketplace.budget != null) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {marketplace.catalogPrice != null ? (
            <span className="rounded-md bg-dark-secondary/5 px-2 py-1">
              Catalog:{" "}
              <span className="font-semibold tabular-nums text-dark-primary">
                <Money value={marketplace.catalogPrice} />
              </span>
              {marketplace.catalogProductName ? (
                <span className="text-mid-green"> · {marketplace.catalogProductName}</span>
              ) : null}
            </span>
          ) : null}
          {marketplace.budget != null ? (
            <span className="rounded-md bg-dark-secondary/5 px-2 py-1">
              Budget:{" "}
              <span className="font-semibold tabular-nums text-dark-primary">
                <Money value={marketplace.budget} />
              </span>
            </span>
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-dark-secondary/5 text-xs uppercase tracking-wide text-mid-green">
            <tr>
              <th className="w-10 px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Amazon</th>
              <th className="px-2 py-2 font-medium">Flipkart</th>
              <th className="px-2 py-2 font-medium">IndiaMART</th>
              <th className="px-2 py-2 font-medium">Vendors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((index) => {
              const prices = rowPrices(
                amazon[index],
                flipkart[index],
                indiamart[index],
                vendorMatches[index]
              );
              const best = prices.best;

              return (
                <tr
                  key={index}
                  className={index % 2 === 1 ? "bg-light-green/10" : undefined}
                >
                  <td className="px-2 py-1.5 align-top text-xs font-medium text-mid-green">
                    {index + 1}
                  </td>
                  <td className="px-1 py-1 align-top">
                    <MarketplaceListingCell
                      listing={amazon[index]}
                      marketplace={marketplace}
                      best={best != null && prices.amazon === best}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <MarketplaceListingCell
                      listing={flipkart[index]}
                      marketplace={marketplace}
                      best={best != null && prices.flipkart === best}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <MarketplaceListingCell
                      listing={indiamart[index]}
                      marketplace={marketplace}
                      best={best != null && prices.indiamart === best}
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <VendorListingCell
                      match={vendorMatches[index]}
                      marketplace={marketplace}
                      best={best != null && prices.vendor === best}
                    />
                  </td>
                </tr>
              );
            })}

            {!hasAny ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-mid-green">
                  No marketplace or vendor listings found for this query.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rfq, setRfq] = useState<RfqDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [itemMatches, setItemMatches] = useState<RequirementMatch[]>([]);
  const [requirements, setRequirements] = useState<RfqRequirementItem[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [lineSelection, setLineSelection] = useState<Record<number, string>>({});
  const [lineVendorSelection, setLineVendorSelection] = useState<
    Record<number, string>
  >({});
  const [extraMatchesByLine, setExtraMatchesByLine] = useState<Record<number, ProductMatch[]>>({});
  const { inventoryMap } = useInventoryMap();
  const [vendorMatches, setVendorMatches] = useState<VendorMatch[]>([]);
  const [vendorProductKey, setVendorProductKey] = useState("");
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorSearchResults, setVendorSearchResults] = useState<
    VendorDirectoryRow[]
  >([]);
  const [vendorSearchBusy, setVendorSearchBusy] = useState(false);
  const manualVendorIdsRef = useRef<Set<string>>(new Set());
  const [recoreBusy, setRecoreBusy] = useState("");
  const [recoreVendor, setRecoreVendor] = useState<VendorMatch | null>(null);
  const [checkRepliesBusy, setCheckRepliesBusy] = useState(false);
  const [checkRepliesMsg, setCheckRepliesMsg] = useState("");
  const [priceDetailVendor, setPriceDetailVendor] = useState<VendorMatch | null>(
    null
  );
  const [negotiateVendor, setNegotiateVendor] = useState<VendorMatch | null>(null);
  const [negotiateBusy, setNegotiateBusy] = useState(false);
  const [threadVendor, setThreadVendor] = useState<VendorMatch | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadData, setThreadData] = useState<{
    vendorName: string;
    threadRef: string;
    status: string;
    messages: VendorThreadMessage[];
  } | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceComparison | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [marketplaceFetched, setMarketplaceFetched] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [aiParseDetailsOpen, setAiParseDetailsOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [linkedQuotesOpen, setLinkedQuotesOpen] = useState(false);
  const [rawMessageOpen, setRawMessageOpen] = useState(false);
  const [requestedProductsOpen, setRequestedProductsOpen] = useState(false);
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(false);
  const [expandedSearchLine, setExpandedSearchLine] = useState<number | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<{
    lineNumber?: number;
    requirement: CatalogRequirementInput;
  } | null>(null);
  const selectionsHydrated = useRef(false);
  const skipNextSave = useRef(true);

  const applySavedSelections = useCallback((
    saved: ProductSelections | null | undefined,
    list: ProductMatch[],
    perItem: RequirementMatch[]
  ) => {
    const hasSaved =
      Boolean(saved) &&
      ((saved!.selectedIds?.length ?? 0) > 0 ||
        Object.keys(saved!.lineSelection || {}).length > 0 ||
        Object.keys(saved!.lineVendorSelection || {}).length > 0 ||
        (saved!.extras?.length ?? 0) > 0);
    if (!hasSaved) {
      const auto = new Set<string>();
      const autoLines: Record<number, string> = {};
      if (perItem.length > 0) {
        for (const item of perItem) {
          const top = item.matches[0];
          if (top && top.score >= 10) {
            auto.add(top.product.id);
            autoLines[item.lineNumber] = top.product.id;
          }
        }
      } else if (list[0] && list[0].score >= 10) {
        auto.add(list[0].product.id);
      }
      setSelected(auto);
      setLineSelection(autoLines);
      setLineVendorSelection({});
      setExtraMatchesByLine({});
      return;
    }

    const lineSel: Record<number, string> = {};
    for (const [k, v] of Object.entries(saved!.lineSelection || {})) {
      const n = Number(k);
      if (Number.isFinite(n) && v) lineSel[n] = v;
    }

    const vendorSel: Record<number, string> = {};
    for (const [k, v] of Object.entries(saved!.lineVendorSelection || {})) {
      const n = Number(k);
      if (Number.isFinite(n) && v) vendorSel[n] = v;
    }

    const extrasByLine: Record<number, ProductMatch[]> = {};
    const pickedMatches: ProductMatch[] = [];
    for (const extra of saved!.extras || []) {
      const match: ProductMatch = {
        score: 0,
        matchedTokens: ["saved"],
        product: {
          id: extra.product.id,
          code: extra.product.code,
          name: extra.product.name,
          description: extra.product.description || "",
          unit: extra.product.unit || "pcs",
          offerPrice: extra.product.offerPrice,
          lastPrice: extra.product.lastPrice ?? extra.product.offerPrice,
          taxRate: extra.product.taxRate ?? 18,
        },
      };
      if (extra.lineNumber != null) {
        const arr = extrasByLine[extra.lineNumber] ?? [];
        if (!arr.some((m) => m.product.id === match.product.id)) {
          arr.push(match);
          extrasByLine[extra.lineNumber] = arr;
        }
      } else {
        pickedMatches.push(match);
      }
    }

    if (pickedMatches.length > 0) {
      setMatches((prev) => {
        const seen = new Set(prev.map((m) => m.product.id));
        const merged = [...prev];
        for (const m of pickedMatches) {
          if (!seen.has(m.product.id)) {
            seen.add(m.product.id);
            merged.push(m);
          }
        }
        return merged;
      });
    }

    setExtraMatchesByLine(extrasByLine);
    setLineSelection(lineSel);
    setLineVendorSelection(vendorSel);
    setSelected(
      new Set(
        perItem.length > 0
          ? Object.values(lineSel)
          : saved!.selectedIds?.length
            ? saved!.selectedIds
            : Object.values(lineSel)
      )
    );
  }, []);

  const loadMatches = useCallback(async (saved?: ProductSelections | null) => {
    setMatchesLoading(true);
    selectionsHydrated.current = false;
    skipNextSave.current = true;
    try {
      const res = await fetch(`/api/rfqs/${id}/matches`);
      const data = await parseApiJson<{
        keywords?: string[];
        matches?: ProductMatch[];
        itemMatches?: RequirementMatch[];
        requirements?: RfqRequirementItem[];
        error?: string;
      }>(res, "Could not match catalog products");
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not match catalog products"
        );
        return;
      }
      setKeywords(data.keywords || []);
      const list: ProductMatch[] = data.matches || [];
      const perItem: RequirementMatch[] = data.itemMatches || [];
      const reqs: RfqRequirementItem[] = data.requirements || [];
      setMatches(list);
      setItemMatches(perItem);
      setRequirements(reqs);
      applySavedSelections(saved, list, perItem);
      setExpandedSearchLine(null);
      selectionsHydrated.current = true;
    } catch (err) {
      setError(userFacingFetchError(err, "Could not match catalog products"));
    } finally {
      setMatchesLoading(false);
    }
  }, [id, applySavedSelections]);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    if (!soft) setLoading(true);
    try {
      const res = await fetch(`/api/rfqs/${id}`);
      if (!res.ok) {
        setError("RFQ not found");
        return;
      }
      setRfq(await res.json());
    } finally {
      if (!soft) setLoading(false);
    }
  }, [id]);

  const loadVendorMatches = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    if (!soft) setVendorsLoading(true);
    try {
      const response = await fetch(`/api/rfqs/${id}/vendors`);
      const data = await parseApiJson<{
        matches?: VendorMatch[];
        productKey?: string;
      }>(response, "Could not match vendors");
      if (response.ok) {
        const incoming = data.matches || [];
        setVendorProductKey(data.productKey || "");
        setVendorMatches((prev) => {
          const ids = new Set(incoming.map((match) => match.vendor.id));
          const keptManual = prev.filter(
            (match) =>
              manualVendorIdsRef.current.has(match.vendor.id) &&
              !ids.has(match.vendor.id)
          );
          return [...incoming, ...keptManual];
        });
      }
    } catch {
      // Catalog search still works if vendor matching is unavailable.
    } finally {
      if (!soft) setVendorsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!addVendorOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setVendorSearchBusy(true);
      try {
        const params = new URLSearchParams({ active: "true" });
        if (vendorSearch.trim()) params.set("q", vendorSearch.trim());
        const res = await fetch(`/api/vendors?${params}`);
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        setVendorSearchResults(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setVendorSearchResults([]);
      } finally {
        if (!cancelled) setVendorSearchBusy(false);
      }
    }, vendorSearch.trim() ? 220 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addVendorOpen, vendorSearch]);

  function intakeVendorFromDirectory(vendor: VendorDirectoryRow) {
    if (vendorMatches.some((match) => match.vendor.id === vendor.id)) {
      setAddVendorOpen(false);
      setVendorSearch("");
      return;
    }
    const lines =
      (requirements.length > 0
        ? requirements
        : rfq
          ? extractRfqItems(rfq.parsedSpecs, rfq.rawText)
          : []
      ).map((item) => ({
        lineNumber: item.lineNumber,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
      }));
    const match = vendorDirectoryToMatch(vendor, {
      productKey: vendorProductKey || "manual",
      lines,
    });
    manualVendorIdsRef.current.add(vendor.id);
    setVendorMatches((prev) => [...prev, match]);
    setAddVendorOpen(false);
    setVendorSearch("");
    setVendorSearchResults([]);
    setError("");
  }

  const loadMarketplacePrices = useCallback(
    async (refresh = false) => {
      setMarketplaceLoading(true);
      setMarketplaceError("");
      const url = refresh
        ? `/api/rfqs/${id}/marketplace-prices?refresh=true`
        : `/api/rfqs/${id}/marketplace-prices`;
      const res = await fetch(url);
      const data = await res.json();
      setMarketplaceLoading(false);
      setMarketplaceFetched(true);
      if (!res.ok) {
        setMarketplaceError(data.error || "Could not fetch marketplace prices");
        return;
      }
      setMarketplace(data);
    },
    [id]
  );

  // Parallel boot: RFQ + catalog matches + vendors open together (no waterfall).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function boot() {
      setLoading(true);
      setMatchesLoading(true);
      setVendorsLoading(true);
      setError("");
      setMarketplace(null);
      setMarketplaceFetched(false);
      setMarketplaceError("");
      selectionsHydrated.current = false;
      skipNextSave.current = true;

      try {
        const [rfqRes, matchesRes, vendorsRes] = await Promise.all([
          fetch(`/api/rfqs/${id}`, { signal: controller.signal }),
          fetch(`/api/rfqs/${id}/matches`, { signal: controller.signal }),
          fetch(`/api/rfqs/${id}/vendors`, { signal: controller.signal }),
        ]);
        if (cancelled) return;

        if (!rfqRes.ok) {
          setError("RFQ not found");
          setRfq(null);
          setLoading(false);
          setMatchesLoading(false);
          setVendorsLoading(false);
          return;
        }

        const rfqData = (await rfqRes.json()) as RfqDetail;
        if (cancelled) return;
        setRfq(rfqData);
        setLoading(false);

        try {
          const matchData = await parseApiJson<{
            keywords?: string[];
            matches?: ProductMatch[];
            itemMatches?: RequirementMatch[];
            requirements?: RfqRequirementItem[];
            error?: string;
          }>(matchesRes, "Could not match catalog products");
          if (cancelled) return;
          if (matchesRes.ok) {
            const list: ProductMatch[] = matchData.matches || [];
            const perItem: RequirementMatch[] = matchData.itemMatches || [];
            const reqs: RfqRequirementItem[] = matchData.requirements || [];
            setKeywords(matchData.keywords || []);
            setMatches(list);
            setItemMatches(perItem);
            setRequirements(reqs);
            applySavedSelections(rfqData.productSelections, list, perItem);
            setExpandedSearchLine(null);
            selectionsHydrated.current = true;
          } else {
            setError(
              typeof matchData.error === "string"
                ? matchData.error
                : "Could not match catalog products"
            );
          }
        } catch (err) {
          if (!cancelled) {
            setError(userFacingFetchError(err, "Could not match catalog products"));
          }
        } finally {
          if (!cancelled) setMatchesLoading(false);
        }

        try {
          const vendorData = await parseApiJson<{
            matches?: VendorMatch[];
            productKey?: string;
          }>(vendorsRes, "Could not match vendors");
          if (cancelled) return;
          if (vendorsRes.ok) {
            setVendorMatches(vendorData.matches || []);
            setVendorProductKey(vendorData.productKey || "");
          }
        } catch {
          // Catalog search still works if vendor matching is unavailable.
        } finally {
          if (!cancelled) setVendorsLoading(false);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setError(userFacingFetchError(err, "Could not open RFQ"));
        setLoading(false);
        setMatchesLoading(false);
        setVendorsLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, applySavedSelections]);

  useEffect(() => {
    if (!selectionsHydrated.current || !id) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const lineSelectionPayload: Record<string, string> = {};
    for (const [line, productId] of Object.entries(lineSelection)) {
      lineSelectionPayload[String(line)] = productId;
    }

    const lineVendorPayload: Record<string, string> = {};
    for (const [line, vendorId] of Object.entries(lineVendorSelection)) {
      lineVendorPayload[String(line)] = vendorId;
    }

    const extras: NonNullable<ProductSelections["extras"]> = [];
    for (const [lineStr, matchesForLine] of Object.entries(extraMatchesByLine)) {
      const lineNumber = Number(lineStr);
      for (const m of matchesForLine) {
        extras.push({ lineNumber, product: m.product });
      }
    }
    for (const m of matches) {
      if (m.matchedTokens.includes("picked") || m.matchedTokens.includes("saved")) {
        const already = extras.some((e) => e.product.id === m.product.id && e.lineNumber == null);
        const inLine = extras.some((e) => e.product.id === m.product.id);
        if (!already && !inLine) {
          extras.push({ product: m.product });
        }
      }
    }

    const payload: ProductSelections = {
      lineSelection: lineSelectionPayload,
      lineVendorSelection: lineVendorPayload,
      selectedIds: [...selected],
      extras,
    };

    const timeout = setTimeout(() => {
      void fetch(`/api/rfqs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSelections: payload }),
      }).then(async (res) => {
        if (!res.ok) return;
        const updated = await res.json();
        setRfq((prev) =>
          prev
            ? { ...prev, productSelections: updated.productSelections ?? payload }
            : prev
        );
      });
    }, 450);

    return () => clearTimeout(timeout);
  }, [id, selected, lineSelection, lineVendorSelection, extraMatchesByLine, matches]);

  useEffect(() => {
    if (
      rfq?.parsedCategory &&
      !marketplaceFetched &&
      !marketplaceLoading &&
      !rfq.parseError
    ) {
      const timeout = setTimeout(() => void loadMarketplacePrices(), 0);
      return () => clearTimeout(timeout);
    }
  }, [
    rfq?.parsedCategory,
    rfq?.parseError,
    marketplaceFetched,
    marketplaceLoading,
    loadMarketplacePrices,
  ]);

  async function reparse() {
    setBusy("parse");
    setError("");
    try {
      const res = await fetch(`/api/rfqs/${id}/parse`, { method: "POST" });
      const data = await parseApiJson<Partial<RfqDetail> & { error?: string }>(
        res,
        "Parse failed"
      );
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Parse failed");
        return;
      }
      setRfq((prev) => ({
        ...prev!,
        ...data,
        productSelections: prev?.productSelections ?? data.productSelections ?? null,
        messages: data.messages ?? prev?.messages ?? [],
        quotes: data.quotes ?? prev?.quotes ?? [],
      }));
      await Promise.all([
        loadMatches(data.productSelections ?? rfq?.productSelections),
        loadVendorMatches(),
      ]);
      setMarketplaceFetched(false);
      setMarketplace(null);
      void loadMarketplacePrices();
    } catch (err) {
      setError(userFacingFetchError(err, "Parse failed"));
    } finally {
      setBusy("");
    }
  }

  async function convertToQuote() {
    setBusy("quote");
    setError("");

    const lines: Array<{
      productId: string;
      qty: number;
      unitPrice?: number;
      costPrice?: number;
      costVendorName?: string;
      aliasName?: string;
      unit?: string;
    }> = [];
    const used = new Set<string>();

    if (itemMatches.length > 0) {
      for (const item of itemMatches) {
        const lineNum = item.lineNumber;
        const selectedPid = lineSelection[lineNum];
        const allLineMatches = [
          ...item.matches,
          ...(extraMatchesByLine[lineNum] || []),
        ];
        const picked = selectedPid
          ? allLineMatches.find((m) => m.product.id === selectedPid)
          : undefined;

        if (selectedPid) {
          const vendorIdSelected = lineVendorSelection[lineNum];
          const vendorMatch = vendorIdSelected
            ? vendorMatches.find((m) => m.vendor.id === vendorIdSelected)
            : undefined;
          const vendorPriceOptions = vendorsWithPriceForLine(vendorMatches, lineNum);
          const vendorLineCost =
            (vendorMatch ? vendorUnitCostForLine(vendorMatch, lineNum) : null) ??
            [...vendorPriceOptions].sort((a, b) => a.unitPrice - b.unitPrice)[0];
          const last = picked?.product.lastPrice;
          const offer = picked?.product.offerPrice;
          const catalogPrice =
            last != null && last > 0 ? last : offer != null && offer > 0 ? offer : undefined;
          const unitPrice = catalogPrice ?? vendorLineCost?.unitPrice;
          lines.push({
            productId: selectedPid,
            qty: item.requirement.quantity > 0 ? item.requirement.quantity : 1,
            aliasName: item.requirement.description,
            unit: item.requirement.unit,
            ...(unitPrice != null && unitPrice > 0 ? { unitPrice } : {}),
            ...(vendorLineCost
              ? {
                  costPrice: vendorLineCost.unitPrice,
                  costVendorName: vendorLineCost.vendorName,
                }
              : {}),
          });
          used.add(selectedPid);
        }
      }
    } else {
      for (const pid of selected) {
        if (used.has(pid)) continue;
        lines.push({
          productId: pid,
          qty: 1,
        });
      }
    }

    const res = await fetch(`/api/rfqs/${id}/convert-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        lines.length > 0
          ? { lines }
          : { productIds: [...selected] }
      ),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Could not create quote");
      return;
    }
    router.push(`/quotes/${data.id}`);
  }

  async function setStatus(status: string) {
    const res = await fetch(`/api/rfqs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setRfq(await res.json());
  }

  function applyProductPrice(productId: string, price: number) {
    const patch = (m: ProductMatch): ProductMatch =>
      m.product.id === productId
        ? {
            ...m,
            product: { ...m.product, offerPrice: price, lastPrice: price },
          }
        : m;
    setItemMatches((prev) =>
      prev.map((item) => ({ ...item, matches: item.matches.map(patch) }))
    );
    setMatches((prev) => prev.map(patch));
    setExtraMatchesByLine((prev) => {
      const next: Record<number, ProductMatch[]> = {};
      for (const [key, list] of Object.entries(prev)) {
        next[Number(key)] = list.map(patch);
      }
      return next;
    });
  }

  function selectedProductForLine(lineNumber: number) {
    const productId = lineSelection[lineNumber];
    if (!productId) return undefined;
    const item = itemMatches.find((im) => im.lineNumber === lineNumber);
    const match = [
      ...(item?.matches || []),
      ...(extraMatchesByLine[lineNumber] || []),
    ].find((m) => m.product.id === productId);
    if (!match) return undefined;
    const last = match.product.lastPrice;
    const offer = match.product.offerPrice;
    return {
      id: match.product.id,
      name: match.product.name,
      offerPrice: last != null && last > 0 ? last : offer,
    };
  }

  function selectVendorCosts(match: VendorMatch) {
    const lineNumbers = vendorPricedLineNumbers(match);
    if (lineNumbers.length === 0) return;
    setLineVendorSelection((prev) => {
      const alreadySelected = lineNumbers.every((line) => prev[line] === match.vendor.id);
      if (alreadySelected) {
        const next = { ...prev };
        for (const line of lineNumbers) {
          if (next[line] === match.vendor.id) delete next[line];
        }
        return next;
      }
      const next = { ...prev };
      for (const line of lineNumbers) next[line] = match.vendor.id;
      return next;
    });
  }

  function toggleProduct(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function selectProductForLine(lineNumber: number | undefined, product: PickableProduct) {
    const match: ProductMatch = {
      score: 0,
      matchedTokens: ["picked"],
      product,
    };

    if (lineNumber != null) {
      setExtraMatchesByLine((prev) => {
        const existing = prev[lineNumber] ?? [];
        if (existing.some((m) => m.product.id === product.id)) return prev;
        return { ...prev, [lineNumber]: [...existing, match] };
      });
      setLineSelection((prev) => {
        const oldPid = prev[lineNumber];
        setSelected((s) => {
          const next = new Set(s);
          if (oldPid) next.delete(oldPid);
          next.add(product.id);
          return next;
        });
        return { ...prev, [lineNumber]: product.id };
      });
      return;
    }

    setMatches((prev) => {
      if (prev.some((m) => m.product.id === product.id)) return prev;
      return [...prev, match];
    });
    setSelected((prev) => new Set(prev).add(product.id));
  }

  function toggleProductForLine(lineNumber: number, productId: string) {
    setLineSelection((prev) => {
      const current = prev[lineNumber];
      if (current === productId) {
        setSelected((s) => {
          const next = new Set(s);
          next.delete(productId);
          return next;
        });
        const rest = { ...prev };
        delete rest[lineNumber];
        return rest;
      }
      setSelected((s) => {
        const next = new Set(s);
        if (current) next.delete(current);
        next.add(productId);
        return next;
      });
      return { ...prev, [lineNumber]: productId };
    });
  }

  function isLineProductSelected(lineNumber: number, productId: string) {
    return lineSelection[lineNumber] === productId;
  }

  function lineMatches(item: RequirementMatch): ProductMatch[] {
    const extras = extraMatchesByLine[item.lineNumber] || [];
    const seen = new Set<string>();
    return [...item.matches, ...extras].filter((m) => {
      if (seen.has(m.product.id)) return false;
      seen.add(m.product.id);
      return true;
    });
  }

  function pickCatalogProduct(product: PickableProduct) {
    if (itemMatches.length === 1) {
      selectProductForLine(itemMatches[0].lineNumber, product);
      return;
    }
    if (itemMatches.length > 1) {
      const unassigned = itemMatches.find((im) => !lineSelection[im.lineNumber]);
      selectProductForLine(unassigned?.lineNumber ?? itemMatches[0].lineNumber, product);
      return;
    }
    selectProductForLine(undefined, product);
  }

  function openCatalogDraft(input: {
    lineNumber?: number;
    requirement?: CatalogRequirementInput | null;
    query?: string;
  }) {
    const query = input.query?.trim() || "";
    const requirement = input.requirement;
    setCatalogDraft({
      lineNumber: input.lineNumber,
      requirement: {
        description: query || requirement?.description || "New product",
        unit: requirement?.unit,
        brand: requirement?.brand,
        model: requirement?.model,
        code: requirement?.code,
        extraNotes: requirement?.extraNotes,
        category: requirement?.category,
      },
    });
  }

  async function sendRecore(
    vendorId: string,
    productKey: string,
    input: {
      channel: RecoreChannel;
      lineNumbers: number[];
      contactIds: string[];
      subject: string;
      body: string;
    }
  ) {
    setRecoreBusy(vendorId);
    setError("");
    const res = await fetch(`/api/rfqs/${id}/vendors/${vendorId}/recore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
        contactIds: input.contactIds,
        ...(input.lineNumbers.length > 0 ? { lineNumbers: input.lineNumbers } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setRecoreBusy("");
    if (!res.ok) {
      const message =
        typeof data.error === "string"
          ? data.error
          : input.channel === "WHATSAPP"
            ? "Could not send WhatsApp Recore"
            : "Could not send Recore email";
      throw new Error(message);
    }
    clearRecoreDraft(id, vendorId);
    setRecoreVendor(null);
    // Soft refresh — keep page mounted; only refresh vendor outreach state.
    await Promise.all([load({ soft: true }), loadVendorMatches({ soft: true })]);
  }

  async function checkVendorReplies() {
    setCheckRepliesBusy(true);
    setCheckRepliesMsg("Checking Outlook for vendor replies…");
    setError("");
    try {
      const res = await fetch(`/api/rfqs/${id}/vendors/check-replies`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckRepliesMsg("");
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not check vendor replies"
        );
        return;
      }
      const priced = (data.results || []).filter(
        (r: { quotedPrice: number | null }) => r.quotedPrice != null
      ).length;
      const reparseUpdated = data.reparseUpdated ?? 0;
      setCheckRepliesMsg(
        `Outlook: scanned ${data.scanned ?? 0}, matched ${data.matched ?? 0}, new ${data.newReplies ?? 0}, priced ${priced}` +
          (reparseUpdated > 0 ? ` · AI re-parsed ${reparseUpdated}` : "")
      );
      // Soft vendor-only refresh — do not remount the RFQ page.
      await loadVendorMatches({ soft: true });
      if ((data.newReplies ?? 0) > 0 || priced > 0 || reparseUpdated > 0) {
        void load({ soft: true });
      }
    } finally {
      setCheckRepliesBusy(false);
    }
  }

  async function sendNegotiation(payload: NegotiateSendPayload) {
    if (!negotiateVendor) return;
    const vendorId = negotiateVendor.vendor.id;
    setNegotiateBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/rfqs/${id}/vendors/${vendorId}/negotiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const flat = data.error?.fieldErrors;
        const fieldMsg =
          flat && typeof flat === "object"
            ? Object.values(flat as Record<string, string[]>)
                .flat()
                .filter(Boolean)[0]
            : null;
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : fieldMsg ||
              data.error?.formErrors?.[0] ||
              "Could not send negotiation"
        );
      }
      const noteForUi =
        payload.mode === "ai"
          ? payload.plainNote
          : payload.plainNote || payload.subject;
      // Optimistic local update so the list updates without a full reload.
      setVendorMatches((prev) =>
        prev.map((match) => {
          if (match.vendor.id !== vendorId) return match;
          const outreach = match.outreach;
          return {
            ...match,
            outreach: outreach
              ? {
                  ...outreach,
                  status:
                    typeof data.status === "string" ? data.status : "NEGOTIATING",
                  negotiatedAt:
                    typeof data.negotiatedAt === "string"
                      ? data.negotiatedAt
                      : outreach.negotiatedAt || new Date().toISOString(),
                  negotiationNote: noteForUi,
                }
              : outreach,
          };
        })
      );
      setNegotiateVendor(null);
      void loadVendorMatches({ soft: true });
      void load({ soft: true });
    } finally {
      setNegotiateBusy(false);
    }
  }

  async function openVendorThread(match: VendorMatch) {
    setThreadVendor(match);
    setThreadLoading(true);
    setThreadData(null);
    const res = await fetch(
      `/api/rfqs/${id}/vendors/${match.vendor.id}/thread`
    );
    const data = await res.json();
    setThreadLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not load email thread");
      setThreadVendor(null);
      return;
    }
    setThreadData({
      vendorName: data.vendorName || match.vendor.name,
      threadRef: data.threadRef || "",
      status: data.status || "",
      messages: Array.isArray(data.messages) ? data.messages : [],
    });
  }

  if (loading) {
    return (
      <div className="w-full space-y-5 animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-dark-secondary/10" />
            <div className="h-7 w-56 rounded-lg bg-dark-secondary/10" />
            <div className="h-3 w-40 rounded bg-dark-secondary/10" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded-full bg-dark-secondary/10" />
            <div className="h-9 w-28 rounded-full bg-dark-secondary/10" />
            <div className="h-9 w-36 rounded-full bg-mid-green/20" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-28 rounded-2xl border border-light-green/20 bg-white/50"
            />
          ))}
        </div>
        <div className="h-64 rounded-2xl border border-light-green/20 bg-white/50" />
      </div>
    );
  }
  if (!rfq) {
    return (
      <div className="rounded-2xl border border-light-green/25 bg-white/55 px-6 py-12 text-center shadow-[0_8px_30px_rgba(11,43,38,0.05)]">
        <p className="text-sm font-medium text-dark-primary">
          {error || "RFQ not found"}
        </p>
        <Link
          href="/inbox"
          className="mt-4 inline-flex h-9 items-center rounded-full bg-mid-green px-3.5 text-sm font-medium text-background hover:bg-dark-secondary"
        >
          Back to inbox
        </Link>
      </div>
    );
  }

  const meta =
    (rfq.parsedSpecs?._meta as { summary?: string; language?: string; itemCount?: number } | undefined) ||
    {};
  const specsForDisplay = { ...(rfq.parsedSpecs || {}) };
  delete specsForDisplay._meta;
  delete specsForDisplay.items;
  const parsedRequirements =
    requirements.length > 0
      ? requirements
      : extractRfqItems(rfq.parsedSpecs, rfq.rawText);
  const quoteCostByLine = parsedRequirements.map((req) => {
    const vendorId = lineVendorSelection[req.lineNumber];
    const match = vendorId
      ? vendorMatches.find((row) => row.vendor.id === vendorId)
      : undefined;
    const cost = match ? vendorUnitCostForLine(match, req.lineNumber) : null;
    const qty = req.quantity > 0 ? req.quantity : 1;
    return {
      lineNumber: req.lineNumber,
      description: req.description,
      qty,
      unit: req.unit,
      cost,
      lineTotal: cost ? cost.unitPrice * qty : null,
    };
  });
  const pricedCostLines = quoteCostByLine.filter((line) => line.lineTotal != null);
  const quoteCostTotal =
    pricedCostLines.length > 0
      ? pricedCostLines.reduce((sum, line) => sum + (line.lineTotal || 0), 0)
      : null;
  const linesMappedCount = Object.keys(lineSelection).length;
  const quoteProductCount =
    itemMatches.length > 0 ? linesMappedCount : selected.size;

  return (
    <div className="w-full space-y-4">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-light-green/20 bg-background/95 px-3 py-2 backdrop-blur-md">
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-dark-primary">
          {rfq.customerCompany || rfq.customerName || "RFQ"}
        </h1>
        <StatusBadge status={rfq.status} />
        <span className="hidden text-xs text-mid-green sm:inline">
          {format(new Date(rfq.createdAt), "dd MMM HH:mm")}
          {" · "}
          {rfq.channel.replaceAll("_", " ")}
          {rfq.parsedCategory ? ` · ${rfq.parsedCategory}` : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setThreadOpen(true)}
            className="inline-flex h-8 items-center rounded-full bg-dark-secondary/[0.05] px-2.5 text-xs font-medium text-mid-green transition hover:bg-light-green/20"
          >
            Thread
            {(rfq.messages ?? []).length > 0 ? (
              <span className="ml-1 tabular-nums text-mid-green/80">
                {(rfq.messages ?? []).length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setLinkedQuotesOpen(true)}
            className="inline-flex h-8 items-center rounded-full bg-dark-secondary/[0.05] px-2.5 text-xs font-medium text-mid-green transition hover:bg-light-green/20"
          >
            Quotes
            {(rfq.quotes ?? []).length > 0 ? (
              <span className="ml-1 tabular-nums text-mid-green/80">
                {(rfq.quotes ?? []).length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={reparse}
            disabled={!!busy}
            className="inline-flex h-8 items-center rounded-full bg-dark-secondary/[0.05] px-2.5 text-xs font-medium text-mid-green transition hover:bg-light-green/20 disabled:opacity-60"
          >
            {busy === "parse" ? "Parsing…" : "Re-parse"}
          </button>
          <button
            type="button"
            onClick={convertToQuote}
            disabled={!!busy}
            className="inline-flex h-8 items-center rounded-full bg-mid-green px-3 text-xs font-medium text-background transition hover:bg-dark-secondary disabled:opacity-60"
          >
            {busy === "quote"
              ? "Creating…"
              : quoteProductCount > 0
                ? `Quote (${quoteProductCount})`
                : "Generate quote"}
          </button>
          <button
            type="button"
            onClick={() => setSummaryPanelOpen((open) => !open)}
            aria-expanded={summaryPanelOpen}
            className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition ${
              summaryPanelOpen
                ? "bg-mid-green/15 text-dark-primary"
                : "bg-dark-secondary/[0.05] text-mid-green hover:bg-light-green/20"
            }`}
          >
            {summaryPanelOpen ? "Hide options" : "More options"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                summaryPanelOpen ? "rotate-180" : ""
              }`}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-dark-primary/10 bg-dark-primary/5 px-3 py-2 text-sm text-dark-primary">
          {error}
        </p>
      ) : null}
      {rfq.parseError ? (
        <p className="rounded-xl bg-dark-primary/5 px-3 py-2 text-sm">
          Parse error: {rfq.parseError}
        </p>
      ) : null}

      {summaryPanelOpen ? (
      <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-light-green/25 bg-white/60 p-4 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
                Customer
              </h2>
              <p className="mt-1.5 truncate text-sm font-semibold text-dark-primary">
                {rfq.customerCompany || rfq.customerName || "—"}
              </p>
              <p className="mt-1 truncate text-xs text-mid-green">
                {[rfq.customerName, rfq.customerEmail].filter(Boolean).join(" · ") ||
                  "No contact details"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCustomerDetailsOpen(true)}
              className="shrink-0 rounded-full bg-dark-secondary/[0.05] px-2.5 py-1 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
            >
              Details
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-light-green/25 bg-white/60 p-4 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
                AI parse
              </h2>
              <p className="mt-1.5 text-sm font-semibold text-dark-primary">
                {rfq.parsedCategory || "Not parsed yet"}
                {rfq.parseConfidence != null ? (
                  <span className="ml-2 text-xs font-normal text-mid-green">
                    {Math.round(rfq.parseConfidence * 100)}%
                  </span>
                ) : null}
              </p>
              {meta.summary ? (
                <p className="mt-1 line-clamp-1 text-xs text-mid-green">{meta.summary}</p>
              ) : (
                <p className="mt-1 text-xs text-mid-green">
                  {Object.keys(specsForDisplay).length > 0
                    ? `${Object.keys(specsForDisplay).length} specs extracted`
                    : "No summary yet"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAiParseDetailsOpen(true)}
              className="shrink-0 rounded-full bg-dark-secondary/[0.05] px-2.5 py-1 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
            >
              Details
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-light-green/25 bg-white/60 p-4 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
                Requested products
              </h2>
              <p className="mt-1.5 text-sm font-semibold text-dark-primary">
                {parsedRequirements.length > 0
                  ? `${parsedRequirements.length} line${parsedRequirements.length === 1 ? "" : "s"}`
                  : "None yet"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-mid-green">
                {parsedRequirements.length > 0
                  ? parsedRequirements
                      .slice(0, 2)
                      .map((req) => req.description)
                      .join(" · ")
                  : "Parse the RFQ to extract line items"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRequestedProductsOpen(true)}
              disabled={parsedRequirements.length === 0}
              className="shrink-0 rounded-full bg-dark-secondary/[0.05] px-2.5 py-1 text-[11px] font-medium text-mid-green hover:bg-light-green/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Details
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-light-green/25 bg-white/60 p-4 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
                Matches
              </h2>
              <p className="mt-1.5 text-sm font-semibold text-dark-primary">
                {matchesLoading || vendorsLoading ? (
                  <span className="font-medium text-mid-green">Loading…</span>
                ) : (
                  <>
                    {matches.length} product{matches.length === 1 ? "" : "s"}
                    {" · "}
                    {vendorMatches.length} vendor
                    {vendorMatches.length === 1 ? "" : "s"}
                  </>
                )}
              </p>
              <p className="mt-1 truncate text-xs text-mid-green">
                {quoteProductCount > 0
                  ? itemMatches.length > 0
                    ? `${quoteProductCount}/${itemMatches.length} lines mapped to catalog`
                    : `${quoteProductCount} product${quoteProductCount === 1 ? "" : "s"} for quote`
                  : keywords.length > 0
                    ? `${keywords.length} keywords`
                    : "Select products to generate quote"}
              </p>
              <p className="mt-2 truncate text-xs text-dark-primary/80">
                {rfq.subject || rfq.rawText || "No raw message"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRawMessageOpen(true)}
              className="shrink-0 rounded-full bg-dark-secondary/[0.05] px-2.5 py-1 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
            >
              Message
            </button>
          </div>
        </div>
      </div>
      ) : null}

      <div className="grid w-full gap-4 lg:grid-cols-2">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-light-green/25 bg-white/60 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex items-center gap-2 border-b border-light-green/20 px-3 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight text-dark-primary">
              Products
            </h2>
            {itemMatches.length > 0 ? (
              <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px] font-medium tabular-nums text-mid-green">
                {linesMappedCount}/{itemMatches.length} lines
              </span>
            ) : matches.length > 0 ? (
              <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px] font-medium tabular-nums text-mid-green">
                {selected.size}/{matches.length} for quote
              </span>
            ) : (
              <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px] font-medium text-mid-green">
                0
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadMatches(rfq.productSelections)}
              className="ml-auto rounded-full p-1.5 text-mid-green hover:bg-light-green/20"
              aria-label="Refresh suggested products"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="border-b border-light-green/15 px-3 py-2">
            <RfqProductSearch
              inventoryMap={inventoryMap}
              onSelect={pickCatalogProduct}
              placeholder="Search catalog…"
              label="Search catalog"
              onAddMissing={(query) => {
                const unmatched = itemMatches.find((im) => lineMatches(im).length === 0);
                const fallback = unmatched || itemMatches[0];
                openCatalogDraft({
                  lineNumber: fallback?.lineNumber,
                  requirement: fallback?.requirement,
                  query,
                });
              }}
            />
          </div>

          <div className="max-h-[34rem] overflow-y-auto">
            {matchesLoading ? (
              <p className="px-3 py-8 text-center text-sm text-mid-green">Matching catalog…</p>
            ) : itemMatches.length > 0 ? (
              <ul className="divide-y divide-light-green/15">
                {itemMatches.map((item) => {
                  const combinedMatches = lineMatches(item);
                  const visible = combinedMatches.slice(0, 4);
                  return (
                    <li key={item.lineNumber} className="px-3 py-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
                            Line {item.lineNumber} · {item.requirement.quantity}{" "}
                            {item.requirement.unit}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-medium text-dark-primary">
                            {item.requirement.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              openCatalogDraft({
                                lineNumber: item.lineNumber,
                                requirement: item.requirement,
                              })
                            }
                            className="rounded-full px-2 py-1 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
                          >
                            <Plus className="mr-0.5 inline h-3 w-3" strokeWidth={1.75} />
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSearchLine((current) =>
                                current === item.lineNumber ? null : item.lineNumber
                              )
                            }
                            className="rounded-full px-2 py-1 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
                          >
                            {expandedSearchLine === item.lineNumber ? "Close" : "Change"}
                          </button>
                        </div>
                      </div>
                      {expandedSearchLine === item.lineNumber ? (
                        <div className="mb-2 rounded-xl bg-light-green/10 p-2">
                          <RfqProductSearch
                            autoFocus
                            requiredQty={item.requirement.quantity}
                            inventoryMap={inventoryMap}
                            placeholder="Search by name or code…"
                            label="Search catalog"
                            onClose={() => setExpandedSearchLine(null)}
                            onSelect={(product) => {
                              selectProductForLine(item.lineNumber, product);
                              setExpandedSearchLine(null);
                            }}
                            onAddMissing={(query) =>
                              openCatalogDraft({
                                lineNumber: item.lineNumber,
                                requirement: item.requirement,
                                query,
                              })
                            }
                          />
                        </div>
                      ) : null}
                      {combinedMatches.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-light-green/40 px-3 py-4 text-center">
                          <p className="text-xs text-mid-green">No catalog match</p>
                          <button
                            type="button"
                            onClick={() =>
                              openCatalogDraft({
                                lineNumber: item.lineNumber,
                                requirement: item.requirement,
                              })
                            }
                            className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-mid-green px-3 text-xs font-medium text-background hover:bg-dark-secondary"
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.75} />
                            Add to catalog
                          </button>
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {visible.map((m) => {
                            const chosen = isLineProductSelected(
                              item.lineNumber,
                              m.product.id
                            );
                            return (
                              <li key={m.product.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleProductForLine(item.lineNumber, m.product.id)
                                  }
                                  className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                                    chosen
                                      ? "bg-mid-green/15 ring-1 ring-mid-green/30"
                                      : "hover:bg-light-green/15"
                                  }`}
                                >
                                  <span
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                      chosen
                                        ? "border-mid-green bg-mid-green text-background"
                                        : "border-light-green/50"
                                    }`}
                                  >
                                    {chosen ? (
                                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                    ) : null}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-dark-primary">
                                      {m.product.code} — {m.product.name}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-mid-green">
                                      {m.score > 0 ? <span>Score {m.score}</span> : null}
                                      <ProductStockCell
                                        productId={m.product.id}
                                        unit={m.product.unit}
                                        inventoryMap={inventoryMap}
                                        requiredQty={item.requirement.quantity}
                                      />
                                    </span>
                                  </span>
                                  <span
                                    className="shrink-0"
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    <ProductLastPriceInput
                                      productId={m.product.id}
                                      value={m.product.lastPrice ?? m.product.offerPrice}
                                      onSaved={(price) =>
                                        applyProductPrice(m.product.id, price)
                                      }
                                    />
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                          {combinedMatches.length > visible.length ? (
                            <li className="px-2.5 pt-1 text-[11px] text-mid-green">
                              +{combinedMatches.length - visible.length} more — use Change to
                              search
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : matches.length === 0 ? (
              <div className="space-y-2 px-3 py-4">
                <p className="text-center text-sm text-mid-green">
                  {keywords.length === 0
                    ? "Parse the RFQ, then search the catalog."
                    : "No catalog matches yet."}
                </p>
                {parsedRequirements.map((req) => (
                  <div
                    key={req.lineNumber}
                    className="flex items-center justify-between gap-2 rounded-xl bg-light-green/10 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-dark-primary">
                        {req.description}
                      </p>
                      <p className="text-[11px] text-mid-green">
                        Line {req.lineNumber} · {req.quantity} {req.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openCatalogDraft({
                          lineNumber: req.lineNumber,
                          requirement: req,
                        })
                      }
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-mid-green px-3 text-xs font-medium text-background hover:bg-dark-secondary"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.75} />
                      Add
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-light-green/15">
                {matches.map((m) => {
                  const chosen = selected.has(m.product.id);
                  return (
                    <li key={m.product.id}>
                      <button
                        type="button"
                        onClick={() => toggleProduct(m.product.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                          chosen ? "bg-mid-green/15" : "hover:bg-light-green/15"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            chosen
                              ? "border-mid-green bg-mid-green text-background"
                              : "border-light-green/50"
                          }`}
                        >
                          {chosen ? (
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-dark-primary">
                            {m.product.code} — {m.product.name}
                          </span>
                          <span className="text-[11px] text-mid-green">
                            {m.score > 0 ? `Score ${m.score}` : "Match"}
                          </span>
                        </span>
                        <span
                          className="shrink-0"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ProductLastPriceInput
                            productId={m.product.id}
                            value={m.product.lastPrice ?? m.product.offerPrice}
                            onSaved={(price) => applyProductPrice(m.product.id, price)}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-light-green/25 bg-white/60 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-light-green/20 px-3 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight text-dark-primary">
              Vendors
            </h2>
            <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px] font-medium tabular-nums text-mid-green">
              {vendorMatches.length}
            </span>
            {vendorProductKey ? (
              <span className="truncate text-[11px] text-mid-green">{vendorProductKey}</span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAddVendorOpen((open) => !open);
                  if (addVendorOpen) {
                    setVendorSearch("");
                    setVendorSearchResults([]);
                  }
                }}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-mid-green/15 px-2.5 text-[11px] font-medium text-dark-primary hover:bg-mid-green/25"
              >
                <Plus className="h-3 w-3" strokeWidth={1.75} />
                Add vendor
              </button>
              <button
                type="button"
                onClick={() => void checkVendorReplies()}
                disabled={checkRepliesBusy}
                className="inline-flex h-8 items-center rounded-full bg-dark-secondary/[0.05] px-2.5 text-[11px] font-medium text-mid-green hover:bg-light-green/20 disabled:opacity-60"
              >
                {checkRepliesBusy ? "Checking…" : "Check replies"}
              </button>
              <button
                type="button"
                onClick={() => void loadVendorMatches({ soft: true })}
                className="rounded-full p-1.5 text-mid-green hover:bg-light-green/20"
                aria-label="Refresh suggested vendors"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {checkRepliesMsg ? (
            <p className="border-b border-light-green/15 px-3 py-2 text-[11px] text-mid-green">
              {checkRepliesMsg}
            </p>
          ) : null}
          {addVendorOpen ? (
            <div className="border-b border-light-green/15 bg-light-green/10 px-3 py-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green/70"
                  strokeWidth={1.75}
                />
                <input
                  value={vendorSearch}
                  onChange={(event) => setVendorSearch(event.target.value)}
                  placeholder="Search vendors by name, phone, email…"
                  className="h-9 w-full rounded-xl border border-light-green/35 bg-white pl-8 pr-3 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                  autoFocus
                />
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-light-green/25 bg-white">
                {vendorSearchBusy ? (
                  <p className="px-3 py-4 text-center text-xs text-mid-green">
                    Searching…
                  </p>
                ) : vendorSearchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-mid-green">
                    No vendors found. Add them on the Vendors page first.
                  </p>
                ) : (
                  <ul className="divide-y divide-light-green/15">
                    {vendorSearchResults.map((vendor) => {
                      const already = vendorMatches.some(
                        (match) => match.vendor.id === vendor.id
                      );
                      return (
                        <li key={vendor.id}>
                          <button
                            type="button"
                            disabled={already}
                            onClick={() => intakeVendorFromDirectory(vendor)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-light-green/15 disabled:cursor-default disabled:opacity-55"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-dark-primary">
                                {vendor.name}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-mid-green">
                                {vendor.categories?.[0]?.category || "Vendor"}
                                {" · "}
                                {vendor.email ||
                                  vendor.whatsappId ||
                                  vendor.phone ||
                                  "No contact"}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-mid-green">
                              {already ? "Added" : "Add"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <div className="max-h-[34rem] overflow-y-auto">
            {vendorsLoading ? (
              <p className="px-3 py-8 text-center text-sm text-mid-green">Matching vendors…</p>
            ) : vendorMatches.length === 0 ? (
              <div className="space-y-3 px-3 py-8 text-center">
                <p className="text-sm text-mid-green">
                  No vendors matched this RFQ automatically.
                </p>
                <button
                  type="button"
                  onClick={() => setAddVendorOpen(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-mid-green px-3 text-xs font-medium text-background hover:bg-dark-secondary"
                >
                  <Plus className="h-3 w-3" strokeWidth={1.75} />
                  Pick from vendor list
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-light-green/15">
                {vendorMatches.map((match) => {
                  const pricedLines = vendorPricedLineNumbers(match);
                  const costTotal = vendorCostTotal(match);
                  const usingCosts =
                    pricedLines.length > 0 &&
                    pricedLines.every(
                      (lineNumber) => lineVendorSelection[lineNumber] === match.vendor.id
                    );
                  const canNegotiate =
                    Boolean(match.vendor.email) &&
                    costTotal != null &&
                    match.outreach?.status !== "DECLINED";
                  const declined = match.outreach?.status === "DECLINED";
                  const negotiating = match.outreach?.status === "NEGOTIATING";
                  const hasEmail =
                    (match.vendor.contacts || []).some((contact) => contact.email) ||
                    Boolean(match.vendor.email);
                  const hasWhatsApp =
                    (match.vendor.contacts || []).some((contact) => contact.phone) ||
                    Boolean(match.vendor.phone) ||
                    Boolean(match.vendor.whatsappId);
                  const canRecore = hasEmail || hasWhatsApp;
                  const isManual = manualVendorIdsRef.current.has(match.vendor.id);
                  return (
                    <li
                      key={match.vendor.id}
                      className={`px-3 py-3 ${usingCosts ? "bg-mid-green/10" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-dark-primary">
                              {match.vendor.name}
                            </p>
                            {isManual ? (
                              <span className="rounded-full bg-dark-secondary/8 px-1.5 py-0.5 text-[10px] font-medium text-mid-green">
                                Added
                              </span>
                            ) : null}
                            {declined ? (
                              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                                Declined
                              </span>
                            ) : negotiating ? (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                                Negotiating
                              </span>
                            ) : usingCosts ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-mid-green/20 px-1.5 py-0.5 text-[10px] font-medium text-dark-primary">
                                <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                                On quote
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-mid-green">
                            {match.category}
                            {pricedLines.length > 0
                              ? ` · lines ${pricedLines.join(", ")}`
                              : ""}
                            {" · "}
                            {match.vendor.email || match.vendor.phone || "No contact"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            pricedLines.length > 0
                              ? setPriceDetailVendor(match)
                              : undefined
                          }
                          disabled={pricedLines.length === 0}
                          className="shrink-0 text-right disabled:opacity-50"
                          title="View cost by product"
                        >
                          <span className="block text-sm font-semibold tabular-nums text-dark-primary">
                            {costTotal != null ? <Money value={costTotal} /> : "—"}
                          </span>
                          <span className="text-[10px] text-mid-green">
                            {pricedLines.length > 0 ? "View costs" : "No cost"}
                          </span>
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={pricedLines.length === 0}
                          onClick={() => selectVendorCosts(match)}
                          className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium disabled:opacity-50 ${
                            usingCosts
                              ? "bg-mid-green text-background"
                              : "bg-dark-secondary/[0.05] text-mid-green hover:bg-light-green/20"
                          }`}
                        >
                          {usingCosts ? (
                            <>
                              <Check className="h-3 w-3" strokeWidth={2.5} />
                              Using
                            </>
                          ) : (
                            "Use costs"
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!canRecore || recoreBusy === match.vendor.id}
                          onClick={(event) => {
                            event.currentTarget.blur();
                            setRecoreVendor(match);
                          }}
                          className="inline-flex h-7 items-center rounded-full bg-mid-green/15 px-2.5 text-[11px] font-medium text-dark-primary hover:bg-mid-green/25 disabled:opacity-50"
                        >
                          {recoreBusy === match.vendor.id ? "Sending…" : "Recore"}
                        </button>
                        {match.outreach ? (
                          <button
                            type="button"
                            onClick={() => void openVendorThread(match)}
                            className="inline-flex h-7 items-center rounded-full bg-dark-secondary/[0.05] px-2.5 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
                          >
                            Thread
                          </button>
                        ) : null}
                        {canNegotiate ? (
                          <button
                            type="button"
                            onClick={() => setNegotiateVendor(match)}
                            className="inline-flex h-7 items-center rounded-full bg-dark-secondary/[0.05] px-2.5 text-[11px] font-medium text-mid-green hover:bg-light-green/20"
                          >
                            Negotiate
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {quoteCostTotal != null ? (
            <div className="border-t border-light-green/20 bg-mid-green/10 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
                  Quote cost
                </p>
                <p className="text-sm font-semibold tabular-nums text-dark-primary">
                  <Money value={quoteCostTotal} />
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {priceDetailVendor ? (
        <VendorPriceDetailModal
          match={priceDetailVendor}
          selectedByLine={Object.fromEntries(
            (priceDetailVendor.matchedLines || priceDetailVendor.outreach?.quotedLineItems || []).map(
              (line) => [line.lineNumber, selectedProductForLine(line.lineNumber)]
            )
          )}
          onClose={() => setPriceDetailVendor(null)}
          onProductPriceSaved={applyProductPrice}
        />
      ) : null}
      {recoreVendor ? (
        <VendorRecoreLinePickerModal
          match={recoreVendor}
          rfqId={id}
          items={
            requirements.length > 0
              ? requirements
              : extractRfqItems(rfq.parsedSpecs, rfq.rawText)
          }
          busy={recoreBusy === recoreVendor.vendor.id}
          onClose={() => setRecoreVendor(null)}
          onSend={async (payload) => {
            try {
              await sendRecore(
                recoreVendor.vendor.id,
                recoreVendor.productKey,
                payload
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not send Recore email"
              );
              throw e;
            }
          }}
        />
      ) : null}
      {negotiateVendor ? (
        <VendorNegotiateModal
          match={negotiateVendor}
          busy={negotiateBusy}
          onClose={() => setNegotiateVendor(null)}
          onSend={sendNegotiation}
        />
      ) : null}
      {threadVendor ? (
        <VendorThreadModal
          vendorName={threadData?.vendorName || threadVendor.vendor.name}
          threadRef={threadData?.threadRef || threadVendor.outreach?.threadRef || ""}
          status={threadData?.status || threadVendor.outreach?.status || ""}
          messages={threadData?.messages || []}
          loading={threadLoading}
          onClose={() => {
            setThreadVendor(null);
            setThreadData(null);
          }}
        />
      ) : null}

      <section className="w-full rounded-xl bg-white/50 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-mid-green">Marketplace prices</h2>
            <p className="mt-1 text-xs text-mid-green">
              Compare Amazon, Flipkart, IndiaMART, and vendors — lowest price marked Best.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMarketplacePrices(true)}
            disabled={marketplaceLoading || !rfq.parsedCategory}
            className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-1.5 text-xs hover:bg-light-green/20 disabled:opacity-60"
          >
            {marketplaceLoading ? "Fetching…" : "Refresh prices"}
          </button>
        </div>

        {!rfq.parsedCategory ? (
          <p className="mt-3 text-sm text-mid-green">
            Parse the RFQ first to search Amazon, Flipkart, and IndiaMART.
          </p>
        ) : marketplaceLoading && !marketplace ? (
          <p className="mt-3 text-sm text-mid-green">Searching marketplaces…</p>
        ) : marketplaceError ? (
          <p className="mt-3 text-sm text-dark-primary">{marketplaceError}</p>
        ) : marketplace ? (
          <div className="mt-4 space-y-3">
            {marketplace.needsFetch ? (
              <p className="text-sm text-mid-green">
                No saved marketplace prices yet. Click Refresh prices to fetch from Amazon,
                Flipkart, and IndiaMART (saved until you re-parse or refresh again).
              </p>
            ) : null}
            {marketplace.needsFetch ? null : (
              <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-mid-green">
              <span>
                Search: <span className="font-medium text-dark-primary">{marketplace.query}</span>
              </span>
              {marketplace.cached ? (
                <span className="rounded bg-light-green/25 px-1.5 py-0.5">Saved</span>
              ) : null}
              {marketplace.fetchedAt !== new Date(0).toISOString() ? (
                <span>
                  Fetched {format(new Date(marketplace.fetchedAt), "dd MMM yyyy HH:mm")}
                </span>
              ) : null}
            </div>

            {marketplace.errors && marketplace.errors.length > 0 ? (
              <ul className="space-y-1 text-xs text-dark-primary">
                {marketplace.errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            ) : null}

            <MarketplaceComparisonGrid
              marketplace={marketplace}
              vendorMatches={vendorMatches.slice(0, MARKETPLACE_ROW_COUNT)}
            />
              </>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-mid-green">
            Click Refresh prices to search Amazon, Flipkart, and IndiaMART.
          </p>
        )}
      </section>

      {customerDetailsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-details-title"
          onClick={() => setCustomerDetailsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="customer-details-title" className="text-lg font-semibold">
                Customer details
              </h2>
              <button type="button" onClick={() => setCustomerDetailsOpen(false)}>
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-mid-green">Name</dt>
                <dd>{rfq.customerName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-mid-green">Company</dt>
                <dd>{rfq.customerCompany || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-mid-green">Email</dt>
                <dd>{rfq.customerEmail || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-mid-green">Phone</dt>
                <dd>{rfq.customerPhone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-mid-green">Status</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={rfq.status} />
                  <select
                    value={rfq.status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded border border-light-green/40 bg-background px-2 py-1 text-xs"
                  >
                    {["NEW", "NEEDS_REVIEW", "PARSED", "QUOTED", "CLOSED"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {requestedProductsOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-dark-primary/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="requested-products-title"
          onClick={() => setRequestedProductsOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-light-green/25 bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-light-green/20 px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="requested-products-title"
                  className="text-lg font-semibold tracking-tight text-dark-primary"
                >
                  Requested products
                </h2>
                <p className="mt-1 text-xs text-mid-green">
                  {parsedRequirements.length} line
                  {parsedRequirements.length === 1 ? "" : "s"} extracted from this RFQ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequestedProductsOpen(false)}
                className="rounded-lg p-1.5 text-mid-green hover:bg-dark-secondary/8 hover:text-dark-primary"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {parsedRequirements.length === 0 ? (
                <p className="px-1 py-8 text-center text-sm text-mid-green">
                  No requested products yet. Re-parse the RFQ to extract line items.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-light-green/20">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-dark-secondary/5 text-mid-green">
                      <tr>
                        <th className="w-12 px-3 py-2.5 font-medium">#</th>
                        <th className="px-3 py-2.5 font-medium">Product</th>
                        <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                        <th className="px-3 py-2.5 font-medium">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRequirements.map((req, i) => (
                        <tr
                          key={req.lineNumber}
                          className={i % 2 === 1 ? "bg-light-green/10" : undefined}
                        >
                          <td className="px-3 py-2.5 font-medium text-mid-green">
                            {req.lineNumber}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-dark-primary">
                              {req.description}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mid-green">
                              {req.brand ? <span>Brand: {req.brand}</span> : null}
                              {req.category ? <span>{req.category}</span> : null}
                              {req.model ? <span>Model: {req.model}</span> : null}
                              {req.code ? <span>Code: {req.code}</span> : null}
                            </div>
                            {req.extraNotes ? (
                              <p className="mt-1 text-xs text-dark-primary/70">
                                {req.extraNotes}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {req.quantity}
                          </td>
                          <td className="px-3 py-2.5">{req.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {aiParseDetailsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-parse-details-title"
          onClick={() => setAiParseDetailsOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="ai-parse-details-title" className="text-lg font-semibold">
                AI parse details
              </h2>
              <button type="button" onClick={() => setAiParseDetailsOpen(false)}>
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-mid-green">Category</p>
                <p className="font-medium">{rfq.parsedCategory || "Not parsed yet"}</p>
              </div>
              <div>
                <p className="text-xs text-mid-green">Confidence</p>
                <p className="font-medium">
                  {rfq.parseConfidence != null
                    ? `${Math.round(rfq.parseConfidence * 100)}%`
                    : "—"}
                </p>
              </div>
              {meta.language ? (
                <div>
                  <p className="text-xs text-mid-green">Language</p>
                  <p>{meta.language}</p>
                </div>
              ) : null}
              {meta.summary ? (
                <div className="sm:col-span-2">
                  <p className="text-xs text-mid-green">Summary</p>
                  <p>{meta.summary}</p>
                </div>
              ) : null}
            </div>
            {parsedRequirements.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-dark-secondary/5 text-mid-green">
                    <tr>
                      <th className="w-10 px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRequirements.map((req, i) => (
                      <tr key={req.lineNumber} className={i % 2 === 1 ? "bg-light-green/10" : undefined}>
                        <td className="px-3 py-2">{req.lineNumber}</td>
                        <td className="px-3 py-2">{req.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{req.quantity}</td>
                        <td className="px-3 py-2">{req.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {Object.keys(specsForDisplay).length > 0 ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-background/80 p-3 text-xs">
                {JSON.stringify(specsForDisplay, null, 2)}
              </pre>
            ) : parsedRequirements.length === 0 ? (
              <p className="mt-4 text-sm text-mid-green">No extracted specs yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {threadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thread-title"
          onClick={() => setThreadOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="thread-title" className="text-lg font-semibold">
                Thread
                {(rfq.messages ?? []).length > 0 ? (
                  <span className="ml-2 text-sm font-normal text-mid-green">
                    ({(rfq.messages ?? []).length} message
                    {(rfq.messages ?? []).length === 1 ? "" : "s"})
                  </span>
                ) : null}
              </h2>
              <button type="button" onClick={() => setThreadOpen(false)}>
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {(rfq.messages ?? []).length === 0 ? (
                <li className="text-sm text-mid-green">No messages yet.</li>
              ) : (
                (rfq.messages ?? []).map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      m.direction === "IN" ? "bg-light-green/15" : "bg-mid-green/10"
                    }`}
                  >
                    <div className="mb-1 flex justify-between text-xs text-mid-green">
                      <span>
                        {m.direction} · {m.channel.replace("_", " ")}
                      </span>
                      <span>{format(new Date(m.createdAt), "dd MMM HH:mm")}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {linkedQuotesOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="linked-quotes-title"
          onClick={() => setLinkedQuotesOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="linked-quotes-title" className="text-lg font-semibold">
                Linked quotes
              </h2>
              <button type="button" onClick={() => setLinkedQuotesOpen(false)}>
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            {(rfq.quotes ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-mid-green">No linked quotes yet.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {(rfq.quotes ?? []).map((q) => (
                  <li
                    key={q.id}
                    className="flex items-center justify-between rounded-lg bg-light-green/10 px-3 py-2"
                  >
                    <Link
                      href={`/quotes/${q.id}`}
                      className="font-medium text-mid-green hover:underline"
                      onClick={() => setLinkedQuotesOpen(false)}
                    >
                      {q.quoteNumber}
                    </Link>
                    <StatusBadge status={q.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {rawMessageOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="raw-message-title"
          onClick={() => setRawMessageOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="raw-message-title" className="text-lg font-semibold">
                Raw message
              </h2>
              <button type="button" onClick={() => setRawMessageOpen(false)}>
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            {rfq.subject ? (
              <p className="mt-4 text-sm font-medium">{rfq.subject}</p>
            ) : null}
            <pre className="mt-3 whitespace-pre-wrap text-sm text-dark-primary">
              {rfq.rawText || "No message content."}
            </pre>
          </div>
        </div>
      ) : null}

      {catalogDraft ? (
        <AddCatalogProductDialog
          requirement={catalogDraft.requirement}
          onClose={() => setCatalogDraft(null)}
          onCreated={(product) => {
            selectProductForLine(catalogDraft.lineNumber, product);
            setCatalogDraft(null);
            setExpandedSearchLine(null);
          }}
        />
      ) : null}
    </div>
  );
}
