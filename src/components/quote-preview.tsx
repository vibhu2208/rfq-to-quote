"use client";

import type { ReactNode } from "react";
import type { QuoteCalcResult } from "@/lib/tax";
import { amountInWords } from "@/lib/accounting/money";
import {
  QUOTE_CLOSING,
  QUOTE_LETTERHEAD_SRC,
  QUOTE_STAMP_SRC,
  defaultQuoteTerms,
  formatQuoteAmount,
  formatQuoteDateDisplay,
  formatQuoteQty,
  formatTaxAnalysis,
  quoteIntro,
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

export type PreviewSection = "buyer" | "details" | "intro" | "terms";

type Props = {
  quoteNumber?: string;
  quoteDate?: string;
  introText?: string;
  termsText?: string;
  closingText?: string;
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
  sidebar?: ReactNode;
  activeSection?: PreviewSection;
  onSelectSection?: (section: PreviewSection) => void;
};

function EditableBlock({
  section,
  activeSection,
  onSelectSection,
  label,
  className,
  children,
}: {
  section: PreviewSection;
  activeSection?: PreviewSection;
  onSelectSection?: (section: PreviewSection) => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  if (!onSelectSection) {
    return <div className={className}>{children}</div>;
  }
  const active = activeSection === section;
  return (
    <button
      type="button"
      onClick={() => onSelectSection(section)}
      title={`Edit ${label}`}
      className={`rounded-md text-left transition ${
        active
          ? "bg-mid-green/5 ring-2 ring-mid-green/45"
          : "hover:bg-slate-50 hover:ring-1 hover:ring-mid-green/30"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

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
  quoteDate,
  introText,
  termsText,
  closingText,
  company,
  buyer,
  withGst,
  otherTaxLabel,
  lineItems,
  calc,
  open,
  onClose,
  sidebar,
  activeSection,
  onSelectSection,
}: Props) {
  if (!open) return null;

  const buyerTitle = buyer.company || buyer.name || "Buyer name";
  const displayDate = formatQuoteDateDisplay(quoteDate);
  const displayIntro = introText?.trim() || quoteIntro(company.name);
  const displayTerms = termsText?.trim() || defaultQuoteTerms(company.paymentTerms);
  const displayClosing = closingText?.trim() || QUOTE_CLOSING;
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
      gstBuckets.set(
        line.taxRate,
        Math.round(((gstBuckets.get(line.taxRate) || 0) + tax) * 100) / 100
      );
    }
  }
  const signatory = company.signatory || company.name;
  const signPhone = (company.mobile || company.phone || "").replace(/^\+91\s*/, "");
  const words = amountInWords(calc.grandTotal, "").replace(/\s+/g, " ").trim();
  const taxAnalysis = formatTaxAnalysis({
    taxable: calc.taxable,
    withGst,
    gstBuckets: Array.from(gstBuckets.entries()),
    gstAmount: calc.gstAmount,
    discountAmount: calc.discountAmount,
    deliveryCharge: calc.deliveryCharge,
    otherTaxAmount: calc.otherTaxAmount,
    otherTaxLabel,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 px-3 py-4 sm:px-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[90rem] flex-col items-stretch gap-3 lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {sidebar ? (
          <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden rounded-xl bg-background shadow-xl lg:max-h-none lg:h-full lg:w-[22rem] lg:self-stretch">
            {sidebar}
          </aside>
        ) : null}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-preview-title"
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 id="quote-preview-title" className="text-sm font-medium text-slate-800">
              Quote preview
            </h2>
            <p className="text-[11px] text-slate-500">
              Click buyer, date / ref no, intro, or terms to edit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-200"
            aria-label="Close preview"
          >
            <X className="h-5 w-5 text-slate-700" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-5 text-[12px] leading-relaxed text-black sm:p-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={QUOTE_LETTERHEAD_SRC}
            alt="Company letterhead"
            className="mb-4 h-auto w-full max-h-[72px] object-contain object-left"
          />

          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <EditableBlock
              section="buyer"
              activeSection={activeSection}
              onSelectSection={onSelectSection}
              label="buyer details"
              className="min-w-0 px-1.5 py-1 sm:w-[58%]"
            >
              <p>To,</p>
              <p className="font-bold text-[#0000FF]">{buyerTitle}</p>
              {buyer.name && buyer.company && buyer.name !== buyer.company ? (
                <p className="text-[#0000FF]">{buyer.name}</p>
              ) : null}
              {buyer.address ? (
                <p className="whitespace-pre-line text-[#0000FF]">{buyer.address}</p>
              ) : (
                <p className="italic text-slate-400">Add buyer details…</p>
              )}
              <p className="text-[#0000FF]">
                {[buyer.state, `M: ${buyer.phone || "."}`].filter(Boolean).join("  ")} GSTIN:{" "}
                {buyer.gstin || ""}
              </p>
              {buyer.email ? <p className="text-[#0000FF]">Email: {buyer.email}</p> : null}
            </EditableBlock>
            <EditableBlock
              section="details"
              activeSection={activeSection}
              onSelectSection={onSelectSection}
              label="date and ref no"
              className="px-1.5 py-1 sm:w-[38%]"
            >
              <p className="font-bold">Quotation</p>
              {company.gstin ? <p>GSTIN: {company.gstin}</p> : null}
              <p>Ref No: {quoteNumber || "DRAFT"}</p>
              <p>Subject: Quotation</p>
              <p>Date:</p>
              <p>{displayDate}</p>
            </EditableBlock>
          </div>

          <p className="mt-3">Dear Sir,</p>
          <EditableBlock
            section="intro"
            activeSection={activeSection}
            onSelectSection={onSelectSection}
            label="intro message"
            className="mt-2 w-full px-1.5 py-1"
          >
            <p className="whitespace-pre-line">{displayIntro}</p>
          </EditableBlock>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse border border-black text-left">
              <thead>
                <tr className="bg-yellow-300">
                  <th className="border border-black px-1.5 py-1 text-center text-[11px] font-bold">
                    SN
                  </th>
                  <th className="border border-black px-1.5 py-1 text-[11px] font-bold">
                    Description of Goods
                  </th>
                  <th className="border border-black px-1.5 py-1 text-center text-[11px] font-bold">
                    HSN
                  </th>
                  <th className="border border-black px-1.5 py-1 text-center text-[11px] font-bold">
                    Qty
                  </th>
                  <th className="border border-black px-1.5 py-1 text-right text-[11px] font-bold">
                    Unit Rate
                  </th>
                  {withGst ? (
                    <>
                      <th className="border border-black px-1.5 py-1 text-center text-[11px] font-bold">
                        GST
                      </th>
                      <th className="border border-black px-1.5 py-1 text-right text-[11px] font-bold">
                        Tax
                      </th>
                    </>
                  ) : null}
                  <th className="border border-black px-1.5 py-1 text-right text-[11px] font-bold">
                    Amount
                  </th>
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
                    <tr key={line.key}>
                      <td className="border border-black px-1.5 py-1.5 text-center align-top tabular-nums">
                        {i + 1}
                      </td>
                      <td className="min-w-0 border border-black px-1.5 py-1.5 align-top">
                        {name ? (
                          <span className="font-bold">{name}</span>
                        ) : (
                          <span className="italic text-slate-400">Item…</span>
                        )}
                        {showCatalog ? (
                          <span className="mt-0.5 block text-[10px] text-slate-600">
                            {line.description}
                          </span>
                        ) : null}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-center align-top tabular-nums">
                        {line.hsnCode || ""}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-center align-top tabular-nums">
                        {formatQuoteQty(line.qty, line.unit)}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-right align-top tabular-nums">
                        {formatQuoteAmount(line.unitPrice)}
                      </td>
                      {withGst ? (
                        <>
                          <td className="border border-black px-1.5 py-1.5 text-center align-top tabular-nums">
                            {line.taxRate}%
                          </td>
                          <td className="border border-black px-1.5 py-1.5 text-right align-top tabular-nums">
                            {formatQuoteAmount(tax)}
                          </td>
                        </>
                      ) : null}
                      <td className="border border-black px-1.5 py-1.5 text-right align-top font-bold tabular-nums">
                        {formatQuoteAmount(amount)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td className="border border-black px-1.5 py-1.5" />
                  <td className="border border-black px-1.5 py-1.5" />
                  <td className="border border-black px-1.5 py-1.5" />
                  <td className="border border-black px-1.5 py-1.5 text-center tabular-nums">
                    {totalQty}
                  </td>
                  {withGst ? (
                    <>
                      <td className="border border-black px-1.5 py-1.5" />
                      <td className="border border-black px-1.5 py-1.5 text-center">Total</td>
                      <td className="border border-black px-1.5 py-1.5 text-right tabular-nums">
                        {formatQuoteAmount(totalTax)}
                      </td>
                    </>
                  ) : (
                    <td className="border border-black px-1.5 py-1.5 text-right">Total</td>
                  )}
                  <td className="border border-black px-1.5 py-1.5 text-right tabular-nums">
                    {formatQuoteAmount(calc.grandTotal)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={withGst ? 5 : 4}
                    className="border border-black px-1.5 py-1.5 font-bold"
                  >
                    Amount in Words: {words}
                  </td>
                  <td
                    colSpan={withGst ? 2 : 1}
                    className="border border-black px-1.5 py-1.5 text-center font-bold"
                  >
                    Grand Total
                  </td>
                  <td className="border border-black px-1.5 py-1.5 text-right font-bold tabular-nums">
                    {formatQuoteAmount(calc.grandTotal)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={withGst ? 8 : 6} className="border border-black px-1.5 py-1.5">
                    {taxAnalysis}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <EditableBlock
            section="terms"
            activeSection={activeSection}
            onSelectSection={onSelectSection}
            label="terms and conditions"
            className="mt-4 w-full px-1.5 py-1"
          >
            <p>Terms & Conditions:</p>
            <p className="whitespace-pre-line">{displayTerms}</p>
            <p className="mt-3 whitespace-pre-line text-[11px] leading-relaxed">
              {displayClosing}
            </p>
          </EditableBlock>

          <p className="mt-4">With thanks and best regards,</p>
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={QUOTE_STAMP_SRC} alt="Company stamp" className="h-14 w-16 object-contain" />
            <div>
              <p className="font-bold">Yours Sincerely</p>
              <p className="mt-2">
                {signatory}
                {signPhone ? `(${signPhone})` : ""}
              </p>
            </div>
          </div>

          <div className="mt-8 text-[11px] leading-relaxed">
            {company.bankName || company.bankAccount ? (
              <p>
                {`Bank Details: ${[
                  company.bankName,
                  company.bankBranch ? `Branch: ${company.bankBranch}` : null,
                  company.bankIfsc ? `IFSC Code: ${company.bankIfsc}` : null,
                  company.bankAccount ? `A/C No: ${company.bankAccount}` : null,
                  company.bankAccountType ? `A/C Type: ${company.bankAccountType}` : null,
                ]
                  .filter(Boolean)
                  .join("  ")}`}
              </p>
            ) : null}
            <p className="mt-1">
              {[
                company.address ? `Address: ${company.address}` : null,
                company.phone ? `PH: ${company.phone}` : null,
                company.mobile ? `Mobile: ${company.mobile}` : null,
                company.email ? `Email: ${company.email}` : null,
                company.website ? `Website: ${company.website}` : null,
              ]
                .filter(Boolean)
                .join(" | ")}
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
