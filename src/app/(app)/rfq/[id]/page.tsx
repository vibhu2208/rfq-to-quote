"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { StatusBadge, Money } from "@/components/ui";

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
  outreach: {
    id: string;
    status: string;
    threadRef: string;
    quotedPrice: number | null;
    sentAt: string | null;
    repliedAt: string | null;
    errorMessage: string;
  } | null;
};

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

function MarketplaceListingCell({
  listing,
  linkLabel,
  marketplace,
}: {
  listing: MarketplaceListing | undefined;
  linkLabel: string;
  marketplace: MarketplaceComparison;
}) {
  if (!listing) {
    return <span className="text-xs text-mid-green">—</span>;
  }

  return (
    <div className="space-y-1">
      <div className="line-clamp-2 text-sm font-medium">{listing.title}</div>
      {listing.supplier ? (
        <div className="text-xs text-mid-green">{listing.supplier}</div>
      ) : null}
      {listing.moq ? <div className="text-xs text-mid-green">{listing.moq}</div> : null}
      {listing.rating != null ? (
        <div className="text-xs text-mid-green">
          {listing.rating}★
          {listing.reviews != null ? ` (${listing.reviews.toLocaleString()})` : ""}
        </div>
      ) : null}
      <div className="text-sm">
        {listing.price != null ? (
          <Money value={listing.price} />
        ) : (
          <span className="text-mid-green">Price unavailable</span>
        )}
      </div>
      {listing.price != null && marketplace.budget != null ? (
        <div className="text-xs">
          vs budget: <PriceDelta value={listing.price - marketplace.budget} />
        </div>
      ) : null}
      {listing.price != null && marketplace.catalogPrice != null ? (
        <div className="text-xs">
          vs catalog: <PriceDelta value={listing.price - marketplace.catalogPrice} />
        </div>
      ) : null}
      <a
        href={listing.link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-mid-green hover:underline"
      >
        {linkLabel}
      </a>
    </div>
  );
}

function VendorListingCell({
  match,
  marketplace,
}: {
  match: VendorMatch | undefined;
  marketplace: MarketplaceComparison;
}) {
  if (!match) {
    return <span className="text-xs text-mid-green">—</span>;
  }

  const price =
    match.outreach?.status === "REPLIED" && match.outreach.quotedPrice != null
      ? match.outreach.quotedPrice
      : match.lastPrice;
  const priceSource =
    match.outreach?.status === "REPLIED" && match.outreach.quotedPrice != null
      ? "Recore reply"
      : match.lastPrice != null
        ? "Last quoted"
        : null;

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{match.vendor.name}</div>
      <div className="text-xs text-mid-green">{match.category}</div>
      <div className="text-sm">
        {price != null ? (
          <Money value={price} />
        ) : (
          <span className="text-mid-green">No price history</span>
        )}
      </div>
      {priceSource ? <div className="text-xs text-mid-green">{priceSource}</div> : null}
      {price != null && marketplace.budget != null ? (
        <div className="text-xs">
          vs budget: <PriceDelta value={price - marketplace.budget} />
        </div>
      ) : null}
      {price != null && marketplace.catalogPrice != null ? (
        <div className="text-xs">
          vs catalog: <PriceDelta value={price - marketplace.catalogPrice} />
        </div>
      ) : null}
      <div className="text-xs text-mid-green">Score {match.score}</div>
    </div>
  );
}

const MARKETPLACE_ROW_COUNT = 5;

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

  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-dark-secondary/5 text-mid-green">
          <tr>
            <th className="w-12 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Amazon</th>
            <th className="px-3 py-2 font-medium">Flipkart</th>
            <th className="px-3 py-2 font-medium">IndiaMART</th>
            <th className="px-3 py-2 font-medium">Vendors</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((index) => (
            <tr key={index} className={index % 2 === 1 ? "bg-light-green/10" : undefined}>
              <td className="px-3 py-2 align-top font-medium text-mid-green">{index + 1}</td>
              <td className="px-3 py-2 align-top">
                <MarketplaceListingCell
                  listing={amazon[index]}
                  linkLabel="View on Amazon"
                  marketplace={marketplace}
                />
              </td>
              <td className="px-3 py-2 align-top">
                <MarketplaceListingCell
                  listing={flipkart[index]}
                  linkLabel="View on Flipkart"
                  marketplace={marketplace}
                />
              </td>
              <td className="px-3 py-2 align-top">
                <MarketplaceListingCell
                  listing={indiamart[index]}
                  linkLabel="View on IndiaMART"
                  marketplace={marketplace}
                />
              </td>
              <td className="px-3 py-2 align-top">
                <VendorListingCell match={vendorMatches[index]} marketplace={marketplace} />
              </td>
            </tr>
          ))}

          {marketplace.catalogPrice != null ? (
            <tr className="bg-light-green/10">
              <td className="px-3 py-2 font-medium">Ref</td>
              <td colSpan={4} className="px-3 py-2">
                <span className="font-medium">Your catalog: </span>
                {marketplace.catalogProductName || "Top catalog match"} —{" "}
                <Money value={marketplace.catalogPrice} />
                {marketplace.budget != null ? (
                  <>
                    {" "}
                    · vs budget:{" "}
                    <PriceDelta value={marketplace.catalogPrice - marketplace.budget} />
                  </>
                ) : null}
              </td>
            </tr>
          ) : null}

          {marketplace.budget != null ? (
            <tr>
              <td className="px-3 py-2 font-medium">Ref</td>
              <td colSpan={4} className="px-3 py-2">
                <span className="font-medium">Customer budget: </span>
                <Money value={marketplace.budget} />
              </td>
            </tr>
          ) : null}

          {!amazon.length &&
          !flipkart.length &&
          !indiamart.length &&
          !vendorMatches.length ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-mid-green">
                No marketplace or vendor listings found for this query.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
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
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [vendorMatches, setVendorMatches] = useState<VendorMatch[]>([]);
  const [vendorProductKey, setVendorProductKey] = useState("");
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [recoreBusy, setRecoreBusy] = useState("");
  const [marketplace, setMarketplace] = useState<MarketplaceComparison | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [marketplaceFetched, setMarketplaceFetched] = useState(false);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    const res = await fetch(`/api/rfqs/${id}/matches`);
    if (res.ok) {
      const data = await res.json();
      setKeywords(data.keywords || []);
      const list: ProductMatch[] = data.matches || [];
      setMatches(list);
      // Auto-select top match(es) with strong scores
      const auto = new Set<string>();
      if (list[0] && list[0].score >= 4) auto.add(list[0].product.id);
      setSelected(auto);
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
    if (rfq) {
      const timeout = setTimeout(() => {
        void loadMatches();
        void loadVendorMatches();
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [rfq, loadMatches, loadVendorMatches]);

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
      messages: data.messages ?? prev?.messages ?? [],
      quotes: data.quotes ?? prev?.quotes ?? [],
    }));
    await Promise.all([loadMatches(), loadVendorMatches()]);
    setMarketplaceFetched(false);
    setMarketplace(null);
    void loadMarketplacePrices();
  }

  async function convertToQuote() {
    setBusy("quote");
    setError("");
    const productIds = [...selected];
    const res = await fetch(`/api/rfqs/${id}/convert-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds }),
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

  async function sendRecore(vendorId: string, productKey: string) {
    setRecoreBusy(vendorId);
    setError("");
    const res = await fetch(`/api/rfqs/${id}/vendors/${vendorId}/recore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKey }),
    });
    const data = await res.json();
    setRecoreBusy("");
    if (!res.ok) {
      setError(data.error || "Could not send Recore email");
      return;
    }
    await Promise.all([load(), loadVendorMatches()]);
  }

  if (loading) {
    return <p className="text-mid-green">Loading…</p>;
  }
  if (!rfq) {
    return <p className="text-dark-primary">{error || "Not found"}</p>;
  }

  const meta = (rfq.parsedSpecs?._meta as { summary?: string; language?: string } | undefined) || {};
  const specsForDisplay = { ...(rfq.parsedSpecs || {}) };
  delete specsForDisplay._meta;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/inbox" className="text-sm text-mid-green hover:underline">
            ← Inbox
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {rfq.customerCompany || rfq.customerName || "RFQ"}
          </h1>
          <p className="mt-1 text-sm text-mid-green">
            {format(new Date(rfq.createdAt), "dd MMM yyyy HH:mm")} ·{" "}
            <span className="rounded bg-light-green/25 px-1.5 py-0.5 text-xs">
              {rfq.channel.replace("_", " ")}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)] md:col-span-1">
          <h2 className="text-sm font-medium text-mid-green">Customer</h2>
          <dl className="mt-3 space-y-2 text-sm">
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

        <div className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)] md:col-span-2">
          <h2 className="text-sm font-medium text-mid-green">AI parse</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
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
            {meta.summary ? (
              <div className="sm:col-span-2">
                <p className="text-xs text-mid-green">Summary</p>
                <p>{meta.summary}</p>
              </div>
            ) : null}
            {meta.language ? (
              <div>
                <p className="text-xs text-mid-green">Language</p>
                <p>{meta.language}</p>
              </div>
            ) : null}
          </div>
          {Object.keys(specsForDisplay).length > 0 ? (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-background/80 p-3 text-xs">
              {JSON.stringify(specsForDisplay, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-mid-green">Marketplace prices</h2>
            <p className="mt-0.5 text-xs text-mid-green">
              5 results each — Amazon, Flipkart, IndiaMART, and matched vendors side by side.
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
          <p className="mt-4 text-sm text-mid-green">
            Parse the RFQ first to search Amazon, Flipkart, and IndiaMART.
          </p>
        ) : marketplaceLoading && !marketplace ? (
          <p className="mt-4 text-sm text-mid-green">Searching marketplaces…</p>
        ) : marketplaceError ? (
          <p className="mt-4 text-sm text-dark-primary">{marketplaceError}</p>
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
          <p className="mt-4 text-sm text-mid-green">
            Click Refresh prices to search Amazon, Flipkart, and IndiaMART.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-mid-green">Suggested products</h2>
            <p className="mt-0.5 text-xs text-mid-green">
              Catalog match from keywords — no AI. Select items, then Generate quote.
            </p>
          </div>
          <button
            type="button"
            onClick={loadMatches}
            className="text-xs text-mid-green hover:underline"
          >
            Refresh matches
          </button>
        </div>

        {keywords.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {keywords.slice(0, 24).map((kw) => (
              <span
                key={kw}
                className="rounded bg-light-green/25 px-2 py-0.5 text-xs text-dark-primary"
              >
                {kw}
              </span>
            ))}
          </div>
        ) : null}

        {matchesLoading ? (
          <p className="mt-4 text-sm text-mid-green">Matching catalog…</p>
        ) : matches.length === 0 ? (
          <p className="mt-4 text-sm text-mid-green">
            No catalog matches yet. Parse the RFQ first, or generate a quote with a blank line.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-dark-secondary/5 text-mid-green">
                <tr>
                  <th className="px-3 py-2 font-medium w-10"></th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Matched</th>
                  <th className="px-3 py-2 font-medium text-right">Score</th>
                  <th className="px-3 py-2 font-medium text-right">Offer</th>
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
                      {m.matchedTokens.slice(0, 6).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.score}</td>
                    <td className="px-3 py-2 text-right">
                      <Money value={m.product.offerPrice} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-mid-green">
              Suggested vendors
            </h2>
            <p className="mt-0.5 text-xs text-mid-green">
              Deterministic category and keyword match — no AI.
              {vendorProductKey ? ` Product key: ${vendorProductKey}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={loadVendorMatches}
            className="text-xs text-mid-green hover:underline"
          >
            Refresh vendors
          </button>
        </div>

        {vendorsLoading ? (
          <p className="mt-4 text-sm text-mid-green">Matching vendors…</p>
        ) : vendorMatches.length === 0 ? (
          <p className="mt-4 text-sm text-mid-green">
            No vendors match this RFQ category yet. Add vendor categories and
            keywords from the Vendors page.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-dark-secondary/5 text-mid-green">
                <tr>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Channel / contact</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Matched</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Last price
                  </th>
                  <th className="px-3 py-2 font-medium">Recore</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {vendorMatches.map((match, index) => (
                  <tr
                    key={match.vendor.id}
                    className={index % 2 === 1 ? "bg-light-green/10" : undefined}
                  >
                    <td className="px-3 py-2 font-medium">{match.vendor.name}</td>
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium text-mid-green">
                        {match.vendor.preferredChannel}
                      </div>
                      <div>{match.vendor.phone || match.vendor.email || "—"}</div>
                      {match.vendor.phone && match.vendor.email ? (
                        <div className="text-xs text-mid-green">
                          {match.vendor.email}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div>{match.category}</div>
                      {match.subcategory ? (
                        <div className="text-xs text-mid-green">
                          {match.subcategory}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-mid-green">
                      {match.matchedKeywords.slice(0, 8).join(", ") || "category"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {match.score}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {match.outreach?.status === "REPLIED" &&
                      match.outreach.quotedPrice != null ? (
                        <>
                          <Money value={match.outreach.quotedPrice} />
                          <div className="text-xs font-medium text-dark-primary">
                            Recore reply
                          </div>
                          {match.outreach.repliedAt ? (
                            <div className="text-xs text-mid-green">
                              {format(
                                new Date(match.outreach.repliedAt),
                                "dd MMM yyyy"
                              )}
                            </div>
                          ) : null}
                        </>
                      ) : match.lastPrice != null ? (
                        <>
                          <Money value={match.lastPrice} />
                          {match.lastQuotedAt ? (
                            <div className="text-xs text-mid-green">
                              {format(new Date(match.lastQuotedAt), "dd MMM yyyy")}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-mid-green">No history</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {match.outreach?.status === "SENT" ? (
                        <span className="text-xs font-medium text-mid-green">
                          Sent
                          {match.outreach.sentAt
                            ? ` · ${format(new Date(match.outreach.sentAt), "dd MMM HH:mm")}`
                            : ""}
                        </span>
                      ) : match.outreach?.status === "REPLIED" ? (
                        <span className="text-xs font-medium text-dark-primary">
                          Replied
                        </span>
                      ) : match.outreach?.status === "FAILED" ? (
                        <span
                          className="text-xs text-red-700"
                          title={match.outreach.errorMessage}
                        >
                          Failed
                        </span>
                      ) : (
                        <span className="text-xs text-mid-green">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={
                          !match.vendor.email || recoreBusy === match.vendor.id
                        }
                        title={
                          match.vendor.email
                            ? "Email vendor a revised quote request"
                            : "Add vendor email on Vendors page"
                        }
                        onClick={() =>
                          void sendRecore(match.vendor.id, match.productKey)
                        }
                        className="rounded-lg border border-mid-green/40 bg-mid-green/10 px-3 py-1.5 text-xs font-medium text-dark-primary hover:bg-mid-green/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {recoreBusy === match.vendor.id
                          ? "Sending…"
                          : match.outreach?.status === "SENT" ||
                              match.outreach?.status === "REPLIED"
                            ? "Recore again"
                            : "Recore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <h2 className="text-sm font-medium text-mid-green">Raw message</h2>
        {rfq.subject ? <p className="mt-2 text-sm font-medium">{rfq.subject}</p> : null}
        <pre className="mt-2 whitespace-pre-wrap text-sm text-dark-primary">{rfq.rawText}</pre>
      </section>

      <section className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <h2 className="text-sm font-medium text-mid-green">Thread</h2>
        <ul className="mt-3 space-y-3">
          {(rfq.messages ?? []).map((m) => (
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
          ))}
        </ul>
      </section>

      {(rfq.quotes ?? []).length > 0 ? (
        <section className="rounded-xl bg-white/50 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <h2 className="text-sm font-medium text-mid-green">Linked quotes</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(rfq.quotes ?? []).map((q) => (
              <li key={q.id}>
                <Link href={`/quotes/${q.id}`} className="text-mid-green hover:underline">
                  {q.quoteNumber}
                </Link>{" "}
                <StatusBadge status={q.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
