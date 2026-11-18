"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type RelatedQuote = {
  id: string;
  quoteNumber: string;
  quoteName: string;
  status: string;
  buyerCompany: string;
  grandTotal: number;
  updatedAt: string;
};

type RelatedLead = {
  id: string;
  leadNumber: string;
  customerCompany: string;
  customerName: string;
  leadStage: string;
  status: string;
  updatedAt: string;
};

type RelatedInvoice = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  total: number;
  balanceDue: number;
};

type RelatedWork = {
  quotes: RelatedQuote[];
  quoteCount: number;
  leads: RelatedLead[];
  leadCount: number;
  invoices: RelatedInvoice[];
  invoiceCount: number;
  openingBalance: number;
  openingDrCr: string | null;
  booksNote: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function RelatedList({
  title,
  href,
  empty,
  count,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white/60 px-3 py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
          {title}
          <span className="ml-1.5 font-medium normal-case tracking-normal text-dark-primary/70">
            {count}
          </span>
        </h4>
        <Link
          href={href}
          className="text-xs font-medium text-dark-secondary underline decoration-light-green/60 underline-offset-2 hover:text-dark-primary"
        >
          View all
        </Link>
      </div>
      {count === 0 ? (
        <p className="text-xs text-mid-green">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

export function ClientRelatedWork({
  partyId,
  legalName,
}: {
  partyId: string;
  legalName: string;
}) {
  const [data, setData] = useState<RelatedWork | null>(null);
  const [failed, setFailed] = useState(false);
  const quotesHref = `/quotes?client=${encodeURIComponent(legalName)}`;
  const leadsHref = `/leads?q=${encodeURIComponent(legalName)}`;
  const loading = !data && !failed;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/parties/${partyId}/related`, {
          cache: "no-store",
        });
        const json = (await response.json().catch(() => null)) as RelatedWork | null;
        if (!response.ok || !json) throw new Error("related");
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  return (
    <section className="mb-5 space-y-2" aria-label="Related quotes and leads">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
        Quotes, leads, and balance
      </h3>
      {loading ? (
        <p className="text-xs text-mid-green">Loading quotes and leads…</p>
      ) : failed || !data ? (
        <p className="text-xs text-mid-green">
          Could not load quotes and leads for this client.
        </p>
      ) : (
        <div className="space-y-2">
          <RelatedList
            title="Quotes"
            href={quotesHref}
            count={data.quoteCount}
            empty="No quotes matched this client by company, GSTIN, email, or linked lead."
          >
            <ul className="space-y-1">
              {data.quotes.map((quote) => (
                <li key={quote.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    href={`/quotes/${quote.id}`}
                    className="min-w-0 truncate font-medium text-dark-primary hover:text-mid-green"
                  >
                    {quote.quoteNumber}
                    {quote.quoteName ? ` · ${quote.quoteName}` : ""}
                  </Link>
                  <span className="shrink-0 text-xs text-mid-green">
                    {quote.status} · {money(quote.grandTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </RelatedList>
          <RelatedList
            title="Leads"
            href={leadsHref}
            count={data.leadCount}
            empty="No leads matched this client by company, email, or client link."
          >
            <ul className="space-y-1">
              {data.leads.map((lead) => (
                <li key={lead.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="min-w-0 truncate font-medium text-dark-primary hover:text-mid-green"
                  >
                    {lead.leadNumber}
                    <span className="font-normal text-mid-green">
                      {" "}
                      · {lead.customerCompany || lead.customerName || "Lead"}
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-mid-green">
                    {lead.leadStage.replaceAll("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          </RelatedList>
          <div className="rounded-lg bg-white/60 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-mid-green">
                Opening balance
              </h4>
              <span className="font-medium text-dark-primary">
                {money(data.openingBalance)}
                {data.openingDrCr ? ` ${data.openingDrCr}` : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-mid-green">{data.booksNote}</p>
            {data.invoiceCount > 0 ? (
              <ul className="mt-2 space-y-1">
                {data.invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-medium text-dark-primary hover:text-mid-green"
                    >
                      {invoice.number}
                    </Link>
                    <span className="text-xs text-mid-green">
                      {invoice.status} · due {money(invoice.balanceDue)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-mid-green">No tax invoices for this client.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
