"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Copy,
  Download,
  Eye,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  calculateQuoteTotals,
  formatMoney,
  type ManualOverrides,
} from "@/lib/tax";
import { INDIAN_STATES } from "@/lib/states";
import {
  resolveQuoteSendDefaults,
  type QuoteSendChannel,
  type QuoteSendDefaults,
} from "@/lib/quote-send-defaults";
import {
  QuotePreviewModal,
  type PreviewSection,
  type QuotePreviewCompany,
} from "@/components/quote-preview";
import {
  QUOTE_CLOSING,
  defaultQuoteTerms,
  quoteIntro,
  todayQuoteDateIso,
} from "@/lib/quote-format";
import {
  ClientCompanyField,
  type ClientHit,
} from "@/components/client-company-field";

type ProductHit = {
  id: string;
  code: string;
  name: string;
  unit: string;
  offerPrice: number;
  lastPrice?: number | null;
  mrp?: number | null;
  basePrice?: number;
  sellPrice?: number;
  taxRate: number;
  description: string;
  hsnCode?: string | null;
};

type LineItem = {
  key: string;
  productId: string | null;
  catalogName?: string;
  description: string;
  aliasName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  hsnCode?: string;
};

export type QuoteFormState = {
  id?: string;
  quoteNumber?: string;
  buyerName: string;
  buyerCompany: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerState: string;
  buyerAddress: string;
  buyerGstin: string;
  withGst: boolean;
  showHsn: boolean;
  gstMode: "AUTO" | "CGST_SGST" | "IGST";
  deliveryCharge: number;
  discountPercent: number;
  discountAmount: number;
  otherTaxAmount: number;
  otherTaxLabel: string;
  notes: string;
  quoteDate: string;
  introText: string;
  termsText: string;
  closingText: string;
  status: "DRAFT" | "SENT";
  manualOverrides: ManualOverrides;
  lineItems: LineItem[];
  // override values
  subtotal?: number;
  gstAmount?: number;
  grandTotal?: number;
};

export type QuoteSendContext = {
  rfqChannel: QuoteSendDefaults["rfqChannel"];
  customerEmail?: string;
  customerPhone?: string;
};

type Props = {
  initial?: QuoteFormState;
  sellerState: string;
  company: QuotePreviewCompany;
  sendContext?: QuoteSendContext;
};

function newKey() {
  return Math.random().toString(36).slice(2);
}

function matchIndianState(raw?: string | null): string {
  if (!raw?.trim()) return "";
  const n = raw.trim().toLowerCase();
  return INDIAN_STATES.find((s) => s.toLowerCase() === n) || "";
}

function formatGstAddress(parts: {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  fallback?: string;
}): string {
  const joined = [
    parts.addressLine1,
    parts.addressLine2,
    parts.city,
    parts.state,
    parts.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
  return joined || parts.fallback || "";
}

function buyerGaps(form: QuoteFormState) {
  const gaps: string[] = [];
  if (!form.buyerCompany.trim()) gaps.push("company name");
  if (!form.buyerAddress.trim()) gaps.push("address");
  if (!form.buyerState.trim()) gaps.push("state");
  return gaps;
}

const emptyQuote = (): QuoteFormState => ({
  buyerName: "",
  buyerCompany: "",
  buyerEmail: "",
  buyerPhone: "",
  buyerState: "",
  buyerAddress: "",
  buyerGstin: "",
  withGst: true,
  showHsn: true,
  gstMode: "AUTO",
  deliveryCharge: 0,
  discountPercent: 0,
  discountAmount: 0,
  otherTaxAmount: 0,
  otherTaxLabel: "",
  notes: "",
  quoteDate: "",
  introText: "",
  termsText: "",
  closingText: "",
  status: "DRAFT",
  manualOverrides: {},
  lineItems: [
    {
      key: newKey(),
      productId: null,
      description: "",
      aliasName: "",
      qty: 1,
      unit: "pcs",
      unitPrice: 0,
      taxRate: 18,
      hsnCode: "",
    },
  ],
});

function withDocumentDefaults(
  state: QuoteFormState,
  company: QuotePreviewCompany
): QuoteFormState {
  return {
    ...state,
    showHsn: state.showHsn !== false,
    quoteDate: state.quoteDate || todayQuoteDateIso(),
    introText: state.introText?.trim() || quoteIntro(company.name),
    termsText: state.termsText?.trim() || defaultQuoteTerms(company.paymentTerms),
    closingText: state.closingText?.trim() || QUOTE_CLOSING,
  };
}

export function QuoteBuilder({ initial, sellerState, company, sendContext }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<QuoteFormState>(() =>
    withDocumentDefaults(initial || emptyQuote(), company)
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [msg, setMsg] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<QuoteSendChannel>("EMAIL");
  const [sendTo, setSendTo] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sendHint, setSendHint] = useState("");
  const [sendError, setSendError] = useState("");
  const [gstinFetching, setGstinFetching] = useState(false);
  const [gstinMsg, setGstinMsg] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSection, setPreviewSection] = useState<PreviewSection>("buyer");
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [buyerIntent, setBuyerIntent] = useState<"edit" | "pdf" | "send" | null>(
    null
  );
  const [buyerError, setBuyerError] = useState("");
  const [hsnConfirmOpen, setHsnConfirmOpen] = useState(false);

  const sendDefaults = useMemo(
    () =>
      resolveQuoteSendDefaults({
        rfqChannel: sendContext?.rfqChannel ?? null,
        buyerEmail: form.buyerEmail,
        buyerPhone: form.buyerPhone,
        customerEmail: sendContext?.customerEmail,
        customerPhone: sendContext?.customerPhone,
      }),
    [
      sendContext?.rfqChannel,
      sendContext?.customerEmail,
      sendContext?.customerPhone,
      form.buyerEmail,
      form.buyerPhone,
    ]
  );

  function openSendModal() {
    if (!form.id) {
      setMsg("Save the quote before sending");
      return;
    }
    setSendChannel(sendDefaults.suggestedChannel);
    setSendTo(sendDefaults.suggestedTo);
    setSendHint(sendDefaults.hint);
    setSendNote("");
    setSendError("");
    setSendOpen(true);
  }

  function openBuyerPanel(intent: "edit" | "pdf" | "send") {
    setBuyerIntent(intent);
    setBuyerError("");
    setBuyerOpen(true);
  }

  function closeBuyerPanel() {
    setBuyerOpen(false);
    setBuyerIntent(null);
    setBuyerError("");
  }

  function requestPdf() {
    if (!form.id) {
      setMsg("Save the quote before downloading PDF");
      return;
    }
    if (buyerGaps(form).length > 0) {
      openBuyerPanel("pdf");
      return;
    }
    void downloadPdf();
  }

  function requestSend() {
    if (!form.id) {
      setMsg("Save the quote before sending");
      return;
    }
    if (buyerGaps(form).length > 0) {
      openBuyerPanel("send");
      return;
    }
    openSendModal();
  }

  async function confirmBuyer() {
    const gaps = buyerGaps(form);
    if (buyerIntent !== "edit" && gaps.length > 0) {
      setBuyerError(`Fill ${gaps.join(", ")} before continuing.`);
      return;
    }
    const intent = buyerIntent;
    closeBuyerPanel();
    if (intent === "pdf") {
      void downloadPdf();
      return;
    }
    if (intent === "send") {
      openSendModal();
    }
  }

  useEffect(() => {
    if (searchIdx == null || searchQ.trim().length < 1) {
      const timeout = setTimeout(() => setHits([]), 0);
      return () => clearTimeout(timeout);
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products?q=${encodeURIComponent(searchQ)}&active=true&take=25`);
      const data = await res.json();
      setHits(Array.isArray(data) ? data : []);
    }, 200);
    return () => clearTimeout(t);
  }, [searchQ, searchIdx]);

  const calc = useMemo(() => {
    return calculateQuoteTotals({
      lines: form.lineItems.map((l) => ({
        qty: l.qty,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      })),
      withGst: form.withGst,
      buyerState: form.buyerState,
      sellerState,
      gstMode: form.gstMode,
      deliveryCharge: form.deliveryCharge,
      discountPercent: form.discountPercent,
      discountAmount: form.discountAmount,
      otherTaxAmount: form.otherTaxAmount,
      overrides: { ...form.manualOverrides, gstAmount: false },
      previous: {
        subtotal: form.subtotal,
        gstAmount: form.gstAmount,
        otherTaxAmount: form.otherTaxAmount,
        deliveryCharge: form.deliveryCharge,
        discountAmount: form.discountAmount,
        grandTotal: form.grandTotal,
      },
    });
  }, [form, sellerState]);

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setForm((f) => {
      const lineItems = f.lineItems.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      return { ...f, lineItems };
    });
  }

  function addLine() {
    setForm((f) => ({
      ...f,
      lineItems: [
        ...f.lineItems,
        {
          key: newKey(),
          productId: null,
          description: "",
          aliasName: "",
          qty: 1,
          unit: "pcs",
          unitPrice: 0,
          taxRate: 18,
          hsnCode: "",
        },
      ],
    }));
  }

  function copyProductNamesToAliases() {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((l) => ({
        ...l,
        aliasName: (l.catalogName || l.aliasName).trim(),
      })),
    }));
  }

  function removeLine(idx: number) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.filter((_, i) => i !== idx),
    }));
  }

  function pickProduct(idx: number, p: ProductHit) {
    updateLine(idx, {
      productId: p.id,
      catalogName: p.name,
      description: p.description || "",
      aliasName: p.name,
      unit: p.unit,
      unitPrice:
        (p.sellPrice && p.sellPrice > 0
          ? p.sellPrice
          : p.lastPrice && p.lastPrice > 0
            ? p.lastPrice
            : p.mrp && p.mrp > 0
              ? p.mrp
              : p.offerPrice) || 0,
      taxRate: p.taxRate,
      hsnCode: p.hsnCode || "",
    });
    setSearchIdx(null);
    setSearchQ("");
    setHits([]);
  }

  function setOverride(field: keyof ManualOverrides, value: number) {
    setForm((f) => ({
      ...f,
      [field]: value,
      manualOverrides: { ...f.manualOverrides, [field]: true },
    }));
  }

  function resetCalculations() {
    setForm((f) => ({
      ...f,
      manualOverrides: {},
      subtotal: undefined,
      gstAmount: undefined,
      grandTotal: undefined,
    }));
  }

  async function fetchBuyerFromGstin() {
    const value = form.buyerGstin.trim().toUpperCase();
    if (value.length !== 15) {
      setGstinMsg("Enter a valid 15-character GSTIN");
      return;
    }
    setGstinFetching(true);
    setGstinMsg("");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "gstin", gstin: value, save: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.verification?.message || "GSTIN lookup failed");
      }
      const v = data.verification || {};
      const a = data.address || {};
      const companyName = (v.legalName || v.tradeName || "").trim();
      const address = formatGstAddress({
        addressLine1: a.addressLine1 || v.address,
        addressLine2: a.addressLine2,
        city: a.city,
        state: a.state || v.stateName,
        postalCode: a.postalCode,
        fallback: v.address,
      });
      const state = matchIndianState(a.state || v.stateName);
      setForm((f) => ({
        ...f,
        buyerGstin: value,
        buyerCompany: companyName || f.buyerCompany,
        buyerAddress: address || f.buyerAddress,
        buyerState: state || f.buyerState,
        withGst: true,
      }));
      setGstinMsg(
        v.message ||
          (companyName
            ? `Filled from GST portal: ${companyName}`
            : "Details fetched from GST portal")
      );
    } catch (e) {
      setGstinMsg(e instanceof Error ? e.message : "GSTIN lookup failed");
    } finally {
      setGstinFetching(false);
    }
  }

  async function applySelectedClient(client: ClientHit | null) {
    if (!client) return;
    setForm((f) => ({
      ...f,
      buyerCompany: client.legalName || client.tradeName || f.buyerCompany,
      buyerName: client.managedByName || f.buyerName,
      buyerEmail: client.email || f.buyerEmail,
      buyerPhone: client.phone || f.buyerPhone,
      buyerGstin: (client.gstin || f.buyerGstin).toUpperCase(),
    }));
    try {
      const res = await fetch(`/api/parties/${client.id}`);
      if (!res.ok) return;
      const full = await res.json();
      const a = full.billingAddress as
        | {
            addressLine1?: string;
            addressLine2?: string | null;
            city?: string;
            state?: string;
            postalCode?: string;
          }
        | null;
      const address = a
        ? formatGstAddress({
            addressLine1: a.addressLine1,
            addressLine2: a.addressLine2 || undefined,
            city: a.city,
            state: a.state,
            postalCode: a.postalCode,
          })
        : "";
      const state = matchIndianState(a?.state);
      setForm((f) => ({
        ...f,
        buyerCompany: full.legalName || f.buyerCompany,
        buyerName: full.managedByName || f.buyerName,
        buyerEmail: full.email || f.buyerEmail,
        buyerPhone: full.phone || f.buyerPhone,
        buyerGstin: (full.gstin || f.buyerGstin || "").toUpperCase(),
        buyerAddress: address || f.buyerAddress,
        buyerState: state || f.buyerState,
      }));
    } catch {
      // Slim autocomplete fields already applied
    }
  }

  async function saveQuote(status?: "DRAFT" | "SENT") {
    setSaving(true);
    setMsg("");

    const payload = {
      buyerName: form.buyerName,
      buyerCompany: form.buyerCompany,
      buyerEmail: form.buyerEmail,
      buyerPhone: form.buyerPhone,
      buyerState: form.buyerState,
      buyerAddress: form.buyerAddress,
      buyerGstin: form.buyerGstin.trim().toUpperCase(),
      withGst: form.withGst,
      showHsn: form.showHsn,
      gstMode: form.gstMode,
      deliveryCharge: calc.deliveryCharge,
      discountPercent: form.discountPercent,
      discountAmount: calc.discountAmount,
      otherTaxAmount: calc.otherTaxAmount,
      otherTaxLabel: form.otherTaxLabel,
      notes: "",
      quoteNumber: form.quoteNumber,
      introText: form.introText,
      termsText: form.termsText,
      closingText: form.closingText,
      quoteDate: form.quoteDate,
      status: status || form.status,
      manualOverrides: form.manualOverrides,
      subtotal: calc.subtotal,
      gstAmount: calc.gstAmount,
      grandTotal: calc.grandTotal,
      lineItems: form.lineItems.map((l, i) => ({
        productId: l.productId,
        description: l.description,
        aliasName: l.aliasName,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        sortOrder: i,
      })),
    };

    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/quotes/${form.id}` : "/api/quotes", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      setMsg(typeof err.error === "string" ? err.error : "Save failed");
      return false;
    }

    const saved = await res.json();
    setMsg("Saved");
    if (!isEdit) {
      router.push(`/quotes/${saved.id}`);
      router.refresh();
    } else {
      setForm((f) => ({ ...f, quoteNumber: saved.quoteNumber, status: saved.status }));
      router.refresh();
    }
    return true;
  }

  async function onSave(e: FormEvent, status?: "DRAFT" | "SENT") {
    e.preventDefault();
    await saveQuote(status);
  }

  async function downloadPdf() {
    if (!form.id) {
      setMsg("Save the quote before downloading PDF");
      return;
    }
    const saved = await saveQuote();
    if (!saved) return;
    const res = await fetch(`/api/quotes/${form.id}/pdf`);
    if (!res.ok) {
      setMsg("PDF generation failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.quoteNumber || "quote"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sendQuote() {
    if (!form.id) return;
    const to = sendTo.trim();
    if (!to) {
      setSendError("Enter who to send this quote to.");
      return;
    }
    setSending(true);
    setSendError("");
    setMsg("");

    // Persist latest buyer fields before sending
    const saveRes = await fetch(`/api/quotes/${form.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerName: form.buyerName,
        buyerCompany: form.buyerCompany,
        buyerEmail: form.buyerEmail,
        buyerPhone: form.buyerPhone,
        buyerState: form.buyerState,
        buyerAddress: form.buyerAddress,
        buyerGstin: form.buyerGstin.trim().toUpperCase(),
        withGst: form.withGst,
        showHsn: form.showHsn,
        gstMode: form.gstMode,
        deliveryCharge: calc.deliveryCharge,
        discountPercent: form.discountPercent,
        discountAmount: calc.discountAmount,
        otherTaxAmount: calc.otherTaxAmount,
        otherTaxLabel: form.otherTaxLabel,
        notes: "",
        quoteNumber: form.quoteNumber,
        introText: form.introText,
        termsText: form.termsText,
        closingText: form.closingText,
        quoteDate: form.quoteDate,
        status: form.status,
        manualOverrides: form.manualOverrides,
        subtotal: calc.subtotal,
        gstAmount: calc.gstAmount,
        grandTotal: calc.grandTotal,
        lineItems: form.lineItems.map((l, i) => ({
          productId: l.productId,
          description: l.description,
          aliasName: l.aliasName,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          sortOrder: i,
        })),
      }),
    });
    if (!saveRes.ok) {
      setSending(false);
      setSendError("Could not save quote before sending");
      return;
    }

    const res = await fetch(`/api/quotes/${form.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: sendChannel,
        to,
        note: sendNote.trim() || undefined,
      }),
    });
    setSending(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSendError(
        typeof err.error === "string" ? err.error : "Send failed"
      );
      return;
    }

    setForm((f) => ({ ...f, status: "SENT" }));
    setSendOpen(false);
    setMsg(
      sendChannel === "EMAIL"
        ? `Quote emailed to ${to}`
        : `Quote sent to ${to}`
    );
    router.refresh();
  }

  const hasOverrides = Object.values(form.manualOverrides).some(Boolean);
  const destinationLabel =
    sendChannel === "EMAIL" ? "Email address" : "WhatsApp number";
  const destinationPlaceholder =
    sendChannel === "EMAIL" ? "buyer@company.com" : "+919876543210";

  function renderBuyerFields() {
    return (
      <div className="space-y-3">
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">GSTIN</span>
          <div className="flex gap-1.5">
            <input
              value={form.buyerGstin}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  buyerGstin: e.target.value.toUpperCase(),
                }))
              }
              maxLength={15}
              placeholder="15-character GSTIN"
              className="min-w-0 flex-1 rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:border-mid-green"
            />
            <button
              type="button"
              onClick={fetchBuyerFromGstin}
              disabled={gstinFetching || form.buyerGstin.trim().length !== 15}
              className="shrink-0 rounded-lg border border-mid-green/40 px-2.5 py-1.5 text-xs hover:bg-mid-green/10 disabled:opacity-50"
            >
              {gstinFetching ? "…" : "Fetch"}
            </button>
          </div>
          {gstinMsg ? (
            <p className="mt-1 text-xs text-dark-primary">{gstinMsg}</p>
          ) : null}
        </label>
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">
            Company (official name)
          </span>
          <ClientCompanyField
            name="buyerCompany"
            value={form.buyerCompany}
            email={form.buyerEmail}
            phone={form.buyerPhone}
            placeholder="Type client name or initials"
            onChange={(next) =>
              setForm((f) => ({ ...f, buyerCompany: next }))
            }
            onSelectClient={(client) => void applySelectedClient(client)}
          />
        </label>
        {(
          [
            ["buyerName", "Contact"],
            ["buyerEmail", "Email"],
            ["buyerPhone", "Phone"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-xs">
            <span className="mb-0.5 block text-mid-green">{label}</span>
            <input
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
              className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
            />
          </label>
        ))}
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">State (for GST)</span>
          <select
            value={form.buyerState}
            onChange={(e) =>
              setForm((f) => ({ ...f, buyerState: e.target.value }))
            }
            className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">Address</span>
          <textarea
            value={form.buyerAddress}
            onChange={(e) =>
              setForm((f) => ({ ...f, buyerAddress: e.target.value }))
            }
            rows={3}
            className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
          />
        </label>
      </div>
    );
  }

  function renderPreviewSidebar() {
    const gaps = buyerGaps(form);
    const titles: Record<PreviewSection, { title: string; hint: string }> = {
      buyer: { title: "Buyer", hint: "Appears on the quotation" },
      details: { title: "Date & ref no", hint: "Shown at the top of the quotation" },
      intro: { title: "Intro message", hint: "Shown after Dear Sir" },
      terms: { title: "Terms & conditions", hint: "Shown below the items table" },
    };
    const heading = titles[previewSection];
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
          }
        }}
      >
        <div className="flex items-start justify-between gap-2 border-b border-light-green/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-mid-green">{heading.title}</h2>
            <p className="mt-0.5 text-[11px] text-mid-green/80">{heading.hint}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {previewSection === "buyer" ? (
            <>
              {gaps.length > 0 ? (
                <p className="mb-3 rounded-lg bg-mid-green/10 px-3 py-2 text-xs text-dark-secondary">
                  Fill {gaps.join(", ")} so they show on the quote.
                </p>
              ) : null}
              {renderBuyerFields()}
            </>
          ) : null}
          {previewSection === "details" ? (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="mb-0.5 block text-mid-green">Ref no</span>
                <input
                  value={form.quoteNumber || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quoteNumber: e.target.value }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                  placeholder="Q-2026-0001"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block text-mid-green">Date</span>
                <input
                  type="date"
                  value={form.quoteDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quoteDate: e.target.value }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                />
              </label>
            </div>
          ) : null}
          {previewSection === "intro" ? (
            <label className="block text-xs">
              <span className="mb-0.5 block text-mid-green">Message</span>
              <textarea
                value={form.introText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, introText: e.target.value }))
                }
                rows={8}
                className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
              />
            </label>
          ) : null}
          {previewSection === "terms" ? (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="mb-0.5 block text-mid-green">Terms</span>
                <textarea
                  value={form.termsText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, termsText: e.target.value }))
                  }
                  rows={6}
                  className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block text-mid-green">Closing</span>
                <textarea
                  value={form.closingText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, closingText: e.target.value }))
                  }
                  rows={8}
                  className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderPreviewModal() {
    return (
      <QuotePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        quoteNumber={form.quoteNumber}
        quoteDate={form.quoteDate}
        introText={form.introText}
        termsText={form.termsText}
        closingText={form.closingText}
        company={company}
        buyer={{
          name: form.buyerName,
          company: form.buyerCompany,
          email: form.buyerEmail,
          phone: form.buyerPhone,
          state: form.buyerState,
          address: form.buyerAddress,
          gstin: form.buyerGstin,
        }}
        withGst={form.withGst}
        showHsn={form.showHsn}
        onRemoveHsn={() => setHsnConfirmOpen(true)}
        otherTaxLabel={form.otherTaxLabel}
        lineItems={form.lineItems}
        calc={calc}
        activeSection={previewSection}
        onSelectSection={setPreviewSection}
        sidebar={renderPreviewSidebar()}
      />
    );
  }

  return (
    <form onSubmit={(e) => onSave(e)} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {form.id ? form.quoteNumber || "Edit quote" : "New quote"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openBuyerPanel("edit")}
            className="inline-flex items-center gap-2 rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
          >
            <Building2 className="h-4 w-4 shrink-0 text-mid-green" strokeWidth={1.5} />
            <span className="truncate">
              {form.buyerCompany.trim() || "Add buyer details"}
            </span>
            {buyerGaps(form).length > 0 ? (
              <span className="rounded-full bg-mid-green/15 px-2 py-0.5 text-[11px] text-mid-green">
                Incomplete
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              setPreviewSection("buyer");
              setPreviewOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
            title="Preview quote"
          >
            <Eye className="h-4 w-4 text-mid-green" strokeWidth={1.5} />
            Preview
          </button>
          {form.id ? (
            <button
              type="button"
              onClick={requestPdf}
              className="inline-flex items-center gap-2 rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20"
            >
              <Download className="h-4 w-4 text-mid-green" strokeWidth={1.5} />
              PDF
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving || sending}
            className="rounded-lg border border-mid-green/40 px-4 py-2 text-sm font-medium text-mid-green hover:bg-light-green/20 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={saving || sending}
            onClick={requestSend}
            className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            <Send className="h-4 w-4" strokeWidth={1.5} />
            Send quote
          </button>
        </div>
      </div>

      {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}

      {renderPreviewModal()}

      {sendOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-quote-title"
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="send-quote-title" className="text-lg font-semibold">
                  Send quote
                </h2>
                <p className="mt-1 text-sm text-mid-green">{sendHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setSendOpen(false)}
                className="rounded-lg p-1 hover:bg-light-green/20"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">Send via</span>
                <select
                  value={sendChannel}
                  onChange={(e) => {
                    const next = e.target.value as QuoteSendChannel;
                    setSendChannel(next);
                    setSendError("");
                    if (next === "EMAIL") {
                      setSendTo(
                        form.buyerEmail.trim() ||
                          sendContext?.customerEmail?.trim() ||
                          (sendDefaults.suggestedChannel === "EMAIL"
                            ? sendDefaults.suggestedTo
                            : "")
                      );
                    } else {
                      setSendTo(
                        form.buyerPhone.trim() ||
                          sendContext?.customerPhone?.trim() ||
                          (sendDefaults.suggestedChannel === "WHATSAPP"
                            ? sendDefaults.suggestedTo
                            : "")
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                >
                  <option value="EMAIL">Email</option>
                  <option value="WHATSAPP">WhatsApp (coming soon)</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">
                  {destinationLabel}
                </span>
                <input
                  value={sendTo}
                  onChange={(e) => {
                    setSendTo(e.target.value);
                    setSendError("");
                  }}
                  placeholder={destinationPlaceholder}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
                <span className="mt-1 block text-xs text-mid-green/80">
                  Pre-filled from the inbound channel — change freely if needed.
                </span>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">
                  Note (optional)
                </span>
                <textarea
                  value={sendNote}
                  onChange={(e) => setSendNote(e.target.value)}
                  rows={2}
                  placeholder="Add a short note for the buyer"
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>

              {sendChannel === "WHATSAPP" ? (
                <p className="rounded-lg bg-light-green/20 px-3 py-2 text-sm text-dark-secondary">
                  WhatsApp delivery is not wired up yet. Download the PDF and
                  share manually, or switch to email — then use Mark sent below.
                </p>
              ) : null}

              {sendError ? (
                <p className="text-sm text-dark-primary">{sendError}</p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={saving || sending}
                onClick={async (e) => {
                  await onSave(e, "SENT");
                  setSendOpen(false);
                }}
                className="text-sm text-mid-green underline-offset-2 hover:underline disabled:opacity-60"
              >
                Mark sent without sending
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSendOpen(false)}
                  className="rounded-lg border border-light-green/50 px-3 py-2 text-sm hover:bg-light-green/20"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending || sendChannel === "WHATSAPP"}
                  onClick={sendQuote}
                  className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
                >
                  <Send className="h-4 w-4" strokeWidth={1.5} />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {buyerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="buyer-details-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="buyer-details-title" className="text-lg font-semibold">
                  {buyerIntent === "pdf"
                    ? "Fill buyer details to generate PDF"
                    : buyerIntent === "send"
                      ? "Fill buyer details to send quote"
                      : "Buyer details"}
                </h2>
                <p className="mt-1 text-sm text-mid-green">
                  Company name, address, and state are required on the quotation.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBuyerPanel}
                className="rounded-lg p-1 hover:bg-light-green/20"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            <div className="mt-5">
              {buyerError ? (
                <p className="mb-3 text-sm text-dark-primary">{buyerError}</p>
              ) : null}
              {renderBuyerFields()}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeBuyerPanel}
                className="rounded-lg border border-light-green/50 px-3 py-2 text-sm hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmBuyer()}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
              >
                {buyerIntent === "pdf"
                  ? "Continue to PDF"
                  : buyerIntent === "send"
                    ? "Continue to send"
                    : "Done"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hsnConfirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 px-4"
          onClick={() => setHsnConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hsn-confirm-title"
            className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="hsn-confirm-title" className="text-lg font-semibold">
              Remove HSN column?
            </h2>
            <p className="mt-2 text-sm text-mid-green">
              Some clients do not need HSN on the quotation. This will hide the
              HSN line from this quote, including the preview and PDF.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setHsnConfirmOpen(false)}
                className="rounded-lg border border-light-green/50 px-3 py-2 text-sm hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, showHsn: false }));
                  setHsnConfirmOpen(false);
                }}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
              >
                Remove HSN
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
            <section className="min-w-0 rounded-xl bg-white/40 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-mid-green">Line items</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs sm:text-sm">
                    <input
                      type="checkbox"
                      checked={form.withGst}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, withGst: e.target.checked }))
                      }
                    />
                    With GST
                  </label>
                  {form.showHsn ? null : (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, showHsn: true }))}
                      className="inline-flex items-center gap-1 rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-pale-green/40 sm:text-sm"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Add HSN
                    </button>
                  )}
                  <select
                    value={form.gstMode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        gstMode: e.target.value as QuoteFormState["gstMode"],
                      }))
                    }
                    className="rounded-lg border border-light-green/40 bg-background px-2 py-1.5 text-xs sm:text-sm"
                  >
                    <option value="AUTO">GST auto</option>
                    <option value="CGST_SGST">CGST + SGST</option>
                    <option value="IGST">IGST</option>
                  </select>
                  <button
                    type="button"
                    onClick={copyProductNamesToAliases}
                    className="inline-flex items-center gap-1 rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-pale-green/40 sm:text-sm"
                    title="Copy each product name into Alias name"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Use product names
                  </button>
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1 rounded-lg bg-mid-green/10 px-2.5 py-1.5 text-xs text-mid-green hover:bg-mid-green/20 sm:text-sm"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Add
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="text-mid-green">
                    <tr>
                      <th className="pb-2 font-medium">Product</th>
                      <th className="min-w-[12rem] pb-2 font-medium">Description</th>
                      <th className="w-28 pb-2 font-medium">Alias</th>
                      {form.showHsn ? (
                        <th className="w-24 pb-2 font-medium">
                          <span className="inline-flex items-center gap-1">
                            HSN
                            <button
                              type="button"
                              onClick={() => setHsnConfirmOpen(true)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-light-green/50 text-mid-green hover:bg-light-green/20"
                              title="Remove HSN column from quotation"
                              aria-label="Remove HSN column"
                            >
                              <Minus className="h-3 w-3" strokeWidth={2.5} />
                            </button>
                          </span>
                        </th>
                      ) : null}
                      <th className="w-16 pb-2 font-medium">Qty</th>
                      <th className="w-16 pb-2 font-medium">Unit</th>
                      <th className="w-28 pb-2 font-medium">Price</th>
                      <th className="w-16 pb-2 font-medium">Tax%</th>
                      <th className="w-32 pb-2 text-right font-medium">Total</th>
                      <th className="w-8 pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineItems.map((line, idx) => (
                      <tr
                        key={line.key}
                        className={idx % 2 === 1 ? "bg-light-green/10" : undefined}
                      >
                        <td className="py-2 pr-2 align-top">
                          <div className="relative">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchIdx(idx);
                                  setSearchQ("");
                                }}
                                className="inline-flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-lg border border-light-green/40 text-mid-green hover:bg-light-green/20"
                                title="Search catalog"
                                aria-label="Search catalog"
                              >
                                <Search className="h-4 w-4" strokeWidth={1.5} />
                              </button>
                              <span
                                className="min-w-0 flex-1 truncate text-xs text-mid-green"
                                title={line.catalogName || undefined}
                              >
                                {line.catalogName || "Search catalog"}
                              </span>
                            </div>
                            {searchIdx === idx ? (
                              <div className="absolute left-0 right-0 z-20 mt-1 min-w-[240px] rounded-lg border border-light-green/40 bg-background p-2 shadow-lg">
                                <input
                                  autoFocus
                                  value={searchQ}
                                  onChange={(e) => setSearchQ(e.target.value)}
                                  placeholder="Search code or name…"
                                  className="mb-2 w-full rounded border border-light-green/40 px-2 py-1.5 text-sm outline-none"
                                />
                                <div className="max-h-40 overflow-y-auto">
                                  {hits.map((h) => (
                                    <button
                                      key={h.id}
                                      type="button"
                                      onClick={() => pickProduct(idx, h)}
                                      className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-light-green/20"
                                    >
                                      <span className="font-medium">{h.code}</span> —{" "}
                                      {h.name}
                                      <span className="ml-2 text-xs text-mid-green">
                                        {formatMoney(h.offerPrice)}
                                      </span>
                                    </button>
                                  ))}
                                  {searchQ && hits.length === 0 ? (
                                    <p className="px-2 py-2 text-xs text-mid-green">
                                      No matches
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSearchIdx(null)}
                                  className="mt-1 text-xs text-mid-green"
                                >
                                  Close
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <input
                            value={line.description}
                            onChange={(e) =>
                              updateLine(idx, { description: e.target.value })
                            }
                            className="w-full min-w-[12rem] rounded-lg border border-light-green/40 bg-background px-2 py-1.5 outline-none focus:border-mid-green"
                            placeholder="Description"
                            title="Fetched from the product; edit as needed for this quote"
                          />
                        </td>
                        <td className="w-28 py-2 pr-2 align-top">
                          <input
                            value={line.aliasName}
                            onChange={(e) =>
                              updateLine(idx, { aliasName: e.target.value })
                            }
                            className="w-28 max-w-full rounded-lg border border-light-green/40 bg-background px-1.5 py-1.5 outline-none focus:border-mid-green"
                            placeholder="On quote"
                            title="Shown as the product name on the quotation"
                          />
                        </td>
                        {form.showHsn ? (
                          <td className="w-24 py-2 pr-2 align-top">
                            <input
                              value={line.hsnCode || ""}
                              onChange={(e) =>
                                updateLine(idx, { hsnCode: e.target.value })
                              }
                              className="w-24 max-w-full rounded-lg border border-light-green/40 bg-background px-1.5 py-1.5 outline-none focus:border-mid-green"
                              placeholder="—"
                              title="HSN shown on the quotation"
                            />
                          </td>
                        ) : null}
                        <td className="py-2 pr-1 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={line.qty}
                            onChange={(e) =>
                              updateLine(idx, { qty: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-light-green/40 bg-background px-1.5 py-1.5 outline-none"
                          />
                        </td>
                        <td className="py-2 pr-1 align-top">
                          <input
                            value={line.unit}
                            onChange={(e) =>
                              updateLine(idx, { unit: e.target.value })
                            }
                            className="w-full rounded-lg border border-light-green/40 bg-background px-1.5 py-1.5 outline-none"
                          />
                        </td>
                        <td className="py-2 pr-1 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(idx, { unitPrice: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-light-green/40 bg-background px-1.5 py-1.5 outline-none"
                          />
                        </td>
                        <td className="py-2 pr-1 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.taxRate}
                            onChange={(e) =>
                              updateLine(idx, { taxRate: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-light-green/40 bg-background px-1.5 py-1.5 outline-none"
                          />
                        </td>
                        <td className="w-32 py-2 pr-1 text-right align-top text-xs tabular-nums sm:text-sm">
                          {formatMoney(calc.lineTotals[idx] ?? 0)}
                        </td>
                        <td className="py-2 align-top">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="rounded p-1 text-mid-green hover:bg-light-green/30"
                            disabled={form.lineItems.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <div className="space-y-2.5 rounded-xl bg-white/40 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
              <h2 className="text-sm font-medium text-mid-green">Charges</h2>
              <div className="grid gap-2.5">
              <label className="block text-sm">
                <span className="mb-0.5 block text-xs text-mid-green">Discount %</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.discountPercent}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discountPercent: Number(e.target.value),
                      manualOverrides: {
                        ...f.manualOverrides,
                        discountAmount: false,
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-0.5 block text-xs text-mid-green">
                  Delivery / freight{" "}
                  {form.manualOverrides.deliveryCharge ? "(manual)" : ""}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={calc.deliveryCharge}
                  onChange={(e) =>
                    setOverride("deliveryCharge", Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-0.5 block text-xs text-mid-green">Other tax label</span>
                <input
                  value={form.otherTaxLabel}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, otherTaxLabel: e.target.value }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
                  placeholder="e.g. TCS"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-0.5 block text-xs text-mid-green">
                  Other tax amount{" "}
                  {form.manualOverrides.otherTaxAmount ? "(manual)" : ""}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={calc.otherTaxAmount}
                  onChange={(e) =>
                    setOverride("otherTaxAmount", Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
                />
              </label>
              </div>
            </div>

            <div className="rounded-xl bg-white/40 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-mid-green">Totals</h2>
                {hasOverrides ? (
                  <button
                    type="button"
                    onClick={resetCalculations}
                    className="inline-flex items-center gap-1 text-xs text-mid-green hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                    Reset calculations
                  </button>
                ) : null}
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center justify-between gap-4">
                  <span>
                    Subtotal {form.manualOverrides.subtotal ? "(manual)" : ""}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={calc.subtotal}
                    onChange={(e) =>
                      setOverride("subtotal", Number(e.target.value))
                    }
                    className="w-24 min-w-0 rounded border border-light-green/40 bg-background px-2 py-1 text-right outline-none"
                  />
                </label>
                <div className="flex justify-between text-mid-green">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    -{formatMoney(calc.discountAmount)}
                  </span>
                </div>
                {form.withGst && calc.gstSplit === "CGST_SGST" ? (
                  <>
                    <div className="flex justify-between">
                      <span>CGST</span>
                      <span className="tabular-nums">
                        {formatMoney(calc.cgstAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST</span>
                      <span className="tabular-nums">
                        {formatMoney(calc.sgstAmount)}
                      </span>
                    </div>
                  </>
                ) : null}
                {form.withGst && calc.gstSplit === "IGST" ? (
                  <div className="flex justify-between">
                    <span>IGST</span>
                    <span className="tabular-nums">
                      {formatMoney(calc.igstAmount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>GST total</span>
                  <span
                    className={`tabular-nums ${form.withGst ? "" : "opacity-40"}`}
                  >
                    {formatMoney(calc.gstAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Other tax</span>
                  <span className="tabular-nums">
                    {formatMoney(calc.otherTaxAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span className="tabular-nums">
                    {formatMoney(calc.deliveryCharge)}
                  </span>
                </div>
                <label className="flex items-center justify-between gap-4 border-t border-light-green/30 pt-3 text-base font-semibold">
                  <span>
                    Grand total{" "}
                    {form.manualOverrides.grandTotal ? "(manual)" : ""}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={calc.grandTotal}
                    onChange={(e) =>
                      setOverride("grandTotal", Number(e.target.value))
                    }
                    className="w-24 min-w-0 rounded border border-mid-green/50 bg-background px-2 py-1 text-right font-semibold outline-none"
                  />
                </label>
              </div>
            </div>
          </aside>
      </div>
    </form>
  );
}
