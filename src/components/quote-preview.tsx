"use client";

import type { QuoteCalcResult } from "@/lib/tax";
import { amountInWords } from "@/lib/accounting/money";
import {
  QUOTE_CLOSING,
  formatQuoteAmount,
  formatQuoteQty,
} from "@/lib/quote-format";
import { X } from "lucide-react";

export type QuotePreviewCompany = {
  name: string;
  address: string;
  gstin: string;
  email: string;
  phone: string;
  mobile?: string;
  website?: string;
  signatory?: string;
  tagline?: string;
  services?: string;
  paymentTerms?: string;
  bankName?: string;
  bankBranch?: string;
  bankIfsc?: string;
  bankAccount?: string;
  bankAccountType?: string;
};

export type QuotePreviewLine = {
  key: string;
  description: string;
  aliasName?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  hsnCode?: string | null;
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
  const totalQty = displayLines.reduce((s, l) => s + l.qty, 0);
  const totalTax = displayLines.reduce((s, l) => s + lineTax(l, withGst), 0);
  const gstBuckets = new Map<number, number>();
  if (withGst) {
    for (const line of displayLines) {
      const tax = lineTax(line, true);
      if (line.taxRate <= 0 || tax <= 0) continue;
      gstBuckets.set(line.taxRate, Math.round(((gstBuckets.get(line.taxRate) || 0) + tax) * 100) / 100);
    }
  }
  const signatory = company.signatory || company.name;
  const signPhone = (company.mobile || company.phone || "").replace(/^\+91\s*/, "");
  const paymentTerms = company.paymentTerms || "Against Delivery";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 px-3 py-4 sm:px-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-preview-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 id="quote-preview-title" className="text-sm font-medium text-[#1F3A5F]">
              Quote preview
            </h2>
            <p className="text-[11px] text-slate-500">Matches the Transoft quotation format</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-200"
            aria-label="Close preview"
          >
            <X className="h-5 w-5 text-[#1F3A5F]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-6 text-[12px] leading-relaxed text-slate-800 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-lg font-bold tracking-[0.12em] text-[#1F3A5F] sm:text-xl">
                {(company.name || "Your Company").toUpperCase()}
              </p>
              {company.tagline ? (
                <p className="mt-0.5 text-[11px] font-semibold tracking-wider text-[#1F3A5F]">
                  {company.tagline}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tracking-[0.18em] text-[#1F3A5F]">QUOTATION</p>
              {company.gstin ? (
                <p className="mt-0.5 text-[11px] text-slate-500">GSTIN: {company.gstin}</p>
              ) : null}
            </div>
          </div>
          {company.services ? (
            <p className="mt-3 text-[10px] leading-snug text-slate-500">{company.services}</p>
          ) : null}

          <div className="mt-4 grid gap-4 bg-[#F3F5F7] p-4 sm:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500">TO</p>
              <p className="mt-1 font-semibold text-[#1F3A5F]">{buyerTitle}</p>
              {buyer.name && buyer.company && buyer.name !== buyer.company ? (
                <p>{buyer.name}</p>
              ) : null}
              {buyer.address ? (
                <p className="whitespace-pre-line text-slate-600">{buyer.address}</p>
              ) : (
                <p className="italic text-slate-400">Add buyer details…</p>
              )}
              {buyer.state ? <p>{buyer.state}</p> : null}
              <p>M: {buyer.phone || "."}</p>
              <p>GSTIN: {buyer.gstin || ""}</p>
              {buyer.email ? <p>Email: {buyer.email}</p> : null}
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500">DETAILS</p>
              <p className="mt-1 text-slate-500">Ref No: {quoteNumber || "DRAFT"}</p>
              <p className="text-slate-500">Date: {today}</p>
              <p className="text-slate-500">Subject: Quotation</p>
              <p className="mt-3 text-[11px] text-slate-600">
                Dear Sir, at the outset we thank you for your interest in buying the products from{" "}
                {company.name}. We are pleased to quote our best prices as:
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-[#1F3A5F] text-white">
                  <th className="px-2 py-2 text-center text-[11px] font-semibold">SN</th>
                  <th className="px-2 py-2 text-[11px] font-semibold">Description of Goods</th>
                  <th className="px-2 py-2 text-center text-[11px] font-semibold">HSN</th>
                  <th className="px-2 py-2 text-center text-[11px] font-semibold">Qty</th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold">Unit Rate</th>
                  {withGst ? (
                    <>
                      <th className="px-2 py-2 text-center text-[11px] font-semibold">GST</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold">Tax</th>
                    </>
                  ) : null}
                  <th className="px-2 py-2 text-right text-[11px] font-semibold">Amount</th>
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
                    <tr key={line.key} className="border-b border-slate-200">
                      <td className="px-2 py-2 text-center align-top tabular-nums">{i + 1}</td>
                      <td className="min-w-0 px-2 py-2 align-top">
                        {name ? (
                          <span className="font-semibold">{name}</span>
                        ) : (
                          <span className="italic text-slate-400">Item…</span>
                        )}
                        {showCatalog ? (
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            {line.description}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center align-top tabular-nums">
                        {line.hsnCode || ""}
                      </td>
                      <td className="px-2 py-2 text-center align-top tabular-nums">
                        {formatQuoteQty(line.qty, line.unit)}
                      </td>
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {formatQuoteAmount(line.unitPrice)}
                      </td>
                      {withGst ? (
                        <>
                          <td className="px-2 py-2 text-center align-top tabular-nums">
                            {line.taxRate}%
                          </td>
                          <td className="px-2 py-2 text-right align-top tabular-nums">
                            {formatQuoteAmount(tax)}
                          </td>
                        </>
                      ) : null}
                      <td className="px-2 py-2 text-right align-top font-semibold tabular-nums">
                        {formatQuoteAmount(amount)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-y border-[#1F3A5F] bg-[#F3F5F7] font-semibold">
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-center tabular-nums">{totalQty}</td>
                  <td className="px-2 py-2" />
                  {withGst ? (
                    <>
                      <td className="px-2 py-2 text-center">Total</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatQuoteAmount(totalTax)}</td>
                    </>
                  ) : (
                    <td className="px-2 py-2 text-right">Total</td>
                  )}
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatQuoteAmount(calc.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-6 sm:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500">
                AMOUNT IN WORDS
              </p>
              <p className="mt-1 text-[12px]">{amountInWords(calc.grandTotal, "").trim()}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-500">TAX ANALYSIS</p>
              <div className="mt-1 space-y-1">
                <div className="flex justify-between border-b border-slate-200 py-1">
                  <span className="text-slate-500">Taxable Amount</span>
                  <span className="font-semibold tabular-nums">{formatQuoteAmount(calc.subtotal)}</span>
                </div>
                {Array.from(gstBuckets.entries()).map(([rate, tax]) => (
                  <div key={rate} className="flex justify-between border-b border-slate-200 py-1">
                    <span className="text-slate-500">GST@{rate}%</span>
                    <span className="font-semibold tabular-nums">{formatQuoteAmount(tax)}</span>
                  </div>
                ))}
                {calc.discountAmount > 0 ? (
                  <div className="flex justify-between border-b border-slate-200 py-1">
                    <span className="text-slate-500">Discount</span>
                    <span className="font-semibold tabular-nums">
                      -{formatQuoteAmount(calc.discountAmount)}
                    </span>
                  </div>
                ) : null}
                {calc.deliveryCharge > 0 ? (
                  <div className="flex justify-between border-b border-slate-200 py-1">
                    <span className="text-slate-500">Delivery</span>
                    <span className="font-semibold tabular-nums">
                      {formatQuoteAmount(calc.deliveryCharge)}
                    </span>
                  </div>
                ) : null}
                {calc.otherTaxAmount > 0 ? (
                  <div className="flex justify-between border-b border-slate-200 py-1">
                    <span className="text-slate-500">{otherTaxLabel || "Other tax"}</span>
                    <span className="font-semibold tabular-nums">
                      {formatQuoteAmount(calc.otherTaxAmount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between bg-[#1F3A5F] px-2 py-2 font-bold text-white">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{formatQuoteAmount(calc.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#1F3A5F]">
              TERMS & CONDITIONS
            </p>
            <p className="mt-1">Payment Terms: {paymentTerms}</p>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">{QUOTE_CLOSING}</p>

          <div className="mt-6 text-right text-[12px] text-slate-500">
            <p>With thanks and best regards,</p>
            <p>Yours Sincerely</p>
            <p className="mt-4 font-semibold text-[#1F3A5F]">
              {signatory}
              {signPhone ? ` (${signPhone})` : ""}
            </p>
          </div>

          <div className="mt-8 border-t border-[#1F3A5F] pt-3 text-center text-[10px] leading-relaxed text-slate-500">
            {company.bankName || company.bankAccount ? (
              <p className="text-[#1F3A5F]">
                {`Bank Details: ${[
                  company.bankName,
                  company.bankBranch ? `Branch: ${company.bankBranch}` : null,
                  company.bankIfsc ? `IFSC Code: ${company.bankIfsc}` : null,
                  company.bankAccount ? `A/C No: ${company.bankAccount}` : null,
                  company.bankAccountType ? `A/C Type: ${company.bankAccountType}` : null,
                ]
                  .filter(Boolean)
                  .join("   |   ")}`}
              </p>
            ) : null}
            <p className="mt-1">
              {[
                company.address ? `Address: ${company.address}` : null,
                company.phone ? `PH: ${company.phone}` : null,
                company.mobile ? `Mobile: ${company.mobile}` : null,
              ]
                .filter(Boolean)
                .join("   |   ")}
            </p>
            <p>
              {[
                company.email ? `Email: ${company.email}` : null,
                company.website ? `Website: ${company.website}` : null,
              ]
                .filter(Boolean)
                .join("   |   ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
