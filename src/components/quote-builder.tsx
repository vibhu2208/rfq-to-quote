"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Copy,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
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
  DEFAULT_QUOTE_UNIT,
  defaultQuoteTerms,
  normalizeQuoteUnit,
  quoteIntro,
  quoteUnitOptions,
  todayQuoteDateIso,
} from "@/lib/quote-format";
import {
  applyCatalogNamesToAliases,
  restoreLineAliases,
  snapshotLineAliases,
} from "@/lib/quote-line-alias";
import {
  ClientCompanyField,
  contactFieldsFromClient,
  type ClientContactHit,
  type ClientHit,
} from "@/components/client-company-field";
import { downloadQuotePdf, printQuotePdf } from "@/lib/quote-pdf-client";
import { QuoteAttachmentsDialog } from "@/components/quote-attachments-dialog";

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
  quoteName: string;
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
  quoteName: "",
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
      unit: DEFAULT_QUOTE_UNIT,
      unitPrice: 0,
      taxRate: 18,
      hsnCode: "",
    },
  ],
});

function finiteAmount(n: number, fallback = 0) {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function quoteSavePayload(
  form: QuoteFormState,
  calc: ReturnType<typeof calculateQuoteTotals>,
  status?: "DRAFT" | "SENT"
) {
  return {
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
    quoteName: form.quoteName,
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
      qty: finiteAmount(l.qty),
      unit: normalizeQuoteUnit(l.unit),
      unitPrice: finiteAmount(l.unitPrice),
      taxRate: finiteAmount(l.taxRate),
      sortOrder: i,
    })),
  };
}

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
  const [aliasSnapshot, setAliasSnapshot] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState<QuoteFormState>(() =>
    withDocumentDefaults(initial || emptyQuote(), company)
  );
  const formRef = useRef(form);
  formRef.current = form;
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searchWeak, setSearchWeak] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAiLoading, setSearchAiLoading] = useState(false);
  const [searchAiDone, setSearchAiDone] = useState(false);
  const [searchAiError, setSearchAiError] = useState("");
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
  const [buyerContacts, setBuyerContacts] = useState<ClientContactHit[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

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

  function openSendModal(channel: QuoteSendChannel = "EMAIL") {
    if (!formRef.current.id) {
      setMsg("Could not save quote before sending");
      return;
    }
    setSendChannel(channel);
    if (channel === "EMAIL") {
      setSendTo(
        formRef.current.buyerEmail.trim() ||
          sendContext?.customerEmail?.trim() ||
          sendDefaults.suggestedTo
      );
      setSendHint("Sends the quotation PDF to this email.");
    } else {
      setSendTo(
        formRef.current.buyerPhone.trim() ||
          sendContext?.customerPhone?.trim() ||
          ""
      );
      setSendHint("WhatsApp sending will be connected later.");
    }
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
    void (async () => {
      const ok = await saveQuote();
      if (!ok || !formRef.current.id) {
        setMsg("Could not save quote before PDF");
        return;
      }
      if (buyerGaps(formRef.current).length > 0) {
        openBuyerPanel("pdf");
        return;
      }
      await downloadPdf();
    })();
  }

  function requestPrint() {
    void (async () => {
      const ok = await saveQuote();
      if (!ok || !formRef.current.id) {
        setMsg("Could not save quote before printing");
        return;
      }
      if (buyerGaps(formRef.current).length > 0) {
        openBuyerPanel("pdf");
        return;
      }
      try {
        await printQuotePdf(formRef.current.id);
      } catch {
        setMsg("Print failed");
      }
    })();
  }

  function requestSend() {
    void (async () => {
      const ok = await saveQuote();
      if (!ok || !formRef.current.id) {
        setMsg("Could not save quote before sending");
        return;
      }
      if (buyerGaps(formRef.current).length > 0) {
        openBuyerPanel("send");
        return;
      }
      openSendModal();
    })();
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

  function resetCatalogSearch() {
    setSearchIdx(null);
    setSearchQ("");
    setHits([]);
    setSearchWeak(false);
    setSearchLoading(false);
    setSearchAiLoading(false);
    setSearchAiDone(false);
    setSearchAiError("");
  }

  useEffect(() => {
    if (searchIdx == null || searchQ.trim().length < 1) {
      const timeout = setTimeout(() => {
        setHits([]);
        setSearchWeak(false);
        setSearchLoading(false);
      }, 0);
      return () => clearTimeout(timeout);
    }
    let cancelled = false;
    const query = searchQ.trim();
    const t = setTimeout(async () => {
      setSearchLoading(true);
      setSearchAiDone(false);
      setSearchAiError("");
      try {
        const res = await fetch(
          `/api/products?q=${encodeURIComponent(query)}&active=true&take=25&withMeta=1`
        );
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data)) {
          setHits(data);
          setSearchWeak(false);
        } else if (data && Array.isArray(data.products)) {
          setHits(data.products);
          setSearchWeak(Boolean(data.weak));
        } else {
          setHits([]);
          setSearchWeak(true);
        }
      } catch {
        if (!cancelled) {
          setHits([]);
          setSearchWeak(true);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQ, searchIdx]);

  async function searchCatalogWithAi() {
    const query = searchQ.trim();
    if (query.length < 2 || searchAiLoading) return;
    setSearchAiLoading(true);
    setSearchAiError("");
    try {
      const res = await fetch("/api/products/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
      });
      const data = await res.json().catch(() => ({}));
      if (searchQ.trim() !== query) return;
      if (!res.ok) {
        setSearchAiError(
          typeof data.error === "string" ? data.error : "AI search failed"
        );
        return;
      }
      setHits(Array.isArray(data.products) ? data.products : []);
      setSearchAiDone(true);
      setSearchWeak(false);
    } catch {
      if (searchQ.trim() === query) {
        setSearchAiError("AI search failed");
      }
    } finally {
      setSearchAiLoading(false);
    }
  }

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

  const calcRef = useRef(calc);
  const lastSavedJsonRef = useRef<string | null>(null);
  const baselineJsonRef = useRef<string | null>(null);
  const saveChainRef = useRef(Promise.resolve(true));
  calcRef.current = calc;

  const saveQuote = useCallback((status?: "DRAFT" | "SENT") => {
    const run = async () => {
      setSaving(true);
      try {
        for (;;) {
          const snapshot = formRef.current;
          const payload = quoteSavePayload(snapshot, calcRef.current, status);
          const json = JSON.stringify(payload);
          if (snapshot.id && json === lastSavedJsonRef.current && !status) {
            return true;
          }

          const isEdit = Boolean(snapshot.id);
          const res = await fetch(isEdit ? `/api/quotes/${snapshot.id}` : "/api/quotes", {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: json,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setMsg(typeof err.error === "string" ? err.error : "Save failed");
            return false;
          }

          const saved = await res.json();
          lastSavedJsonRef.current = json;
          const nextStatus: QuoteFormState["status"] =
            saved.status === "SENT" ? "SENT" : snapshot.status;
          const next: QuoteFormState = {
            ...formRef.current,
            id: saved.id || snapshot.id,
            quoteNumber: saved.quoteNumber || snapshot.quoteNumber,
            status: nextStatus,
          };
          formRef.current = next;
          if (
            next.id !== snapshot.id ||
            next.quoteNumber !== snapshot.quoteNumber ||
            next.status !== snapshot.status
          ) {
            setForm(next);
          }
          if (!isEdit && next.id && window.location.pathname.startsWith("/quotes/new")) {
            window.history.replaceState(window.history.state, "", `/quotes/${next.id}`);
          }

          const latest = JSON.stringify(
            quoteSavePayload(formRef.current, calcRef.current, status)
          );
          if (latest === json) return true;
        }
      } catch {
        setMsg("Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    };

    const next = saveChainRef.current.then(run, run);
    saveChainRef.current = next.then(
      () => true,
      () => true
    );
    return next;
  }, []);

  useEffect(() => {
    const json = JSON.stringify(quoteSavePayload(form, calc, form.status));
    if (baselineJsonRef.current === null) {
      baselineJsonRef.current = json;
      return;
    }
    if (json === baselineJsonRef.current || json === lastSavedJsonRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveQuote();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, calc, saveQuote]);

  useEffect(() => {
    const flush = () => {
      const json = JSON.stringify(
        quoteSavePayload(formRef.current, calcRef.current, formRef.current.status)
      );
      if (json === baselineJsonRef.current || json === lastSavedJsonRef.current) return;
      void saveQuote();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [saveQuote]);

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
          unit: DEFAULT_QUOTE_UNIT,
          unitPrice: 0,
          taxRate: 18,
          hsnCode: "",
        },
      ],
    }));
  }

  function copyProductNamesToAliases() {
    setAliasSnapshot((prev) => prev ?? snapshotLineAliases(form.lineItems));
    setForm((f) => ({ ...f, lineItems: applyCatalogNamesToAliases(f.lineItems) }));
  }

  function restoreProductAliases() {
    if (!aliasSnapshot) return;
    setForm((f) => ({
      ...f,
      lineItems: restoreLineAliases(f.lineItems, aliasSnapshot),
    }));
    setAliasSnapshot(null);
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
      unit: normalizeQuoteUnit(p.unit),
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
    resetCatalogSearch();
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

  function applyContact(contact: ClientContactHit | null, fallback?: ClientHit | null) {
    const fields = contact
      ? { name: contact.name, email: contact.email, phone: contact.phone }
      : fallback
        ? contactFieldsFromClient(fallback)
        : null;
    if (!fields) return;
    setForm((f) => ({
      ...f,
      buyerName: fields.name || f.buyerName,
      buyerEmail: fields.email || f.buyerEmail,
      buyerPhone: fields.phone || f.buyerPhone,
    }));
  }

  async function applySelectedClient(client: ClientHit | null) {
    if (!client) {
      setBuyerContacts([]);
      setSelectedContactId("");
      return;
    }
    const initialContacts = client.contacts || [];
    const initial = initialContacts.find((c) => c.isPrimary) || initialContacts[0] || null;
    setBuyerContacts(initialContacts);
    setSelectedContactId(initial?.id || "");
    const fields = contactFieldsFromClient(client);
    setForm((f) => ({
      ...f,
      buyerCompany: client.legalName || client.tradeName || f.buyerCompany,
      buyerName: fields.name || f.buyerName,
      buyerEmail: fields.email || f.buyerEmail,
      buyerPhone: fields.phone || f.buyerPhone,
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
      const contacts = Array.isArray(full.contacts) ? (full.contacts as ClientContactHit[]) : [];
      const primary = contacts.find((c) => c.isPrimary) || contacts[0] || null;
      setBuyerContacts(contacts);
      setSelectedContactId(primary?.id || "");
      const next = contactFieldsFromClient(full);
      setForm((f) => ({
        ...f,
        buyerCompany: full.legalName || f.buyerCompany,
        buyerName: next.name || f.buyerName,
        buyerEmail: next.email || f.buyerEmail,
        buyerPhone: next.phone || f.buyerPhone,
        buyerGstin: (full.gstin || f.buyerGstin || "").toUpperCase(),
        buyerAddress: address || f.buyerAddress,
        buyerState: state || f.buyerState,
      }));
    } catch {
      // Slim autocomplete fields already applied
    }
  }

  async function onSave(e: FormEvent, status?: "DRAFT" | "SENT") {
    e.preventDefault();
    await saveQuote(status);
  }

  async function downloadPdf() {
    const saved = await saveQuote();
    const id = formRef.current.id;
    if (!saved || !id) {
      setMsg("Could not save quote before PDF");
      return;
    }
    try {
      await downloadQuotePdf(id, formRef.current.quoteNumber || "quote");
    } catch {
      setMsg("PDF generation failed");
    }
  }

  async function sendQuote() {
    const to = sendTo.trim();
    if (!to) {
      setSendError("Enter who to send this quote to.");
      return;
    }
    setSending(true);
    setSendError("");
    setMsg("");

    const savedOk = await saveQuote();
    const id = formRef.current.id;
    if (!savedOk || !id) {
      setSending(false);
      setSendError("Could not save quote before sending");
      return;
    }

    const res = await fetch(`/api/quotes/${id}/send`, {
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
        {buyerContacts.length > 0 ? (
          <label className="block text-xs">
            <span className="mb-0.5 block text-mid-green">Point of contact</span>
            <select
              value={selectedContactId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedContactId(id);
                applyContact(buyerContacts.find((c) => c.id === id) || null);
              }}
              className="w-full rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
            >
              {buyerContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.designation ? ` · ${c.designation}` : ""}
                  {c.isPrimary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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

  const saveLabel = saving
    ? "Saving…"
    : msg === "Save failed" || msg.startsWith("Could not save")
      ? "Save failed"
      : form.id
        ? "Saved"
        : "Unsaved";
  const saveTone =
    saveLabel === "Save failed"
      ? "bg-dark-primary/10 text-dark-primary"
      : saveLabel === "Saving…"
        ? "bg-light-green/30 text-dark-secondary"
        : "bg-light-green/25 text-dark-secondary";
  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-light-green/35 bg-white text-mid-green hover:bg-light-green/15 disabled:opacity-60";
  const field =
    "h-8 rounded-md border border-light-green/35 bg-background px-2 text-sm outline-none focus:border-mid-green";
  const cellInput = `${field} w-full`;
  const numInput =
    `${cellInput} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
  const chargeInput =
    `${field} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

  return (
    <form onSubmit={(e) => onSave(e)} className="space-y-3 pb-8">
      <header className="flex flex-wrap items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight text-dark-primary">
          {form.id ? form.quoteNumber || "Edit quote" : "New quote"}
        </h1>
        <input
          value={form.quoteName}
          onChange={(e) => setForm((f) => ({ ...f, quoteName: e.target.value }))}
          placeholder="Quote name"
          aria-label="Quote name"
          className="h-8 min-w-[10rem] flex-1 rounded-md border border-light-green/30 bg-background px-2.5 text-sm outline-none placeholder:text-mid-green/55 focus:border-mid-green sm:max-w-xs"
        />
        <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px] font-medium capitalize text-dark-secondary">
          {form.status.toLowerCase()}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${saveTone}`}
          aria-live="polite"
        >
          {saveLabel}
        </span>
        <button
          type="button"
          onClick={() => openBuyerPanel("edit")}
          className="inline-flex h-8 max-w-[18rem] items-center gap-1.5 rounded-md border border-light-green/35 bg-white px-2 text-sm hover:bg-light-green/15"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-mid-green" strokeWidth={1.5} />
          <span className="truncate">
            {form.buyerCompany.trim() || "Add buyer"}
          </span>
          {buyerGaps(form).length > 0 ? (
            <span className="shrink-0 rounded-full bg-dark-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-dark-primary">
              Incomplete
            </span>
          ) : null}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setPreviewSection("buyer");
              setPreviewOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-mid-green px-2.5 text-sm font-medium text-background hover:bg-dark-secondary"
            title="Preview quote"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
            Preview
          </button>
          <button type="button" onClick={requestPdf} className={iconBtn} title="Download PDF" aria-label="Download PDF">
            <Download className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            disabled={saving || sending}
            onClick={requestSend}
            className={iconBtn}
            title="Email"
            aria-label="Email"
          >
            <Mail className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button type="button" onClick={requestPrint} className={iconBtn} title="Print" aria-label="Print">
            <Printer className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setWhatsAppOpen(true)}
            className={iconBtn}
            title="WhatsApp (coming soon)"
            aria-label="WhatsApp"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {form.id ? (
            <button
              type="button"
              onClick={() => setAttachOpen(true)}
              className={iconBtn}
              title="Attach note, screenshot, or file"
              aria-label="Upload"
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
      </header>

      {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}

      {renderPreviewModal()}

      {form.id ? (
        <QuoteAttachmentsDialog
          quoteId={form.id}
          quoteNumber={form.quoteNumber || "Quote"}
          quoteName={form.quoteName}
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
        />
      ) : null}

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

      {whatsAppOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">WhatsApp</h2>
              <button
                type="button"
                onClick={() => setWhatsAppOpen(false)}
                className="rounded-lg p-1 hover:bg-light-green/20"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            <p className="mt-3 text-sm text-mid-green">
              WhatsApp sending will be connected later. Use Email to send this quote for now.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setWhatsAppOpen(false)}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
              >
                OK
              </button>
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

      <div className="space-y-3">
            <section className="min-w-0 overflow-hidden rounded-xl bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-light-green/20 px-3 py-1.5">
                <h2 className="text-sm font-semibold text-dark-primary">
                  Line items
                  <span className="ml-1.5 font-normal text-mid-green">
                    {form.lineItems.length}
                  </span>
                </h2>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={form.withGst}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, withGst: e.target.checked }))
                      }
                    />
                    GST
                  </label>
                  {form.showHsn ? null : (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, showHsn: true }))}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.5} />
                      HSN
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
                    className="h-7 rounded-md border border-light-green/40 bg-background px-1.5 text-xs"
                  >
                    <option value="AUTO">GST auto</option>
                    <option value="CGST_SGST">CGST + SGST</option>
                    <option value="IGST">IGST</option>
                  </select>
                  <button
                    type="button"
                    onClick={copyProductNamesToAliases}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                    title="Copy each catalog product name onto the quote"
                  >
                    <Copy className="h-3 w-3" strokeWidth={1.5} />
                    Use names
                  </button>
                  {aliasSnapshot ? (
                    <button
                      type="button"
                      onClick={restoreProductAliases}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                      title="Restore the names that were on the quote before Use names"
                    >
                      <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                      Revert names
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-mid-green px-2 text-xs font-medium text-background hover:bg-dark-secondary"
                  >
                    <Plus className="h-3 w-3" strokeWidth={1.5} />
                    Add
                  </button>
                </div>
              </div>

              <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col />
                    <col />
                    {form.showHsn ? <col className="w-[6.75rem]" /> : null}
                    <col className="w-[4.25rem]" />
                    <col className="w-[4.75rem]" />
                    <col className="w-[6.25rem]" />
                    <col className="w-[3.75rem]" />
                    <col className="w-[6.5rem]" />
                    <col className="w-8" />
                  </colgroup>
                  <thead className="bg-dark-secondary/[0.04] text-[10px] uppercase tracking-wide text-mid-green">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Item</th>
                      <th className="px-2 py-1.5 font-medium">Description</th>
                      {form.showHsn ? (
                        <th className="px-1.5 py-1.5 font-medium">
                          <span className="inline-flex items-center gap-1">
                            HSN
                            <button
                              type="button"
                              onClick={() => setHsnConfirmOpen(true)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-light-green/50 text-mid-green hover:bg-light-green/20"
                              title="Remove HSN column from quotation"
                              aria-label="Remove HSN column"
                            >
                              <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        </th>
                      ) : null}
                      <th className="px-1.5 py-1.5 font-medium">Qty</th>
                      <th className="px-1.5 py-1.5 font-medium">Unit</th>
                      <th className="px-1.5 py-1.5 font-medium">Price</th>
                      <th className="px-1.5 py-1.5 font-medium">Tax%</th>
                      <th className="px-2 py-1.5 text-right font-medium">Total</th>
                      <th className="px-1 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineItems.map((line, idx) => (
                      <tr
                        key={line.key}
                        className="border-t border-light-green/15 hover:bg-light-green/10"
                      >
                        <td className="px-2 py-1.5 align-top">
                          <div className="relative">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  resetCatalogSearch();
                                  setSearchIdx(idx);
                                }}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-light-green/40 text-mid-green hover:bg-light-green/20"
                                title="Search catalog"
                                aria-label="Search catalog"
                              >
                                <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                              <input
                                value={line.aliasName}
                                onChange={(e) =>
                                  updateLine(idx, { aliasName: e.target.value })
                                }
                                className={cellInput}
                                placeholder="Name on quote"
                                title={
                                  line.catalogName
                                    ? `On quote · catalog: ${line.catalogName}`
                                    : "Shown as the product name on the quotation"
                                }
                              />
                            </div>
                            {searchIdx === idx ? (
                              <div className="absolute left-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-light-green/40 bg-background p-2 shadow-lg">
                                <input
                                  autoFocus
                                  value={searchQ}
                                  onChange={(e) => {
                                    setSearchQ(e.target.value);
                                    setSearchAiDone(false);
                                    setSearchAiError("");
                                  }}
                                  placeholder="Search code or name…"
                                  className="mb-2 w-full rounded border border-light-green/40 px-2 py-1.5 text-sm outline-none"
                                />
                                {searchWeak && searchQ.trim() && !searchAiDone && !searchLoading ? (
                                  <div className="mb-2 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                                    <p>
                                      Catalog match is weak — these may not be the right products.
                                    </p>
                                    <button
                                      type="button"
                                      disabled={searchAiLoading || searchQ.trim().length < 2}
                                      onClick={() => void searchCatalogWithAi()}
                                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-mid-green px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                                    >
                                      <Sparkles className="h-3 w-3" strokeWidth={2} />
                                      {searchAiLoading ? "Searching with AI…" : "Search with AI"}
                                    </button>
                                  </div>
                                ) : null}
                                {searchAiError ? (
                                  <p className="mb-2 px-1 text-xs text-red-700">{searchAiError}</p>
                                ) : null}
                                {searchAiDone ? (
                                  <p className="mb-1 px-1 text-[11px] text-mid-green">
                                    AI suggestions for this requirement
                                  </p>
                                ) : null}
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
                                  {searchLoading || searchAiLoading ? (
                                    <p className="px-2 py-2 text-xs text-mid-green">Searching…</p>
                                  ) : searchQ && hits.length === 0 ? (
                                    <p className="px-2 py-2 text-xs text-mid-green">
                                      {searchAiDone ? "AI found no catalog matches" : "No matches"}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={resetCatalogSearch}
                                  className="mt-1 text-xs text-mid-green"
                                >
                                  Close
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <input
                            value={line.description}
                            onChange={(e) =>
                              updateLine(idx, { description: e.target.value })
                            }
                            className={cellInput}
                            placeholder="Description"
                            title="Fetched from the product; edit as needed for this quote"
                          />
                        </td>
                        {form.showHsn ? (
                          <td className="px-1.5 py-1.5 align-top">
                            <input
                              value={line.hsnCode || ""}
                              onChange={(e) =>
                                updateLine(idx, { hsnCode: e.target.value })
                              }
                              className={`${cellInput} px-1 font-mono text-xs`}
                              placeholder="—"
                              title="HSN shown on the quotation"
                            />
                          </td>
                        ) : null}
                        <td className="px-1.5 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={line.qty}
                            onChange={(e) =>
                              updateLine(idx, { qty: Number(e.target.value) })
                            }
                            className={numInput}
                          />
                        </td>
                        <td className="px-1.5 py-1.5 align-top">
                          <select
                            value={normalizeQuoteUnit(line.unit)}
                            onChange={(e) =>
                              updateLine(idx, { unit: e.target.value })
                            }
                            className={`${cellInput} px-1`}
                            title="Unit"
                          >
                            {quoteUnitOptions(line.unit).map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(idx, { unitPrice: Number(e.target.value) })
                            }
                            className={numInput}
                          />
                        </td>
                        <td className="px-1.5 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.taxRate}
                            onChange={(e) =>
                              updateLine(idx, { taxRate: Number(e.target.value) })
                            }
                            className={numInput}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right align-middle text-sm font-medium tabular-nums text-dark-primary">
                          {formatMoney(calc.lineTotals[idx] ?? 0)}
                        </td>
                        <td className="px-1 py-1.5 align-middle">
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

              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-light-green/20 px-3 py-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-mid-green">Discount %</span>
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
                      className={`${chargeInput} w-[5.5rem]`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-mid-green">
                      Freight{form.manualOverrides.deliveryCharge ? " · man" : ""}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={calc.deliveryCharge}
                      onChange={(e) =>
                        setOverride("deliveryCharge", Number(e.target.value))
                      }
                      className={`${chargeInput} w-[6.5rem]`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-mid-green">Other tax</span>
                    <input
                      value={form.otherTaxLabel}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, otherTaxLabel: e.target.value }))
                      }
                      className={`${field} w-[6rem]`}
                      placeholder="TCS"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-mid-green">
                      Amount{form.manualOverrides.otherTaxAmount ? " · man" : ""}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={calc.otherTaxAmount}
                      onChange={(e) =>
                        setOverride("otherTaxAmount", Number(e.target.value))
                      }
                      className={`${chargeInput} w-[6.5rem]`}
                    />
                  </label>
                </div>
                <div className="min-w-[16rem] flex-1 space-y-1 text-xs sm:max-w-sm sm:flex-none">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-mid-green">Totals</span>
                    {hasOverrides ? (
                      <button
                        type="button"
                        onClick={resetCalculations}
                        className="inline-flex items-center gap-1 text-[10px] text-mid-green hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <label className="flex items-center justify-between gap-3">
                    <span>Subtotal {form.manualOverrides.subtotal ? "(manual)" : ""}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={calc.subtotal}
                      onChange={(e) =>
                        setOverride("subtotal", Number(e.target.value))
                      }
                      className="h-7 w-24 rounded border border-light-green/40 bg-background px-1.5 text-right text-xs outline-none"
                    />
                  </label>
                  {calc.discountAmount > 0 ? (
                    <div className="flex justify-between text-mid-green">
                      <span>Discount</span>
                      <span className="tabular-nums">-{formatMoney(calc.discountAmount)}</span>
                    </div>
                  ) : null}
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
                  <label className="flex items-center justify-between gap-3 rounded-md bg-dark-secondary px-2.5 py-1.5 text-background">
                    <span className="text-xs font-medium">
                      Grand total
                      {form.manualOverrides.grandTotal ? " · man" : ""}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={calc.grandTotal}
                      onChange={(e) =>
                        setOverride("grandTotal", Number(e.target.value))
                      }
                      aria-label="Grand total"
                      className="w-28 bg-transparent text-right text-sm font-semibold tabular-nums text-background outline-none"
                    />
                  </label>
                </div>
              </div>
            </section>
      </div>
    </form>
  );
}
