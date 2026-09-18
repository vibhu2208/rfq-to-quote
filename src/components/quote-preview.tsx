"use client";

import { formatMoney } from "@/lib/tax";
import type { QuoteCalcResult } from "@/lib/tax";
import { X } from "lucide-react";

export type QuotePreviewCompany = {
  name: string;
  address: string;
  gstin: string;
  email: string;
  phone: string;
};

export type QuotePreviewLine = {
  key: string;
  description: string;
  aliasName?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
};

type Props = {
  quoteNumber?: string;
  company: QuotePreviewCompany;
  buyer: {
    name: string;
    company: string;
    email: string;
    phone: string;
    state: string;
    address: string;
    gstin: string;
  };
  withGst: boolean;
  notes: string;
  otherTaxLabel: string;
  lineItems: QuotePreviewLine[];
  calc: QuoteCalcResult;
  open: boolean;
  onClose: () => void;
};

function lineTaxable(line: QuotePreviewLine) {
  return Math.round(line.qty * line.unitPrice * 100) / 100;
}

function lineTax(line: QuotePreviewLine, withGst: boolean) {
  if (!withGst) return 0;
  return Math.round(((lineTaxable(line) * line.taxRate) / 100) * 100) / 100;
}

function displayName(line: QuotePreviewLine) {
  return line.aliasName?.trim() || line.description.trim();
}

export function QuotePreviewModal({
  quoteNumber,
  company,
  buyer,
  withGst,
  notes,
  otherTaxLabel,
  lineItems,
  calc,
  open,
  onClose,
}: Props) {
  if (!open) return null;

  const buyerTitle = buyer.company || buyer.name || "Buyer name";
  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const filledLines = lineItems.filter(
    (l) => displayName(l) || l.unitPrice > 0 || l.qty > 0
  );
  const displayLines = filledLines.length > 0 ? filledLines : lineItems.slice(0, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 px-3 py-4 sm:px-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-preview-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-light-green/30 bg-light-green/10 px-4 py-3">
          <div>
            <h2 id="quote-preview-title" className="text-sm font-medium text-mid-green">
              Quote preview
            </h2>
            <p className="text-[11px] text-mid-green/70">Live view of the quotation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-light-green/30"
            aria-label="Close preview"
          >
            <X className="h-5 w-5 text-mid-green" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-5 text-[12px] leading-relaxed text-dark-primary sm:p-7">
          <div className="border-b-[1.5px] border-dark-primary pb-3 text-center">
            <p className="font-serif text-lg font-bold tracking-tight sm:text-xl">
              {company.name || "Your Company"}
            </p>
            {company.address ? (
              <p className="mt-1 text-[11px] text-dark-secondary/80">{company.address}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-dark-secondary/80">
              {[
                company.phone ? `PH: ${company.phone}` : null,
                company.email ? `Email: ${company.email}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
            {company.gstin ? (
              <p className="mt-0.5 text-[11px] text-dark-secondary/80">
                GSTIN: {company.gstin}
              </p>
            ) : null}
          </div>

          <p className="mt-4 text-center font-serif text-base font-bold underline underline-offset-4">
            Quotation
          </p>

          <div className="mt-4 flex justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">To,</p>
              <p className="font-semibold">{buyerTitle}</p>
              {buyer.name && buyer.company ? <p>{buyer.name}</p> : null}
              {buyer.address ? (
                <p className="whitespace-pre-line text-dark-secondary/90">{buyer.address}</p>
              ) : null}
              {buyer.state ? <p>{buyer.state}</p> : null}
              {buyer.gstin ? <p>GSTIN: {buyer.gstin}</p> : null}
              {!buyer.company && !buyer.name && !buyer.address ? (
                <p className="italic text-mid-green/60">Add buyer details…</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p>Date:</p>
              <p>{today}</p>
            </div>
          </div>

          <p className="mt-4">
            <span className="font-semibold">Subject:</span> Quotation
          </p>
          <p className="mt-2 text-dark-secondary/90">
            Dear Sir, we are pleased to quote our best prices as:
          </p>
          <p className="mt-2 font-semibold">Ref No: {quoteNumber || "DRAFT"}</p>

          <div className="mt-4 overflow-x-auto rounded border border-dark-primary/80">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-dark-primary/80 bg-neutral-100">
                  <th className="px-2 py-2 font-semibold">#</th>
                  <th className="px-2 py-2 font-semibold">Description</th>
                  <th className="px-2 py-2 text-right font-semibold">Qty</th>
                  <th className="px-2 py-2 text-right font-semibold">Rate</th>
                  {withGst ? (
                    <th className="px-2 py-2 text-right font-semibold">GST%</th>
                  ) : null}
                  <th className="px-2 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayLines.map((line, i) => {
                  const taxable = lineTaxable(line);
                  const tax = lineTax(line, withGst);
                  const amount = Math.round((taxable + tax) * 100) / 100;
                  const name = displayName(line);
                  const showCatalog =
                    Boolean(line.aliasName?.trim()) &&
                    Boolean(line.description.trim()) &&
                    line.aliasName!.trim() !== line.description.trim();
                  return (
                    <tr
                      key={line.key}
                      className="border-b border-dark-primary/40 last:border-b-0"
                    >
                      <td className="px-2 py-2 align-top tabular-nums">{i + 1}</td>
                      <td className="min-w-0 px-2 py-2 align-top">
                        {name ? (
                          <span className="font-medium">{name}</span>
                        ) : (
                          <span className="italic text-mid-green/50">Item…</span>
                        )}
                        {showCatalog ? (
                          <span className="mt-0.5 block text-[10px] text-dark-secondary/70">
                            {line.description}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {line.qty} {line.unit}
                      </td>
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {formatMoney(line.unitPrice)}
                      </td>
                      {withGst ? (
                        <td className="px-2 py-2 text-right align-top tabular-nums">
                          {line.taxRate}%
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {formatMoney(amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 ml-auto w-full max-w-[16rem] space-y-1">
            <div className="flex justify-between gap-4">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(calc.subtotal)}</span>
            </div>
            {calc.discountAmount > 0 ? (
              <div className="flex justify-between gap-4">
                <span>Discount</span>
                <span className="tabular-nums">-{formatMoney(calc.discountAmount)}</span>
              </div>
            ) : null}
            {withGst && calc.gstSplit === "CGST_SGST" ? (
              <>
                <div className="flex justify-between gap-4">
                  <span>CGST</span>
                  <span className="tabular-nums">{formatMoney(calc.cgstAmount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>SGST</span>
                  <span className="tabular-nums">{formatMoney(calc.sgstAmount)}</span>
                </div>
              </>
            ) : null}
            {withGst && calc.gstSplit === "IGST" ? (
              <div className="flex justify-between gap-4">
                <span>IGST</span>
                <span className="tabular-nums">{formatMoney(calc.igstAmount)}</span>
              </div>
            ) : null}
            {withGst && calc.gstAmount > 0 && calc.gstSplit === "NONE" ? (
              <div className="flex justify-between gap-4">
                <span>GST</span>
                <span className="tabular-nums">{formatMoney(calc.gstAmount)}</span>
              </div>
            ) : null}
            {calc.otherTaxAmount > 0 ? (
              <div className="flex justify-between gap-4">
                <span>{otherTaxLabel || "Other tax"}</span>
                <span className="tabular-nums">{formatMoney(calc.otherTaxAmount)}</span>
              </div>
            ) : null}
            {calc.deliveryCharge > 0 ? (
              <div className="flex justify-between gap-4">
                <span>Delivery</span>
                <span className="tabular-nums">{formatMoney(calc.deliveryCharge)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between gap-4 border border-dark-primary px-2 py-1.5 font-bold">
              <span>Grand total</span>
              <span className="tabular-nums">{formatMoney(calc.grandTotal)}</span>
            </div>
          </div>

          {notes.trim() ? (
            <div className="mt-5 border-t border-light-green/40 pt-3">
              <p className="font-semibold">Notes</p>
              <p className="mt-1 whitespace-pre-line text-dark-secondary/90">{notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
