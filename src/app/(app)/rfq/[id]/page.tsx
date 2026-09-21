"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, RefreshCw, X } from "lucide-react";
import { StatusBadge, Money } from "@/components/ui";
import {
  ProductStockCell,
  RfqProductSearch,
  useInventoryMap,
  type PickableProduct,
} from "@/components/rfq-product-picker";
import { extractRfqItems } from "@/lib/rfq-items";

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

type VendorMatch = {
  vendor: {
    id: string;
    name: string;
    phone: string;
    email: string;
    whatsappId: string;
    preferredChannel: "EMAIL" | "WHATSAPP";
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

/** Vendors that have a usable unit price for a given RFQ line number. */
function vendorsWithPriceForLine(
  vendorMatches: VendorMatch[],
  lineNumber: number
): Array<{ vendorId: string; vendorName: string; unitPrice: number }> {
  const options: Array<{ vendorId: string; vendorName: string; unitPrice: number }> = [];
  for (const match of vendorMatches) {
    if (!match.outreach || match.outreach.status === "DECLINED") continue;
    const quotedLines = match.outreach.quotedLineItems || [];
    const line = quotedLines.find((l) => l.lineNumber === lineNumber);
    if (line != null && Number.isFinite(line.unitPrice) && line.unitPrice > 0) {
      options.push({
        vendorId: match.vendor.id,
        vendorName: match.vendor.name,
        unitPrice: line.unitPrice,
      });
      continue;
    }
    if (
      quotedLines.length === 0 &&
      match.outreach.quotedPrice != null &&
      Number.isFinite(match.outreach.quotedPrice) &&
      match.outreach.quotedPrice > 0
    ) {
      const requested = match.outreach.requestedLineNumbers;
      const singleRequested =
        requested != null &&
        requested.length === 1 &&
        requested[0] === lineNumber;
      const singleMatch =
        (requested == null || requested.length === 0) &&
        (match.matchedLines?.length ?? 0) <= 1;
      if (singleRequested || singleMatch) {
        options.push({
          vendorId: match.vendor.id,
          vendorName: match.vendor.name,
          unitPrice: match.outreach.quotedPrice,
        });
      }
    }
  }
  return options;
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
  onClose,
}: {
  match: VendorMatch;
  onClose: () => void;
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
                  <th className="px-3 py-2 text-right font-medium">Unit</th>
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
                    colSpan={4}
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

function VendorNegotiateModal({
  match,
  busy,
  onClose,
  onSend,
}: {
  match: VendorMatch;
  busy: boolean;
  onClose: () => void;
  onSend: (plainNote: string) => Promise<void>;
}) {
  const display = vendorDisplayPrice(match);
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  async function submit() {
    setLocalError("");
    if (note.trim().length < 3) {
      setLocalError("Write a short note in your own words.");
      return;
    }
    try {
      await onSend(note.trim());
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not send");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="negotiate-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="negotiate-title"
              className="text-base font-semibold text-dark-primary"
            >
              Negotiate with {match.vendor.name}
            </h3>
            <p className="mt-0.5 text-xs text-mid-green">
              Write casually — AI will polish and send on the same email thread.
              {display.amount != null ? (
                <>
                  {" "}
                  Current sum: <Money value={display.amount} />
                </>
              ) : null}
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

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder="e.g. price too high, ask 10% less on monitors and UPS, need best rate this week"
          className="mt-4 w-full rounded-lg border border-light-green/40 bg-white/80 px-3 py-2 text-sm outline-none focus:border-mid-green"
        />
        {localError ? (
          <p className="mt-2 text-xs text-dark-primary">{localError}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs text-mid-green hover:bg-dark-secondary/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-lg bg-mid-green px-3 py-1.5 text-xs font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            {busy ? "Sending…" : "Format & send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VendorRecoreLinePickerModal({
  match,
  items,
  busy,
  onClose,
  onSend,
}: {
  match: VendorMatch;
  items: RfqRequirementItem[];
  busy: boolean;
  onClose: () => void;
  onSend: (lineNumbers: number[]) => Promise<void>;
}) {
  const matchedSet = new Set(
    (match.matchedLines || []).map((line) => line.lineNumber)
  );
  const defaultChecked =
    items.length === 0
      ? []
      : items
          .filter((item) => matchedSet.size === 0 || matchedSet.has(item.lineNumber))
          .map((item) => item.lineNumber);
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(defaultChecked.length > 0 ? defaultChecked : items.map((i) => i.lineNumber))
  );
  const [localError, setLocalError] = useState("");

  function toggle(lineNumber: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  async function submit() {
    setLocalError("");
    const lineNumbers = [...checked].sort((a, b) => a - b);
    if (items.length > 0 && lineNumbers.length === 0) {
      setLocalError("Select at least one line to request from this vendor.");
      return;
    }
    try {
      await onSend(lineNumbers);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not send");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recore-lines-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="recore-lines-title"
              className="text-base font-semibold text-dark-primary"
            >
              Recore — {match.vendor.name}
            </h3>
            <p className="mt-0.5 text-xs text-mid-green">
              Choose which RFQ lines to request. Matched lines are checked by default —
              uncheck anything you already stock or sell yourself.
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

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-mid-green">
            No structured line items — the full RFQ text will be emailed.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => {
              const matched = matchedSet.has(item.lineNumber);
              return (
                <li key={item.lineNumber}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-dark-secondary/10 px-3 py-2 hover:bg-light-green/10">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked.has(item.lineNumber)}
                      onChange={() => toggle(item.lineNumber)}
                    />
                    <span className="min-w-0">
                      <span className="text-xs font-medium text-mid-green">
                        Line {item.lineNumber}
                        {matched ? " · matched" : ""}
                        {" · "}
                        qty {item.quantity} {item.unit}
                      </span>
                      <span className="mt-0.5 block text-sm text-dark-primary">
                        {item.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {localError ? (
          <p className="mt-2 text-xs text-dark-primary">{localError}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs text-mid-green hover:bg-dark-secondary/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-lg bg-mid-green px-3 py-1.5 text-xs font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send Recore"}
          </button>
        </div>
      </div>
    </div>
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
  const [expandedSearchLine, setExpandedSearchLine] = useState<number | null>(null);
  const selectionsHydrated = useRef(false);
  const skipNextSave = useRef(true);

  function hasSavedSelections(saved: ProductSelections | null | undefined): boolean {
    if (!saved) return false;
    return (
      (saved.selectedIds?.length ?? 0) > 0 ||
      Object.keys(saved.lineSelection || {}).length > 0 ||
      Object.keys(saved.lineVendorSelection || {}).length > 0 ||
      (saved.extras?.length ?? 0) > 0
    );
  }

  function applySavedSelections(
    saved: ProductSelections | null | undefined,
    list: ProductMatch[],
    perItem: RequirementMatch[]
  ) {
    if (!hasSavedSelections(saved)) {
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
    setSelected(new Set(saved!.selectedIds?.length ? saved!.selectedIds : Object.values(lineSel)));
  }

  const loadMatches = useCallback(async (saved?: ProductSelections | null) => {
    setMatchesLoading(true);
    selectionsHydrated.current = false;
    skipNextSave.current = true;
    const res = await fetch(`/api/rfqs/${id}/matches`);
    if (res.ok) {
      const data = await res.json();
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
    }
    setMatchesLoading(false);
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/rfqs/${id}`);
    if (!res.ok) {
      setError("RFQ not found");
      setLoading(false);
      return;
    }
    setRfq(await res.json());
    setLoading(false);
  }, [id]);

  const loadVendorMatches = useCallback(async () => {
    setVendorsLoading(true);
    const response = await fetch(`/api/rfqs/${id}/vendors`);
    if (response.ok) {
      const data = await response.json();
      setVendorMatches(data.matches || []);
      setVendorProductKey(data.productKey || "");
    }
    setVendorsLoading(false);
  }, [id]);

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

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (!rfq) return;
    const timeout = setTimeout(() => {
      void loadMatches(rfq.productSelections);
      void loadVendorMatches();
    }, 0);
    return () => clearTimeout(timeout);
    // Only re-fetch when the RFQ identity changes — not when selections are saved back onto rfq.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq?.id, loadMatches, loadVendorMatches]);

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
    const res = await fetch(`/api/rfqs/${id}/parse`, { method: "POST" });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Parse failed");
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
  }

  async function convertToQuote() {
    setBusy("quote");
    setError("");

    const lines: Array<{ productId: string; qty: number; unitPrice?: number }> = [];
    const used = new Set<string>();

    function vendorUnitPriceForLine(lineNum: number): number | undefined {
      const vendorId = lineVendorSelection[lineNum];
      if (!vendorId) return undefined;
      const match = vendorMatches.find((m) => m.vendor.id === vendorId);
      if (!match?.outreach) return undefined;
      const quotedLines = match.outreach.quotedLineItems || [];
      const line = quotedLines.find((l) => l.lineNumber === lineNum);
      if (line != null && Number.isFinite(line.unitPrice)) {
        return line.unitPrice;
      }
      if (
        quotedLines.length === 0 &&
        match.outreach.quotedPrice != null &&
        Number.isFinite(match.outreach.quotedPrice)
      ) {
        const requested = match.outreach.requestedLineNumbers;
        const singleRequested =
          requested != null &&
          requested.length === 1 &&
          requested[0] === lineNum;
        const singleMatch =
          (requested == null || requested.length === 0) &&
          (match.matchedLines?.length ?? 0) <= 1;
        if (singleRequested || singleMatch) {
          return match.outreach.quotedPrice;
        }
      }
      return undefined;
    }

    if (itemMatches.length > 0) {
      for (const item of itemMatches) {
        const lineNum = item.lineNumber;
        const selectedPid = lineSelection[lineNum];
        const allLineMatches = [
          ...item.matches,
          ...(extraMatchesByLine[lineNum] || []),
        ];
        const picked =
          (selectedPid ? allLineMatches.find((m) => m.product.id === selectedPid) : undefined) ??
          allLineMatches.find((m) => selected.has(m.product.id));

        if (picked) {
          const unitPrice = vendorUnitPriceForLine(lineNum);
          lines.push({
            productId: picked.product.id,
            qty: item.requirement.quantity,
            ...(unitPrice != null ? { unitPrice } : {}),
          });
          used.add(picked.product.id);
        }
      }
    }

    for (const pid of selected) {
      if (used.has(pid)) continue;
      const req = requirements.find((r) =>
        itemMatches
          .find((im) => im.lineNumber === r.lineNumber)
          ?.matches.some((m) => m.product.id === pid)
      );
      const unitPrice =
        req != null ? vendorUnitPriceForLine(req.lineNumber) : undefined;
      lines.push({
        productId: pid,
        qty: req?.quantity ?? 1,
        ...(unitPrice != null ? { unitPrice } : {}),
      });
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
        const { [lineNumber]: _, ...rest } = prev;
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
    return lineSelection[lineNumber] === productId || selected.has(productId);
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

  async function sendRecore(vendorId: string, productKey: string, lineNumbers: number[]) {
    setRecoreBusy(vendorId);
    setError("");
    const res = await fetch(`/api/rfqs/${id}/vendors/${vendorId}/recore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey,
        ...(lineNumbers.length > 0 ? { lineNumbers } : {}),
      }),
    });
    const data = await res.json();
    setRecoreBusy("");
    if (!res.ok) {
      const message =
        typeof data.error === "string"
          ? data.error
          : "Could not send Recore email";
      throw new Error(message);
    }
    setRecoreVendor(null);
    await Promise.all([load(), loadVendorMatches()]);
  }

  async function checkVendorReplies() {
    setCheckRepliesBusy(true);
    setCheckRepliesMsg("Checking Gmail for vendor replies…");
    setError("");
    const res = await fetch(`/api/rfqs/${id}/vendors/check-replies`, {
      method: "POST",
    });
    const data = await res.json();
    setCheckRepliesBusy(false);
    if (!res.ok) {
      setCheckRepliesMsg("");
      setError(data.error || "Could not check vendor replies");
      return;
    }
    const priced = (data.results || []).filter(
      (r: { quotedPrice: number | null }) => r.quotedPrice != null
    ).length;
    const reparseUpdated = data.reparseUpdated ?? 0;
    setCheckRepliesMsg(
      `Gmail: scanned ${data.scanned ?? 0}, matched ${data.matched ?? 0}, new ${data.newReplies ?? 0}, priced ${priced}` +
        (reparseUpdated > 0 ? ` · AI re-parsed ${reparseUpdated}` : "")
    );
    await Promise.all([load(), loadVendorMatches()]);
  }

  async function sendNegotiation(plainNote: string) {
    if (!negotiateVendor) return;
    setNegotiateBusy(true);
    setError("");
    const res = await fetch(
      `/api/rfqs/${id}/vendors/${negotiateVendor.vendor.id}/negotiate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plainNote }),
      }
    );
    const data = await res.json();
    setNegotiateBusy(false);
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : data.error?.formErrors?.[0] || "Could not send negotiation"
      );
    }
    setNegotiateVendor(null);
    await Promise.all([load(), loadVendorMatches()]);
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
    return <p className="text-mid-green">Loading…</p>;
  }
  if (!rfq) {
    return <p className="text-dark-primary">{error || "Not found"}</p>;
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

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start gap-4 sm:gap-6">
          <Link
            href="/inbox"
            className="mt-1.5 shrink-0 text-sm text-mid-green hover:underline"
          >
            ← Inbox
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">
              {rfq.customerCompany || rfq.customerName || "RFQ"}
            </h1>
            <p className="mt-1 text-sm text-mid-green">
              {format(new Date(rfq.createdAt), "dd MMM yyyy HH:mm")} ·{" "}
              <span className="rounded bg-light-green/25 px-1.5 py-0.5 text-xs">
                {rfq.channel.replace("_", " ")}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setThreadOpen(true)}
            className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
          >
            Thread
            {(rfq.messages ?? []).length > 0 ? (
              <span className="ml-1.5 text-xs text-mid-green">
                ({(rfq.messages ?? []).length})
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setLinkedQuotesOpen(true)}
            className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
          >
            Linked quotes
            {(rfq.quotes ?? []).length > 0 ? (
              <span className="ml-1.5 text-xs text-mid-green">({(rfq.quotes ?? []).length})</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={reparse}
            disabled={!!busy}
            className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20 disabled:opacity-60"
          >
            {busy === "parse" ? "Parsing…" : "Re-parse with AI"}
          </button>
          <button
            type="button"
            onClick={convertToQuote}
            disabled={!!busy}
            className="rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            {busy === "quote"
              ? "Creating…"
              : selected.size > 0
                ? `Generate quote (${selected.size})`
                : "Generate quote"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
      {rfq.parseError ? (
        <p className="rounded-lg bg-dark-primary/5 px-3 py-2 text-sm">Parse error: {rfq.parseError}</p>
      ) : null}

      <div className="grid w-full gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-mid-green">Customer</h2>
              <p className="mt-1 truncate text-sm font-medium">
                {rfq.customerCompany || rfq.customerName || "—"}
              </p>
              <p className="mt-1 truncate text-xs text-mid-green">
                {[rfq.customerName, rfq.customerEmail].filter(Boolean).join(" · ") ||
                  "No contact details"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusBadge status={rfq.status} />
              <button
                type="button"
                onClick={() => setCustomerDetailsOpen(true)}
                className="text-xs text-mid-green hover:underline"
              >
                Details
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-mid-green">AI parse</h2>
              <p className="mt-1 text-sm font-medium">
                {rfq.parsedCategory || "Not parsed yet"}
                {rfq.parseConfidence != null ? (
                  <span className="ml-2 text-xs font-normal text-mid-green">
                    {Math.round(rfq.parseConfidence * 100)}% confidence
                  </span>
                ) : null}
              </p>
              {meta.summary ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-mid-green">{meta.summary}</p>
              ) : (
                <p className="mt-0.5 text-xs text-mid-green">
                  {parsedRequirements.length > 0
                    ? `${parsedRequirements.length} product${parsedRequirements.length === 1 ? "" : "s"} requested`
                    : Object.keys(specsForDisplay).length > 0
                      ? `${Object.keys(specsForDisplay).length} specs extracted`
                      : "No summary yet"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAiParseDetailsOpen(true)}
              className="shrink-0 text-xs text-mid-green hover:underline"
            >
              Details
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-mid-green">Matches</h2>
              <p className="mt-1 text-sm font-medium">
                {parsedRequirements.length > 0
                  ? `${parsedRequirements.length} requirement${parsedRequirements.length === 1 ? "" : "s"}`
                  : `${matches.length} product${matches.length === 1 ? "" : "s"}`}{" "}
                · {vendorMatches.length} vendor{vendorMatches.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 truncate text-xs text-mid-green">
                {selected.size > 0
                  ? `${selected.size} selected for quote`
                  : keywords.length > 0
                    ? `${keywords.length} keywords`
                    : "Select products to generate quote"}
              </p>
              <p className="mt-2 truncate text-xs text-dark-primary">
                {rfq.subject || rfq.rawText || "No raw message"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRawMessageOpen(true)}
              className="shrink-0 text-xs text-mid-green hover:underline"
            >
              Message
            </button>
          </div>
        </div>
      </div>

      {parsedRequirements.length > 0 ? (
        <section className="w-full rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <button
            type="button"
            onClick={() => setRequestedProductsOpen((open) => !open)}
            className="flex w-full items-start justify-between gap-3 text-left"
            aria-expanded={requestedProductsOpen}
          >
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-mid-green">Requested products</h2>
              <p className="mt-1 text-xs text-mid-green">
                {requestedProductsOpen
                  ? "Each line is matched to catalog products independently."
                  : `${parsedRequirements.length} product${parsedRequirements.length === 1 ? "" : "s"} · click to expand`}
              </p>
            </div>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-mid-green transition-transform ${
                requestedProductsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {requestedProductsOpen ? (
            <div className="mt-3 overflow-x-auto rounded-lg">
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
                      <td className="px-3 py-2 font-medium text-mid-green">{req.lineNumber}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{req.description}</div>
                        {req.brand ? (
                          <div className="text-xs text-mid-green">Brand: {req.brand}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{req.quantity}</td>
                      <td className="px-3 py-2">{req.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid w-full gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-mid-green">Suggested products</h2>
              <p className="mt-0.5 text-xs text-mid-green">
                {itemMatches.length > 0
                  ? "Pick a match per line, or tap Change to search the catalog"
                  : "Search the catalog to pick products"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadMatches(rfq.productSelections)}
              className="rounded-md p-1.5 text-mid-green hover:bg-light-green/20"
              aria-label="Refresh suggested products"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {itemMatches.length === 0 ? (
            <div className="mt-3">
              <RfqProductSearch
                inventoryMap={inventoryMap}
                onSelect={pickCatalogProduct}
              />
            </div>
          ) : null}

        {matchesLoading ? (
          <p className="mt-4 text-sm text-mid-green">Matching catalog…</p>
        ) : itemMatches.length > 0 ? (
          <div className="mt-4 space-y-4">
            {itemMatches.map((item) => {
              const combinedMatches = lineMatches(item);
              const vendorPriceOptions = vendorsWithPriceForLine(
                vendorMatches,
                item.lineNumber
              );
              const selectedVendorId = lineVendorSelection[item.lineNumber] || "";
              return (
              <div key={item.lineNumber} className="rounded-lg border border-light-green/30">
                <div className="flex flex-wrap items-start justify-between gap-2 bg-dark-secondary/5 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-mid-green">
                      Line {item.lineNumber} · qty {item.requirement.quantity} {item.requirement.unit}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-dark-primary">
                      {item.requirement.description}
                    </div>
                    {vendorPriceOptions.length > 0 ? (
                      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mid-green">
                        <span className="font-medium">Price from</span>
                        <select
                          value={selectedVendorId}
                          onChange={(e) => {
                            const value = e.target.value;
                            setLineVendorSelection((prev) => {
                              const next = { ...prev };
                              if (!value) delete next[item.lineNumber];
                              else next[item.lineNumber] = value;
                              return next;
                            });
                          }}
                          className="rounded-md border border-light-green/40 bg-white/80 px-2 py-1 text-xs text-dark-primary outline-none focus:border-mid-green"
                        >
                          <option value="">Catalog offer</option>
                          {vendorPriceOptions.map((opt) => (
                            <option key={opt.vendorId} value={opt.vendorId}>
                              {opt.vendorName} — ₹
                              {opt.unitPrice.toLocaleString("en-IN")}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSearchLine((current) =>
                        current === item.lineNumber ? null : item.lineNumber
                      )
                    }
                    className="shrink-0 text-xs font-medium text-mid-green underline-offset-2 hover:text-dark-primary hover:underline"
                  >
                    {expandedSearchLine === item.lineNumber ? "Close" : "Change"}
                  </button>
                </div>
                {expandedSearchLine === item.lineNumber ? (
                  <div className="border-b border-light-green/20 bg-light-green/5 px-3 py-3">
                    <RfqProductSearch
                      autoFocus
                      requiredQty={item.requirement.quantity}
                      inventoryMap={inventoryMap}
                      placeholder="Search by product name or code…"
                      label="Search catalog"
                      onClose={() => setExpandedSearchLine(null)}
                      onSelect={(product) => {
                        selectProductForLine(item.lineNumber, product);
                        setExpandedSearchLine(null);
                      }}
                    />
                  </div>
                ) : null}
                {combinedMatches.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-mid-green">
                    No catalog match — click <span className="font-medium">Change</span> to
                    search the catalog.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-mid-green">
                      <tr>
                        <th className="w-10 px-3 py-2 font-medium" />
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">Matched</th>
                        <th className="px-3 py-2 text-right font-medium">Stock</th>
                        <th className="px-3 py-2 text-right font-medium">Score</th>
                        <th className="px-3 py-2 text-right font-medium">Offer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinedMatches.map((m, i) => (
                        <tr
                          key={m.product.id}
                          className={i % 2 === 1 ? "bg-light-green/10" : undefined}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isLineProductSelected(item.lineNumber, m.product.id)}
                              onChange={() => toggleProductForLine(item.lineNumber, m.product.id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">
                              {m.product.code} — {m.product.name}
                            </div>
                            {m.product.description ? (
                              <div className="text-xs text-mid-green line-clamp-1">
                                {m.product.description}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-xs text-mid-green">
                            {m.matchedTokens.slice(0, 5).join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            <ProductStockCell
                              productId={m.product.id}
                              unit={m.product.unit}
                              inventoryMap={inventoryMap}
                              requiredQty={item.requirement.quantity}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {m.score > 0 ? m.score : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-dark-primary">
                            <Money value={m.product.offerPrice} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-mid-green">
              {keywords.length === 0
                ? "Parse the RFQ first, then search the catalog below."
                : "No catalog matches — search below or generate a blank quote."}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-dark-secondary/5 text-mid-green">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium" />
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Matched</th>
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 text-right font-medium">Offer</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr
                    key={m.product.id}
                    className={i % 2 === 1 ? "bg-light-green/10" : undefined}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(m.product.id)}
                        onChange={() => toggleProduct(m.product.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {m.product.code} — {m.product.name}
                      </div>
                      {m.product.description ? (
                        <div className="text-xs text-mid-green line-clamp-1">
                          {m.product.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-mid-green">
                      {m.matchedTokens.slice(0, 5).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <ProductStockCell
                        productId={m.product.id}
                        unit={m.product.unit}
                        inventoryMap={inventoryMap}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.score > 0 ? m.score : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-dark-primary">
                      <Money value={m.product.offerPrice} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        <section className="min-w-0 rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-mid-green">
                Suggested vendors
                {vendorProductKey ? (
                  <span className="ml-1 text-xs font-normal text-mid-green">
                    · {vendorProductKey}
                  </span>
                ) : null}
              </h2>
             
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void checkVendorReplies()}
                disabled={checkRepliesBusy}
                className="rounded-lg border border-mid-green/40 bg-mid-green/10 px-2.5 py-1 text-xs font-medium text-dark-primary hover:bg-mid-green/20 disabled:opacity-60"
              >
                {checkRepliesBusy ? "Checking…" : "Check vendor replies"}
              </button>
              <button
                type="button"
                onClick={loadVendorMatches}
                className="rounded-md p-1.5 text-mid-green hover:bg-light-green/20"
                aria-label="Refresh suggested vendors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          {checkRepliesMsg ? (
            <p className="mt-2 text-xs text-mid-green">{checkRepliesMsg}</p>
          ) : null}

        {vendorsLoading ? (
          <p className="mt-4 text-sm text-mid-green">Matching vendors…</p>
        ) : vendorMatches.length === 0 ? (
          <p className="mt-4 text-sm text-mid-green">
            No vendors match this RFQ category yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-dark-secondary/5 text-mid-green">
                <tr>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 text-right font-medium">Price / Sum</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {vendorMatches.map((match, index) => {
                  const display = vendorDisplayPrice(match);
                  const lineCount =
                    display.lines.length || match.matchedLines?.length || 0;
                  const canNegotiate =
                    Boolean(match.vendor.email) &&
                    display.amount != null &&
                    match.outreach?.status !== "DECLINED";
                  const declined = match.outreach?.status === "DECLINED";
                  const negotiating = match.outreach?.status === "NEGOTIATING";
                  return (
                  <tr
                    key={match.vendor.id}
                    className={index % 2 === 1 ? "bg-light-green/10" : undefined}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{match.vendor.name}</div>
                      <div className="text-xs text-mid-green">
                        {match.category}
                        {lineCount > 0 ? (
                          <span>
                            {" "}
                            · {lineCount} line{lineCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {match.outreach?.requestedLineNumbers &&
                      match.outreach.requestedLineNumbers.length > 0 ? (
                        <div className="mt-0.5 text-[10px] text-mid-green">
                          Requested lines{" "}
                          {match.outreach.requestedLineNumbers.join(", ")}
                        </div>
                      ) : null}
                      {declined ? (
                        <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-800">
                          Declined
                        </span>
                      ) : negotiating ? (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                          Negotiating
                        </span>
                      ) : match.outreach?.replyIntent === "COUNTER" ? (
                        <span className="mt-1 inline-block rounded bg-mid-green/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-dark-primary">
                          Updated
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-mid-green">
                      {match.vendor.preferredChannel}
                      <br />
                      {match.vendor.email || match.vendor.phone || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-dark-primary">
                      {display.amount != null || lineCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setPriceDetailVendor(match)}
                          title="View quote prices by product"
                          className="inline-flex flex-col items-end rounded-md px-1.5 py-0.5 text-right hover:bg-mid-green/15 focus:outline-none focus:ring-1 focus:ring-mid-green/40"
                        >
                          <span>
                            {display.amount != null ? (
                              <Money value={display.amount} />
                            ) : (
                              <span className="font-normal text-mid-green">
                                View lines
                              </span>
                            )}
                          </span>
                          {match.outreach?.previousQuotedPrice != null &&
                          display.amount != null &&
                          match.outreach.previousQuotedPrice !== display.amount ? (
                            <span className="text-[10px] font-normal text-mid-green line-through">
                              <Money value={match.outreach.previousQuotedPrice} />
                            </span>
                          ) : null}
                          <span className="text-[10px] font-normal text-mid-green">
                            {display.amount != null
                              ? `${display.source || "Price"}${lineCount > 1 ? " · view lines" : " · details"}`
                              : `${lineCount} product${lineCount === 1 ? "" : "s"}`}
                          </span>
                        </button>
                      ) : (
                        <span className="font-normal text-mid-green">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{match.score}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {match.outreach ? (
                          <button
                            type="button"
                            onClick={() => void openVendorThread(match)}
                            className="text-xs font-medium text-mid-green underline-offset-2 hover:text-dark-primary hover:underline"
                          >
                            Thread
                          </button>
                        ) : null}
                        {canNegotiate ? (
                          <button
                            type="button"
                            onClick={() => setNegotiateVendor(match)}
                            className="rounded-lg border border-mid-green/40 bg-white/70 px-2.5 py-1 text-xs font-medium text-dark-primary hover:bg-mid-green/15"
                          >
                            Negotiate
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={!match.vendor.email || recoreBusy === match.vendor.id}
                          title={
                            match.vendor.email
                              ? "Email vendor a revised quote request"
                              : "Add vendor email on Vendors page"
                          }
                          onClick={() => setRecoreVendor(match)}
                          className="rounded-lg border border-mid-green/40 bg-mid-green/10 px-2.5 py-1 text-xs font-medium text-dark-primary hover:bg-mid-green/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {recoreBusy === match.vendor.id ? "Sending…" : "Recore"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </section>

      {priceDetailVendor ? (
        <VendorPriceDetailModal
          match={priceDetailVendor}
          onClose={() => setPriceDetailVendor(null)}
        />
      ) : null}
      {recoreVendor ? (
        <VendorRecoreLinePickerModal
          match={recoreVendor}
          items={
            requirements.length > 0
              ? requirements
              : extractRfqItems(rfq.parsedSpecs, rfq.rawText)
          }
          busy={recoreBusy === recoreVendor.vendor.id}
          onClose={() => setRecoreVendor(null)}
          onSend={async (lineNumbers) => {
            try {
              await sendRecore(
                recoreVendor.vendor.id,
                recoreVendor.productKey,
                lineNumbers
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
      </div>

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
    </div>
  );
}
