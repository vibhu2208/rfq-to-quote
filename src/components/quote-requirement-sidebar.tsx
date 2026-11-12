"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, MessageSquareText } from "lucide-react";

export type QuoteRequirementLine = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  brand?: string | null;
  model?: string | null;
  code?: string | null;
};

export type QuoteRequirementContext = {
  rfqId: string;
  leadNumber?: string | null;
  subject?: string | null;
  category?: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  rawText: string;
  items: QuoteRequirementLine[];
};

const STORAGE_KEY = "quote-requirement-sidebar-collapsed";

type Props = {
  context: QuoteRequirementContext;
};

export function QuoteRequirementSidebar({ context }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const title =
    context.customerCompany ||
    context.customerName ||
    context.leadNumber ||
    "Client requirement";
  const message = context.rawText.trim() || context.subject?.trim() || "";

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-light-green/25 bg-white/80 py-3 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-mid-green hover:bg-light-green/20"
          aria-label="Expand client requirement"
          title="Show client requirement"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <div
          className="mt-2 flex max-h-48 items-center justify-center"
          style={{ writingMode: "vertical-rl" }}
          title={title}
        >
          <span className="truncate text-[11px] font-medium tracking-wide text-mid-green">
            Client requirement
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full max-h-[calc(100vh-5rem)] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-light-green/25 bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)] lg:w-[19rem]">
      <div className="flex items-start gap-2 border-b border-light-green/20 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
            Client requirement
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-dark-primary" title={title}>
            {title}
          </p>
          {context.leadNumber || context.category ? (
            <p className="mt-0.5 truncate text-[11px] text-mid-green">
              {[context.leadNumber, context.category].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-mid-green hover:bg-light-green/20"
          aria-label="Minimize client requirement"
          title="Minimize"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {context.subject ? (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-mid-green/80">
              Subject
            </p>
            <p className="text-sm text-dark-primary">{context.subject}</p>
          </div>
        ) : null}

        {context.items.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-mid-green/80">
              Requested items
            </p>
            <ul className="space-y-2">
              {context.items.map((item) => (
                <li
                  key={item.lineNumber}
                  className="rounded-lg bg-dark-secondary/[0.04] px-2.5 py-2"
                >
                  <p className="text-sm font-medium text-dark-primary">
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-mid-green">
                    {[
                      item.quantity > 0
                        ? `${item.quantity} ${item.unit || "pcs"}`
                        : null,
                      item.brand,
                      item.model,
                      item.code,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-mid-green/80">
            <MessageSquareText className="h-3 w-3" strokeWidth={1.75} />
            Client message
          </p>
          {message ? (
            <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-light-green/20 bg-[#fbfaf6] px-2.5 py-2 font-sans text-[12px] leading-relaxed text-dark-primary">
              {message}
            </pre>
          ) : (
            <p className="text-sm text-mid-green">No client message on this lead.</p>
          )}
        </div>
      </div>

      <div className="border-t border-light-green/20 px-3 py-2.5">
        <Link
          href={`/rfq/${context.rfqId}`}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-light-green/35 bg-white text-sm font-medium text-mid-green hover:bg-light-green/15"
        >
          <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
          Open matching / vendors
        </Link>
      </div>
    </aside>
  );
}
