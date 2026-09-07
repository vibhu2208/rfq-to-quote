"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
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

type ProductHit = {
  id: string;
  code: string;
  name: string;
  unit: string;
  offerPrice: number;
  taxRate: number;
  description: string;
};

type LineItem = {
  key: string;
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
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
  withGst: boolean;
  gstMode: "AUTO" | "CGST_SGST" | "IGST";
  deliveryCharge: number;
  discountPercent: number;
  discountAmount: number;
  otherTaxAmount: number;
  otherTaxLabel: string;
  notes: string;
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
  sendContext?: QuoteSendContext;
};

function newKey() {
  return Math.random().toString(36).slice(2);
}

const emptyQuote = (): QuoteFormState => ({
  buyerName: "",
  buyerCompany: "",
  buyerEmail: "",
  buyerPhone: "",
  buyerState: "",
  buyerAddress: "",
  withGst: true,
  gstMode: "AUTO",
  deliveryCharge: 0,
  discountPercent: 0,
  discountAmount: 0,
  otherTaxAmount: 0,
  otherTaxLabel: "",
  notes: "",
  status: "DRAFT",
  manualOverrides: {},
  lineItems: [
    {
      key: newKey(),
      productId: null,
      description: "",
      qty: 1,
      unit: "pcs",
      unitPrice: 0,
      taxRate: 18,
    },
  ],
});

export function QuoteBuilder({ initial, sellerState, sendContext }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<QuoteFormState>(initial || emptyQuote());
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

  useEffect(() => {
    if (searchIdx == null || searchQ.trim().length < 1) {
      const timeout = setTimeout(() => setHits([]), 0);
      return () => clearTimeout(timeout);
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products?q=${encodeURIComponent(searchQ)}&active=true&take=8`);
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
      overrides: form.manualOverrides,
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
          qty: 1,
          unit: "pcs",
          unitPrice: 0,
          taxRate: 18,
        },
      ],
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
      description: p.name + (p.description ? ` — ${p.description}` : ""),
      unit: p.unit,
      unitPrice: p.offerPrice,
      taxRate: p.taxRate,
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

  async function onSave(e: FormEvent, status?: "DRAFT" | "SENT") {
    e.preventDefault();
    setSaving(true);
    setMsg("");

    const payload = {
      buyerName: form.buyerName,
      buyerCompany: form.buyerCompany,
      buyerEmail: form.buyerEmail,
      buyerPhone: form.buyerPhone,
      buyerState: form.buyerState,
      buyerAddress: form.buyerAddress,
      withGst: form.withGst,
      gstMode: form.gstMode,
      deliveryCharge: calc.deliveryCharge,
      discountPercent: form.discountPercent,
      discountAmount: calc.discountAmount,
      otherTaxAmount: calc.otherTaxAmount,
      otherTaxLabel: form.otherTaxLabel,
      notes: form.notes,
      status: status || form.status,
      manualOverrides: form.manualOverrides,
      subtotal: calc.subtotal,
      gstAmount: calc.gstAmount,
      grandTotal: calc.grandTotal,
      lineItems: form.lineItems.map((l, i) => ({
        productId: l.productId,
        description: l.description,
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
      return;
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
  }

  async function downloadPdf() {
    if (!form.id) {
      setMsg("Save the quote before downloading PDF");
      return;
    }
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
        withGst: form.withGst,
        gstMode: form.gstMode,
        deliveryCharge: calc.deliveryCharge,
        discountPercent: form.discountPercent,
        discountAmount: calc.discountAmount,
        otherTaxAmount: calc.otherTaxAmount,
        otherTaxLabel: form.otherTaxLabel,
        notes: form.notes,
        status: form.status,
        manualOverrides: form.manualOverrides,
        subtotal: calc.subtotal,
        gstAmount: calc.gstAmount,
        grandTotal: calc.grandTotal,
        lineItems: form.lineItems.map((l, i) => ({
          productId: l.productId,
          description: l.description,
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

  return (
    <form onSubmit={(e) => onSave(e)} className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {form.id ? form.quoteNumber || "Edit quote" : "New quote"}
          </h1>
          <p className="mt-1 text-sm text-mid-green">
            Line items auto-fill from catalog — every total stays editable
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {form.id ? (
            <button
              type="button"
              onClick={downloadPdf}
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
            onClick={openSendModal}
            className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            <Send className="h-4 w-4" strokeWidth={1.5} />
            Send quote
          </button>
        </div>
      </div>

      {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}

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

      <section className="grid gap-4 rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)] md:grid-cols-2">
        <h2 className="md:col-span-2 text-sm font-medium text-mid-green">Buyer</h2>
        {(
          [
            ["buyerCompany", "Company"],
            ["buyerName", "Contact name"],
            ["buyerEmail", "Email"],
            ["buyerPhone", "Phone"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="mb-1 block text-mid-green">{label}</span>
            <input
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="mb-1 block text-mid-green">State (for GST)</span>
          <select
            value={form.buyerState}
            onChange={(e) => setForm((f) => ({ ...f, buyerState: e.target.value }))}
            className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-mid-green">Address</span>
          <textarea
            value={form.buyerAddress}
            onChange={(e) => setForm((f) => ({ ...f, buyerAddress: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
          />
        </label>
      </section>

      <section className="rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-mid-green">Line items</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.withGst}
                onChange={(e) => setForm((f) => ({ ...f, withGst: e.target.checked }))}
              />
              With GST
            </label>
            <select
              value={form.gstMode}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  gstMode: e.target.value as QuoteFormState["gstMode"],
                }))
              }
              className="rounded-lg border border-light-green/40 bg-background px-2 py-1.5 text-sm"
            >
              <option value="AUTO">GST auto (state)</option>
              <option value="CGST_SGST">CGST + SGST</option>
              <option value="IGST">IGST</option>
            </select>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-lg bg-mid-green/10 px-3 py-1.5 text-sm text-mid-green hover:bg-mid-green/20"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Add line
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-mid-green">
              <tr>
                <th className="pb-2 font-medium">Product / description</th>
                <th className="pb-2 font-medium w-20">Qty</th>
                <th className="pb-2 font-medium w-20">Unit</th>
                <th className="pb-2 font-medium w-28">Price</th>
                <th className="pb-2 font-medium w-20">Tax%</th>
                <th className="pb-2 font-medium w-28 text-right">Line total</th>
                <th className="pb-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {form.lineItems.map((line, idx) => (
                <tr key={line.key} className={idx % 2 === 1 ? "bg-light-green/10" : undefined}>
                  <td className="py-2 pr-2 align-top">
                    <div className="relative">
                      <div className="mb-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchIdx(idx);
                            setSearchQ("");
                          }}
                          className="inline-flex items-center gap-1 rounded border border-light-green/40 px-2 py-1 text-xs text-mid-green hover:bg-light-green/20"
                        >
                          <Search className="h-3 w-3" strokeWidth={1.5} />
                          Catalog
                        </button>
                      </div>
                      {searchIdx === idx ? (
                        <div className="absolute z-20 mt-1 w-full min-w-[280px] rounded-lg border border-light-green/40 bg-background p-2 shadow-lg">
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
                                <span className="font-medium">{h.code}</span> — {h.name}
                                <span className="ml-2 text-xs text-mid-green">
                                  {formatMoney(h.offerPrice)}
                                </span>
                              </button>
                            ))}
                            {searchQ && hits.length === 0 ? (
                              <p className="px-2 py-2 text-xs text-mid-green">No matches</p>
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
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        className="w-full rounded-lg border border-light-green/40 bg-background px-2 py-1.5 outline-none focus:border-mid-green"
                        placeholder="Description"
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={line.qty}
                      onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                      className="w-full rounded-lg border border-light-green/40 bg-background px-2 py-1.5 outline-none"
                    />
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      value={line.unit}
                      onChange={(e) => updateLine(idx, { unit: e.target.value })}
                      className="w-full rounded-lg border border-light-green/40 bg-background px-2 py-1.5 outline-none"
                    />
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                      className="w-full rounded-lg border border-light-green/40 bg-background px-2 py-1.5 outline-none"
                    />
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.taxRate}
                      onChange={(e) => updateLine(idx, { taxRate: Number(e.target.value) })}
                      className="w-full rounded-lg border border-light-green/40 bg-background px-2 py-1.5 outline-none"
                    />
                  </td>
                  <td className="py-2 pr-2 text-right align-top tabular-nums">
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

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <h2 className="text-sm font-medium text-mid-green">Charges & notes</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Discount %</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.discountPercent}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  discountPercent: Number(e.target.value),
                  manualOverrides: { ...f.manualOverrides, discountAmount: false },
                }))
              }
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">
              Delivery / freight {form.manualOverrides.deliveryCharge ? "(manual)" : ""}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={calc.deliveryCharge}
              onChange={(e) => setOverride("deliveryCharge", Number(e.target.value))}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Other tax label</span>
            <input
              value={form.otherTaxLabel}
              onChange={(e) => setForm((f) => ({ ...f, otherTaxLabel: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
              placeholder="e.g. TCS"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">
              Other tax amount {form.manualOverrides.otherTaxAmount ? "(manual)" : ""}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={calc.otherTaxAmount}
              onChange={(e) => setOverride("otherTaxAmount", Number(e.target.value))}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none"
            />
          </label>
        </div>

        <div className="rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
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
                onChange={(e) => setOverride("subtotal", Number(e.target.value))}
                className="w-36 rounded border border-light-green/40 bg-background px-2 py-1 text-right outline-none"
              />
            </label>
            <div className="flex justify-between text-mid-green">
              <span>Discount</span>
              <span className="tabular-nums">-{formatMoney(calc.discountAmount)}</span>
            </div>
            {form.withGst && calc.gstSplit === "CGST_SGST" ? (
              <>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span className="tabular-nums">{formatMoney(calc.cgstAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span className="tabular-nums">{formatMoney(calc.sgstAmount)}</span>
                </div>
              </>
            ) : null}
            {form.withGst && calc.gstSplit === "IGST" ? (
              <div className="flex justify-between">
                <span>IGST</span>
                <span className="tabular-nums">{formatMoney(calc.igstAmount)}</span>
              </div>
            ) : null}
            <label className="flex items-center justify-between gap-4">
              <span>
                GST total {form.manualOverrides.gstAmount ? "(manual)" : ""}
              </span>
              <input
                type="number"
                step="0.01"
                value={calc.gstAmount}
                onChange={(e) => setOverride("gstAmount", Number(e.target.value))}
                disabled={!form.withGst}
                className="w-36 rounded border border-light-green/40 bg-background px-2 py-1 text-right outline-none disabled:opacity-40"
              />
            </label>
            <div className="flex justify-between">
              <span>Other tax</span>
              <span className="tabular-nums">{formatMoney(calc.otherTaxAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className="tabular-nums">{formatMoney(calc.deliveryCharge)}</span>
            </div>
            <label className="flex items-center justify-between gap-4 border-t border-light-green/30 pt-3 text-base font-semibold">
              <span>
                Grand total {form.manualOverrides.grandTotal ? "(manual)" : ""}
              </span>
              <input
                type="number"
                step="0.01"
                value={calc.grandTotal}
                onChange={(e) => setOverride("grandTotal", Number(e.target.value))}
                className="w-36 rounded border border-mid-green/50 bg-background px-2 py-1 text-right font-semibold outline-none"
              />
            </label>
          </div>
        </div>
      </section>
    </form>
  );
}
