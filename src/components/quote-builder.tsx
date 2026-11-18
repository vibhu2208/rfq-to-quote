"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Minus,
  Percent,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Store,
  Tag,
  Trash2,
  TrendingUp,
  Undo2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import {
  calculateQuoteTotals,
  describeGstAuto,
  formatMoney,
  hasManualMoneyOverride,
  type ManualOverrides,
} from "@/lib/tax";
import {
  clampQuoteUnitPrice,
  MAX_QUOTE_UNIT_PRICE,
} from "@/lib/accounting/money";
import { catalogBindingLooksMismatched } from "@/lib/product-match";
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
import { buyerRequiredGaps } from "@/lib/quote-buyer-required";
import {
  downloadQuotePdf,
  openPrintWindow,
  PRINT_BLOCKED_MESSAGE,
  printQuotePdf,
} from "@/lib/quote-pdf-client";
import { confirmZeroPricedExport } from "@/lib/quote-zero-price";
import { QuoteAttachmentsDialog } from "@/components/quote-attachments-dialog";
import { QuoteCalculator } from "@/components/quote-calculator";
import { CalcMoneyInput } from "@/components/calc-money-input";
import { useToast } from "@/components/app-toast";
import { QuoteDiscountDialog } from "@/components/quote-discount-dialog";
import { QuoteMarkupDialog } from "@/components/quote-markup-dialog";
import {
  QuoteRequirementSidebar,
  type QuoteRequirementContext,
} from "@/components/quote-requirement-sidebar";
import {
  MarketplacePriceStack,
  type MarketplacePriceStackValue,
} from "@/components/marketplace-price-stack";
import {
  CatalogPriceStack,
  catalogPricesFromProduct,
  type CatalogPriceStackValue,
} from "@/components/catalog-price-stack";
import { ProductDetailDialog } from "@/components/product-detail-dialog";
import { catalogProductRefLabel } from "@/lib/master-data";
import { marketplaceQueryFromText } from "@/lib/marketplace/summary";
import {
  applyPercentToLineDiscounts,
  clampDiscountPercent,
  effectiveUnitPrice,
  inferDiscountMethods,
  resolveDiscountApplication,
  uniformLineDiscountPercent,
  validateDiscountApplication,
  type QuoteDiscountMethods,
} from "@/lib/quote-discount";
import { applyMarkupPercentToLines, lineMargin } from "@/lib/quote-markup";
import { quoteAmountBlockReason } from "@/lib/quote-amount-limits";
import {
  BUYER_FIELD_FOCUS_ORDER,
  sanitizePhoneInput,
  validateBuyerDetails,
  type BuyerFieldErrors,
} from "@/lib/quote-buyer-fields";
import { hsnFieldError, sanitizeHsnInput } from "@/lib/hsn";
import { collectReadinessGaps } from "@/lib/quote-readiness";
import {
  composeCommercialTerms,
  extractIndianState,
  extractWarrantyAsk,
  parseCommercialTerms,
  rfqMentionsWarranty,
} from "@/lib/quote-commercial";
import {
  grossLineSubtotal,
  validateFixedDiscountAmount,
} from "@/lib/quote-discount";
import {
  clampWarrantyQty,
  normalizeWarrantyService,
  normalizeWarrantyUnit,
  WARRANTY_SERVICES,
  WARRANTY_UNITS,
  type WarrantyService,
  type WarrantyUnit,
} from "@/lib/quote-warranty";
import {
  cheapestVendorQuote,
  selectedVendorQuote,
  sortVendorQuotes,
  vendorQuotesForQuoteLine,
  vendorQuotesFromMatches,
  type QuoteVendorQuote,
} from "@/lib/quote-line-vendor-cost";
import type { VendorPriceMatch } from "@/lib/vendor-line-price";

type ProductHit = {
  id: string;
  code: string;
  sourceProductId?: string | null;
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
  /** Internal catalog SKU code (editor-only; not on preview/PDF/email). */
  catalogCode?: string;
  /** Excel ProductID when present (editor-only). */
  catalogSourceId?: string | null;
  description: string;
  aliasName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  costPrice?: number | null;
  costVendorName?: string;
  discountPercent?: number;
  warrantyQty?: number;
  warrantyUnit?: WarrantyUnit;
  warrantyService?: WarrantyService;
  vendorQuotes?: QuoteVendorQuote[];
  catalogLastPrice?: number | null;
  catalogOfferPrice?: number | null;
  catalogMrp?: number | null;
  taxRate: number;
  hsnCode?: string;
  /** True when the user marked this row as a custom, non-catalog line. */
  customItem?: boolean;
};

function catalogPricesFromLine(line: LineItem): CatalogPriceStackValue | null {
  const prices = catalogPricesFromProduct({
    lastPrice: line.catalogLastPrice,
    offerPrice: line.catalogOfferPrice,
    mrp: line.catalogMrp,
  });
  if (!prices.lastPrice && !prices.offerPrice && !prices.mrp) return null;
  return prices;
}

function vendorQuoteOptionKey(quote: Pick<QuoteVendorQuote, "vendorId" | "vendorName" | "unitPrice">) {
  return `${quote.vendorId || quote.vendorName}::${quote.unitPrice}`;
}

function vendorQuotesForLine(line: LineItem): QuoteVendorQuote[] {
  if (line.vendorQuotes && line.vendorQuotes.length > 0) {
    return sortVendorQuotes(line.vendorQuotes);
  }
  if (line.costPrice != null && line.costPrice > 0) {
    return [
      {
        vendorId: line.costVendorName || "vendor",
        vendorName: line.costVendorName || "Vendor",
        unitPrice: line.costPrice,
        source: "",
      },
    ];
  }
  return [];
}

function QuoteLineVendorCostCell({
  line,
  selectClassName,
  onChooseCost,
  onUseAsSell,
}: {
  line: LineItem;
  selectClassName: string;
  onChooseCost: (quote: QuoteVendorQuote) => void;
  onUseAsSell: (quote: QuoteVendorQuote) => void;
}) {
  const quotes = vendorQuotesForLine(line);
  if (quotes.length === 0) {
    return <div className="px-0.5 pt-1.5 text-right text-xs text-mid-green">—</div>;
  }
  const selected =
    selectedVendorQuote(quotes, line.costPrice, line.costVendorName) ?? quotes[0];
  const lowest = quotes[0];

  return (
    <div className="space-y-1 px-0.5 pt-0.5">
      <button
        type="button"
        className="block w-full text-right text-sm font-medium tabular-nums text-dark-primary"
        title="Copy this vendor cost into sell price"
        onClick={() => onUseAsSell(selected)}
      >
        {formatMoney(selected.unitPrice)}
      </button>
      {quotes.length === 1 ? (
        <div className="truncate text-[10px] text-mid-green" title={selected.vendorName}>
          {selected.vendorName}
          {selected.source ? ` · ${selected.source}` : ""}
        </div>
      ) : (
        <select
          value={vendorQuoteOptionKey(selected)}
          onChange={(e) => {
            const next = quotes.find((quote) => vendorQuoteOptionKey(quote) === e.target.value);
            if (next) onChooseCost(next);
          }}
          className={selectClassName}
          title={`${quotes.length} vendor quotes for this product`}
        >
          {quotes.map((quote) => (
            <option key={vendorQuoteOptionKey(quote)} value={vendorQuoteOptionKey(quote)}>
              {quote.vendorName} · {formatMoney(quote.unitPrice)}
              {quote.unitPrice === lowest.unitPrice ? " · lowest" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

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
  showUnit: boolean;
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
  /** Server version used to detect a save from another tab. */
  version?: number;
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
  quoteStatus?: string;
  lastReplyIntent?: string | null;
  rfqId?: string;
  requirementContext?: QuoteRequirementContext | null;
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
  return buyerRequiredGaps(form);
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
  showUnit: true,
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
      costPrice: null,
      costVendorName: "",
      discountPercent: 0,
      warrantyQty: 0,
      warrantyUnit: "years",
      warrantyService: "",
      taxRate: 18,
      hsnCode: "",
      customItem: false,
    },
  ],
});

function finiteAmount(n: number, fallback = 0) {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function quoteMoneyErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const flat = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const fieldHit = Object.values(flat.fieldErrors || {})
      .flat()
      .find((msg) => typeof msg === "string" && msg.trim());
    if (fieldHit) return fieldHit;
    const formHit = (flat.formErrors || []).find(
      (msg) => typeof msg === "string" && msg.trim()
    );
    if (formHit) return formHit;
  }
  return "Save failed";
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
    showUnit: form.showUnit,
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
    ...(status ? { status } : {}),
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
      unitPrice: clampQuoteUnitPrice(finiteAmount(l.unitPrice)),
      costPrice:
        l.costPrice != null && l.costPrice > 0
          ? clampQuoteUnitPrice(l.costPrice)
          : null,
      costVendorName: l.costVendorName || "",
      discountPercent: clampDiscountPercent(l.discountPercent ?? 0),
      hsnCode: sanitizeHsnInput(l.hsnCode || ""),
      customItem: Boolean(l.customItem),
      warrantyQty: clampWarrantyQty(l.warrantyQty ?? 0),
      warrantyUnit: normalizeWarrantyUnit(l.warrantyUnit),
      warrantyService: normalizeWarrantyService(l.warrantyService),
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
    showUnit: state.showUnit !== false,
    quoteDate: state.quoteDate || todayQuoteDateIso(),
    introText: state.introText?.trim() || quoteIntro(company.name),
    termsText: state.termsText?.trim() || defaultQuoteTerms(company.paymentTerms),
    closingText: state.closingText?.trim() || QUOTE_CLOSING,
  };
}

export function QuoteBuilder({
  initial,
  sellerState,
  company,
  sendContext,
  quoteStatus,
  rfqId,
  requirementContext,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [aliasSnapshot, setAliasSnapshot] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState<QuoteFormState>(() =>
    withDocumentDefaults(initial || emptyQuote(), company)
  );
  const formRef = useRef(form);
  formRef.current = form;
  const versionRef = useRef<number | undefined>(initial?.version);
  const linePriceBasisRef = useRef<Record<string, number>>(
    Object.fromEntries(
      (initial || emptyQuote()).lineItems.map((line) => [line.key, line.unitPrice])
    )
  );
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
  const [productDetailKey, setProductDetailKey] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const conflictHoldRef = useRef(false);
  const forceSaveRef = useRef(false);
  const [buyerFieldErrors, setBuyerFieldErrors] = useState<BuyerFieldErrors>({});
  const [waivedForKey, setWaivedForKey] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const undoStack = useRef<LineItem[][]>([]);
  const buyerDialogRef = useRef<HTMLDivElement>(null);
  const [stockByProductId, setStockByProductId] = useState<Record<string, number>>({});
  const [gstinTone, setGstinTone] = useState<"" | "ok" | "error">("");
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
  const [buyerIntent, setBuyerIntent] = useState<
    "edit" | "pdf" | "print" | "send" | null
  >(null);
  const [buyerError, setBuyerError] = useState("");
  const [hsnConfirmOpen, setHsnConfirmOpen] = useState(false);
  const [unitConfirmOpen, setUnitConfirmOpen] = useState(false);
  const [discountDialog, setDiscountDialog] = useState<{
    percent: number;
    amount: number;
    amountMode: boolean;
    methods: QuoteDiscountMethods;
    hasExistingDiscount: boolean;
  } | null>(null);
  const [markupDialog, setMarkupDialog] = useState<{ percent: number } | null>(
    null
  );
  const [appliedMarkupPercent, setAppliedMarkupPercent] = useState<number | null>(
    () => {
      const stored = (initial || emptyQuote()).manualOverrides.markupPercent;
      return typeof stored === "number" && stored > 0 ? stored : null;
    }
  );
  const [buyerContacts, setBuyerContacts] = useState<ClientContactHit[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [showVendorCost, setShowVendorCost] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceByQuery, setMarketplaceByQuery] = useState<
    Record<string, { loading: boolean; prices: MarketplacePriceStackValue | null }>
  >({});
  const marketplaceFetchedRef = useRef<Set<string>>(new Set());
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogByProductId, setCatalogByProductId] = useState<
    Record<string, { loading: boolean; prices: CatalogPriceStackValue | null }>
  >(() => {
    const seed: Record<string, { loading: boolean; prices: CatalogPriceStackValue | null }> =
      {};
    for (const line of (initial || emptyQuote()).lineItems) {
      if (!line.productId) continue;
      const prices = catalogPricesFromLine(line);
      if (!prices) continue;
      seed[line.productId] = { loading: false, prices };
    }
    return seed;
  });
  const catalogFetchedRef = useRef<Set<string>>(
    new Set(
      Object.keys(
        (initial || emptyQuote()).lineItems.reduce<Record<string, true>>((acc, line) => {
          if (line.productId && catalogPricesFromLine(line)) acc[line.productId] = true;
          return acc;
        }, {})
      )
    )
  );

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
      setSendHint(
        "Sends the quotation PDF. WhatsApp only delivers this if the buyer has messaged the business number in the last 24 hours."
      );
    }
    setSendNote("");
    setSendError("");
    setSendOpen(true);
  }

  function openBuyerPanel(intent: "edit" | "pdf" | "print" | "send") {
    setBuyerIntent(intent);
    setBuyerError("");
    setBuyerOpen(true);
  }

  function allowZeroPricedExport(): boolean {
    return confirmZeroPricedExport(formRef.current.lineItems, (message) =>
      window.confirm(message)
    );
  }

  function startPrint() {
    const popup = openPrintWindow();
    if (popup.blocked || !popup.win) {
      setMsg(PRINT_BLOCKED_MESSAGE);
      void saveQuote();
      return;
    }
    if (!allowZeroPricedExport()) {
      popup.win.close();
      void saveQuote();
      return;
    }
    void (async () => {
      const ok = await saveQuote();
      const id = formRef.current.id;
      if (!ok || !id) {
        popup.win?.close();
        setMsg("Could not save quote before printing");
        return;
      }
      try {
        await printQuotePdf(id, popup);
      } catch (e) {
        if (popup.win && !popup.win.closed) popup.win.close();
        setMsg(e instanceof Error ? e.message : "Print failed");
      }
    })();
  }

  function closeBuyerPanel() {
    setBuyerOpen(false);
    setBuyerIntent(null);
    setBuyerError("");
  }

  function requestPdf() {
    if (exportBlockedByReadiness()) return;
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
      if (!allowZeroPricedExport()) return;
      await downloadPdf();
    })();
  }

  function requestPrint() {
    if (exportBlockedByReadiness()) return;
    if (buyerGaps(formRef.current).length > 0) {
      void (async () => {
        const ok = await saveQuote();
        if (!ok || !formRef.current.id) {
          setMsg("Could not save quote before printing");
          return;
        }
        if (buyerGaps(formRef.current).length > 0) {
          openBuyerPanel("print");
          return;
        }
        startPrint();
      })();
      return;
    }
    startPrint();
  }

  function requestSend() {
    if (exportBlockedByReadiness()) return;
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
    const errors = validateBuyerDetails(form);
    const first = BUYER_FIELD_FOCUS_ORDER.find((key) => errors[key]);
    if (first) {
      setBuyerFieldErrors(errors);
      setBuyerError("Fill the highlighted fields before continuing.");
      const el = buyerDialogRef.current?.querySelector(
        `[data-buyer-field="${first}"]`
      );
      if (el instanceof HTMLElement) el.focus();
      return;
    }
    setBuyerFieldErrors({});
    const intent = buyerIntent;
    closeBuyerPanel();
    if (intent === "pdf") {
      if (!allowZeroPricedExport()) {
        void saveQuote();
        return;
      }
      void downloadPdf();
      return;
    }
    if (intent === "print") {
      startPrint();
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
    if (!rfqId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/rfqs/${rfqId}/vendors`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { matches?: VendorPriceMatch[] };
        const groups = vendorQuotesFromMatches(data.matches || []);
        if (cancelled || groups.length === 0) return;
        setForm((f) => ({
          ...f,
          lineItems: f.lineItems.map((line, index) => {
            const vendorQuotes = vendorQuotesForQuoteLine(
              { aliasName: line.aliasName, sortOrder: index },
              index,
              groups,
              f.lineItems.length
            );
            if (vendorQuotes.length === 0) return line;
            const fallback =
              line.costPrice != null && line.costPrice > 0
                ? null
                : cheapestVendorQuote(vendorQuotes);
            return {
              ...line,
              vendorQuotes,
              costPrice: line.costPrice ?? fallback?.unitPrice ?? null,
              costVendorName: line.costVendorName || fallback?.vendorName || "",
            };
          }),
        }));
      } catch {
        // Quote editor still works without vendor cost lookup.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rfqId]);

  const marketplaceQueries = useMemo(() => {
    const queries = new Set<string>();
    for (const line of form.lineItems) {
      const query = marketplaceQueryFromText(
        line.catalogName,
        line.aliasName,
        line.description
      );
      if (query) queries.add(query);
    }
    return [...queries];
  }, [form.lineItems]);
  const marketplaceQueryKey = marketplaceQueries.join("\n");

  useEffect(() => {
    if (!showMarketplace) return;
    const queries = marketplaceQueryKey ? marketplaceQueryKey.split("\n") : [];
    let cancelled = false;
    void (async () => {
      for (const query of queries) {
        if (cancelled) return;
        if (marketplaceFetchedRef.current.has(query)) continue;
        marketplaceFetchedRef.current.add(query);
        setMarketplaceByQuery((prev) => ({
          ...prev,
          [query]: { loading: true, prices: prev[query]?.prices ?? null },
        }));
        try {
          const res = await fetch("/api/marketplace/prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            best?: MarketplacePriceStackValue;
          };
          if (cancelled) {
            marketplaceFetchedRef.current.delete(query);
            return;
          }
          if (!res.ok) {
            marketplaceFetchedRef.current.delete(query);
            setMarketplaceByQuery((prev) => ({
              ...prev,
              [query]: { loading: false, prices: null },
            }));
            continue;
          }
          setMarketplaceByQuery((prev) => ({
            ...prev,
            [query]: { loading: false, prices: data.best ?? null },
          }));
        } catch {
          marketplaceFetchedRef.current.delete(query);
          if (!cancelled) {
            setMarketplaceByQuery((prev) => ({
              ...prev,
              [query]: { loading: false, prices: null },
            }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMarketplace, marketplaceQueryKey]);

  const catalogProductKey = useMemo(
    () =>
      [...new Set(form.lineItems.map((line) => line.productId).filter(Boolean))].join(
        "\n"
      ),
    [form.lineItems]
  );

  useEffect(() => {
    if (!showCatalog) return;
    const ids = catalogProductKey ? catalogProductKey.split("\n") : [];
    let cancelled = false;
    void (async () => {
      for (const productId of ids) {
        if (cancelled) return;
        if (catalogFetchedRef.current.has(productId)) continue;
        catalogFetchedRef.current.add(productId);
        setCatalogByProductId((prev) => ({
          ...prev,
          [productId]: { loading: true, prices: prev[productId]?.prices ?? null },
        }));
        try {
          const res = await fetch(`/api/products/${productId}`);
          const data = (await res.json().catch(() => ({}))) as {
            code?: string;
            sourceProductId?: string | null;
            name?: string;
            lastPrice?: number | null;
            offerPrice?: number | null;
            mrp?: number | null;
            basePrice?: number | null;
          };
          if (cancelled) {
            catalogFetchedRef.current.delete(productId);
            return;
          }
          if (!res.ok) {
            catalogFetchedRef.current.delete(productId);
            setCatalogByProductId((prev) => ({
              ...prev,
              [productId]: { loading: false, prices: null },
            }));
            continue;
          }
          setCatalogByProductId((prev) => ({
            ...prev,
            [productId]: { loading: false, prices: catalogPricesFromProduct(data) },
          }));
          // Keep internal catalog reference fields fresh for the editor-only chip.
          setForm((f) => {
            let changed = false;
            const lineItems = f.lineItems.map((line) => {
              if (line.productId !== productId) return line;
              const next = {
                ...line,
                catalogCode: line.catalogCode || data.code || "",
                catalogSourceId:
                  line.catalogSourceId ?? data.sourceProductId ?? null,
                catalogName: line.catalogName || data.name || "",
                catalogLastPrice: data.lastPrice ?? line.catalogLastPrice ?? null,
                catalogOfferPrice: data.offerPrice ?? line.catalogOfferPrice ?? null,
                catalogMrp: data.mrp ?? line.catalogMrp ?? null,
              };
              if (
                next.catalogCode !== line.catalogCode ||
                next.catalogSourceId !== line.catalogSourceId ||
                next.catalogName !== line.catalogName
              ) {
                changed = true;
              }
              return next;
            });
            return changed ? { ...f, lineItems } : f;
          });
        } catch {
          catalogFetchedRef.current.delete(productId);
          if (!cancelled) {
            setCatalogByProductId((prev) => ({
              ...prev,
              [productId]: { loading: false, prices: null },
            }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCatalog, catalogProductKey]);

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

  const stockProductKey = useMemo(
    () =>
      [...new Set(form.lineItems.map((line) => line.productId).filter(Boolean))].join(
        "\n"
      ),
    [form.lineItems]
  );

  useEffect(() => {
    if (!stockProductKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/inventory/balances?map=1&sync=false");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { map?: Record<string, number> };
        if (!cancelled && data.map) setStockByProductId(data.map);
      } catch {
        // Stock badges stay hidden when inventory cannot be read.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockProductKey]);

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
        discountPercent: l.discountPercent ?? 0,
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

  const appliedLineDiscountPercent = useMemo(
    () => uniformLineDiscountPercent(form.lineItems),
    [form.lineItems]
  );
  const hasAnyLineDiscount = form.lineItems.some(
    (line) => clampDiscountPercent(line.discountPercent ?? 0) > 0
  );

  const vendorCostTotal = useMemo(() => {
    return form.lineItems.reduce((sum, line) => {
      if (line.costPrice == null || line.costPrice <= 0) return sum;
      const qty = Number.isFinite(line.qty) ? line.qty : 0;
      return sum + line.costPrice * qty;
    }, 0);
  }, [form.lineItems]);

  const calcRef = useRef(calc);
  const lastSavedJsonRef = useRef<string | null>(null);
  const hydratedSaveRef = useRef(false);
  const saveChainRef = useRef(Promise.resolve(true));
  const savingRef = useRef(false);
  calcRef.current = calc;

  const saveQuote = useCallback((status?: "DRAFT" | "SENT") => {
    const run = async () => {
      savingRef.current = true;
      setSaving(true);
      try {
        for (;;) {
          const snapshot = formRef.current;
          const block = quoteAmountBlockReason({
            lines: snapshot.lineItems.map((line) => ({
              name: line.aliasName,
              qty: line.qty,
              unitPrice: line.unitPrice,
              discountPercent: line.discountPercent,
            })),
            grandTotal: calcRef.current.grandTotal,
          });
          if (block) {
            setNotice(block);
            setSaveError("");
            return false;
          }

          const payload = quoteSavePayload(snapshot, calcRef.current, status);
          const json = JSON.stringify(payload);
          if (snapshot.id && json === lastSavedJsonRef.current && !status) {
            setMsg("");
            setSaveError("");
            setNotice("");
            return true;
          }

          const isEdit = Boolean(snapshot.id);
          const sendVersion =
            isEdit &&
            !forceSaveRef.current &&
            typeof versionRef.current === "number";
          const res = await fetch(isEdit ? `/api/quotes/${snapshot.id}` : "/api/quotes", {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              ...(sendVersion ? { expectedVersion: versionRef.current } : {}),
            }),
          });
          forceSaveRef.current = false;

          if (res.status === 409) {
            conflictHoldRef.current = true;
            setConflict(true);
            const err = await res.json().catch(() => ({}));
            setSaveError(
              typeof err.error === "string"
                ? err.error
                : "This quote was saved in another tab. Reload before saving."
            );
            return false;
          }

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setSaveError(quoteMoneyErrorMessage(err.error));
            setMsg("");
            return false;
          }

          const saved = await res.json();
          lastSavedJsonRef.current = json;
          setMsg("");
          setSaveError("");
          setNotice("");
          setConflict(false);
          conflictHoldRef.current = false;
          const nextStatus: QuoteFormState["status"] =
            saved.status === "SENT" ? "SENT" : snapshot.status;
          const nextVersion =
            typeof saved.version === "number" ? saved.version : versionRef.current;
          if (typeof nextVersion === "number") versionRef.current = nextVersion;
          const next: QuoteFormState = {
            ...formRef.current,
            id: saved.id || snapshot.id,
            quoteNumber: saved.quoteNumber || snapshot.quoteNumber,
            status: nextStatus,
            version: nextVersion,
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
        setSaveError("Save failed");
        return false;
      } finally {
        savingRef.current = false;
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

  const savePayloadJson = useMemo(
    () => JSON.stringify(quoteSavePayload(form, calc)),
    [form, calc]
  );
  // Dirty only vs last persisted payload — never vs page-load baseline.
  // Matching the initial load after a later save must still trigger a PUT.
  const hasPendingSave =
    hydratedSaveRef.current &&
    savePayloadJson !== lastSavedJsonRef.current;

  useEffect(() => {
    if (!hydratedSaveRef.current) {
      // Loaded form matches server for edits; treat as last saved so mount
      // does not autosave, but later edits (including reverting to this value
      // after a different save) compare only against lastSavedJsonRef.
      lastSavedJsonRef.current = savePayloadJson;
      hydratedSaveRef.current = true;
      return;
    }
    if (conflictHoldRef.current) return;
    if (savePayloadJson === lastSavedJsonRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveQuote();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [savePayloadJson, saveQuote]);

  useEffect(() => {
    const isDirty = () => {
      const json = JSON.stringify(
        quoteSavePayload(formRef.current, calcRef.current)
      );
      return hydratedSaveRef.current && json !== lastSavedJsonRef.current;
    };
    const flush = () => {
      if (!isDirty()) return;
      void saveQuote();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty() && !savingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [saveQuote]);

  function rememberLines() {
    const snap = formRef.current.lineItems.map((line) => ({ ...line }));
    const stack = undoStack.current;
    const last = stack[stack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    stack.push(snap);
    if (stack.length > 40) stack.shift();
    setCanUndo(true);
  }

  function undoLines() {
    const prev = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (!prev) return;
    setForm((f) => ({ ...f, lineItems: prev }));
  }

  function updateLine(idx: number, patch: Partial<LineItem>) {
    rememberLines();
    setForm((f) => {
      const lineItems = f.lineItems.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        if (patch.unitPrice != null) {
          // Keep the previous price when the edit is negative or above the column max.
          if (
            !Number.isFinite(patch.unitPrice) ||
            patch.unitPrice < 0 ||
            patch.unitPrice > MAX_QUOTE_UNIT_PRICE
          ) {
            next.unitPrice = l.unitPrice;
          } else {
            next.unitPrice = clampQuoteUnitPrice(patch.unitPrice);
            linePriceBasisRef.current[next.key] = next.unitPrice;
          }
        }
        if (patch.costPrice != null && patch.costPrice > 0) {
          next.costPrice = clampQuoteUnitPrice(patch.costPrice);
        }
        if (patch.discountPercent != null) {
          next.discountPercent = clampDiscountPercent(patch.discountPercent);
        }
        return next;
      });
      // Line Disc% and whole-quote discount are mutually exclusive.
      const touchedLineDiscount =
        patch.discountPercent != null &&
        clampDiscountPercent(patch.discountPercent) > 0;
      return {
        ...f,
        lineItems,
        ...(touchedLineDiscount && f.discountPercent > 0
          ? {
              discountPercent: 0,
              discountAmount: 0,
              manualOverrides: { ...f.manualOverrides, discountAmount: false },
            }
          : null),
      };
    });
  }

  function applyDiscountSelection(
    percent: number,
    methods: QuoteDiscountMethods,
    fixedAmount = 0
  ) {
    rememberLines();
    const pricedLines = formRef.current.lineItems.map((line) => ({
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent ?? 0,
    }));
    if (fixedAmount > 0 && methods.method === "header") {
      const validation = validateFixedDiscountAmount(
        fixedAmount,
        grossLineSubtotal(pricedLines)
      );
      if (!validation.ok) {
        toast(validation.reason || "Discount is not allowed.", "error");
        return;
      }
      setForm((f) => ({
        ...f,
        discountPercent: 0,
        discountAmount: fixedAmount,
        manualOverrides: { ...f.manualOverrides, discountAmount: false },
        lineItems: applyPercentToLineDiscounts(f.lineItems, 0),
      }));
      return;
    }
    const validation = validateDiscountApplication({
      percent,
      methods,
      lines: pricedLines,
    });
    if (percent > 0 && !validation.ok) {
      toast(validation.reason || "Discount is not allowed.", "error");
      return;
    }
    const { headerPercent, linePercent } = resolveDiscountApplication(
      percent,
      methods
    );
    setForm((f) => ({
      ...f,
      discountPercent: headerPercent,
      discountAmount: 0,
      manualOverrides: { ...f.manualOverrides, discountAmount: false },
      lineItems: applyPercentToLineDiscounts(f.lineItems, linePercent),
    }));
  }

  function clearAllDiscounts() {
    applyDiscountSelection(0, { method: "header" });
  }

  function closeDiscountDialog() {
    setDiscountDialog(null);
  }

  function openDiscountDialog() {
    const linePct = appliedLineDiscountPercent ?? 0;
    const headerPct = form.discountPercent ?? 0;
    const methods = inferDiscountMethods({
      headerPercent: headerPct,
      hasLineDiscount: hasAnyLineDiscount,
    });
    const fixedAmount = form.discountAmount ?? 0;
    const amountMode = headerPct <= 0 && fixedAmount > 0;
    const hasExistingDiscount =
      headerPct > 0 || hasAnyLineDiscount || fixedAmount > 0;
    const percent = hasExistingDiscount
      ? methods.method === "lines"
        ? linePct || headerPct
        : headerPct || linePct
      : 0;
    setDiscountDialog({
      percent: amountMode ? 0 : percent,
      amount: amountMode ? fixedAmount : 0,
      amountMode,
      methods,
      hasExistingDiscount,
    });
  }

  function openMarkupDialog() {
    setMarkupDialog({ percent: appliedMarkupPercent ?? 0 });
  }

  function closeMarkupDialog() {
    setMarkupDialog(null);
  }

  function applyMarkup(
    percent: number,
    opts?: { allowSellFallback?: boolean }
  ) {
    const nextPercent = Number.isFinite(percent) && percent > 0 ? percent : 0;
    rememberLines();
    setAppliedMarkupPercent(nextPercent > 0 ? nextPercent : null);
    setForm((f) => {
      const lineItems = applyMarkupPercentToLines(f.lineItems, nextPercent, opts);
      for (const line of lineItems) {
        linePriceBasisRef.current[line.key] = line.unitPrice;
      }
      const manualOverrides = { ...f.manualOverrides };
      if (nextPercent > 0) manualOverrides.markupPercent = nextPercent;
      else delete manualOverrides.markupPercent;
      return {
        ...f,
        manualOverrides,
        lineItems,
      };
    });
  }

  function clearMarkup() {
    applyMarkup(0);
  }

  const hasAppliedMarkup =
    appliedMarkupPercent != null && appliedMarkupPercent > 0;

  function addLine() {
    rememberLines();
    const key = newKey();
    linePriceBasisRef.current[key] = 0;
    setForm((f) => ({
      ...f,
      lineItems: [
        ...f.lineItems,
        {
          key,
          productId: null,
          description: "",
          aliasName: "",
          qty: 1,
          unit: DEFAULT_QUOTE_UNIT,
          unitPrice: 0,
          costPrice: null,
          costVendorName: "",
          discountPercent: 0,
          warrantyQty: 0,
          warrantyUnit: "years",
          warrantyService: "",
          taxRate: 18,
          hsnCode: "",
          customItem: false,
        },
      ],
    }));
  }

  function duplicateLine(idx: number) {
    rememberLines();
    const key = newKey();
    setForm((f) => {
      const source = f.lineItems[idx];
      if (!source) return f;
      const copy: LineItem = { ...source, key, productId: source.productId };
      const lineItems = [...f.lineItems];
      lineItems.splice(idx + 1, 0, copy);
      return { ...f, lineItems };
    });
  }

  function moveLine(idx: number, dir: -1 | 1) {
    rememberLines();
    setForm((f) => {
      const next = idx + dir;
      if (next < 0 || next >= f.lineItems.length) return f;
      const lineItems = [...f.lineItems];
      const [row] = lineItems.splice(idx, 1);
      lineItems.splice(next, 0, row);
      return { ...f, lineItems };
    });
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
    rememberLines();
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.filter((_, i) => i !== idx),
    }));
  }

  function pickProduct(idx: number, p: ProductHit) {
    const current = formRef.current.lineItems[idx];
    const clientName = current?.aliasName?.trim() || "";
    updateLine(idx, {
      productId: p.id,
      catalogName: p.name,
      catalogCode: p.code || "",
      catalogSourceId: p.sourceProductId ?? null,
      description: p.description || current?.description || "",
      // Keep the client requirement name on the quote; catalog name is internal only.
      aliasName: clientName || p.name,
      unit: current?.unit?.trim()
        ? normalizeQuoteUnit(current.unit)
        : normalizeQuoteUnit(p.unit),
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
      catalogLastPrice: p.lastPrice ?? null,
      catalogOfferPrice: p.offerPrice ?? null,
      catalogMrp: p.mrp ?? null,
    });
    catalogFetchedRef.current.add(p.id);
    setCatalogByProductId((prev) => ({
      ...prev,
      [p.id]: { loading: false, prices: catalogPricesFromProduct(p) },
    }));
    resetCatalogSearch();
    setProductDetailKey(null);
  }

  function openCatalogSearch(idx: number) {
    resetCatalogSearch();
    setProductDetailKey(null);
    setSearchIdx(idx);
  }

  function openMappedProductDetail(idx: number) {
    const line = form.lineItems[idx];
    if (!line?.productId) return;
    resetCatalogSearch();
    setProductDetailKey(line.key);
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
      setGstinTone("error");
      setGstinMsg("Invalid GSTIN");
      return;
    }
    setGstinFetching(true);
    setGstinTone("");
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
      setGstinTone("ok");
      setGstinMsg(companyName ? `Verified · ${companyName}` : "Verified");
    } catch (e) {
      setGstinTone("error");
      setGstinMsg(
        e instanceof Error && e.message ? e.message : "Invalid GSTIN"
      );
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
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "PDF generation failed");
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

    const data = (await res.json().catch(() => ({}))) as {
      deliveryNote?: string;
      to?: string;
    };
    setForm((f) => ({ ...f, status: "SENT" }));
    setSendOpen(false);
    setMsg(
      data.deliveryNote ||
        (sendChannel === "EMAIL"
          ? `Quote emailed to ${to}`
          : `Quote sent to ${data.to || to}`)
    );
    router.refresh();
  }

  const hasOverrides = hasManualMoneyOverride(form.manualOverrides);
  const requirementText = [
    requirementContext?.subject,
    requirementContext?.rawText,
  ]
    .filter(Boolean)
    .join("\n");
  const warrantyAsk = useMemo(
    () => extractWarrantyAsk(requirementText),
    [requirementText]
  );
  const suggestedState = useMemo(
    () => (form.buyerState.trim() ? null : extractIndianState(requirementText)),
    [form.buyerState, requirementText]
  );
  const commercial = useMemo(
    () => parseCommercialTerms(form.termsText, company.paymentTerms),
    [form.termsText, company.paymentTerms]
  );
  const readinessGaps = useMemo(
    () =>
      collectReadinessGaps({
        buyerCompany: form.buyerCompany,
        buyerAddress: form.buyerAddress,
        buyerState: form.buyerState,
        warrantyAsked: rfqMentionsWarranty(requirementText),
        stockByProductId,
        termsMissing:
          /\bdeliver/i.test(requirementText) && !commercial.delivery.trim(),
        lines: form.lineItems.map((line) => ({
          name: line.aliasName,
          unitPrice: line.unitPrice,
          hsnCode: line.hsnCode,
          warrantyQty: line.warrantyQty,
          productId: line.productId,
          customItem: line.customItem,
        })),
      }),
    [
      form.buyerCompany,
      form.buyerAddress,
      form.buyerState,
      form.lineItems,
      requirementText,
      stockByProductId,
      commercial.delivery,
    ]
  );
  const readinessKey = readinessGaps.map((gap) => gap.id).join("|");
  const readinessWaived = waivedForKey === readinessKey && readinessKey.length > 0;

  function exportBlockedByReadiness() {
    const blocking = readinessGaps.filter((gap) => gap.fix !== "buyer");
    if (blocking.length === 0 || readinessWaived) return false;
    document.getElementById("quote-readiness")?.scrollIntoView({ block: "center" });
    setNotice("Resolve the ready-to-send checklist, or acknowledge the gaps. Buyer company, address, and state are still required for the PDF.");
    return true;
  }

  function focusLineField(index: number, field: "price" | "hsn" | "qty") {
    const el = document.querySelector(`[data-line-field="${field}-${index}"]`);
    const target =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el
        : el?.querySelector("input, textarea");
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center" });
      target.focus();
    }
  }

  function updateCommercial(patch: Partial<typeof commercial>) {
    const next = { ...commercial, ...patch };
    setForm((f) => ({ ...f, termsText: composeCommercialTerms(next) }));
  }
  const destinationLabel =
    sendChannel === "EMAIL" ? "Email address" : "WhatsApp number";
  const destinationPlaceholder =
    sendChannel === "EMAIL" ? "buyer@company.com" : "+919876543210";

  function renderBuyerFields() {
    const border = (invalid?: string) =>
      `w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-mid-green ${
        invalid ? "border-[1.5px] border-red-600" : "border-light-green/40"
      }`;
    return (
      <div className="space-y-3">
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">GSTIN</span>
          <div className="flex gap-1.5">
            <input
              value={form.buyerGstin}
              onChange={(e) => {
                setGstinTone("");
                setGstinMsg("");
                setForm((f) => ({
                  ...f,
                  buyerGstin: e.target.value.toUpperCase(),
                }));
              }}
              maxLength={15}
              placeholder="15-character GSTIN"
              className="min-w-0 flex-1 rounded-lg border border-light-green/40 bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:border-mid-green"
            />
            <button
              type="button"
              onClick={fetchBuyerFromGstin}
              disabled={gstinFetching || form.buyerGstin.trim().length !== 15}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-mid-green/40 px-2.5 py-1.5 text-xs hover:bg-mid-green/10 disabled:opacity-50"
            >
              {gstinFetching ? "Fetching…" : "Fetch"}
            </button>
          </div>
          {gstinMsg ? (
            <p
              className={`mt-1 text-xs ${
                gstinTone === "error"
                  ? "text-red-700"
                  : gstinTone === "ok"
                    ? "text-mid-green"
                    : "text-dark-primary"
              }`}
            >
              {gstinMsg}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-mid-green/80">
              Fetch stays off until the GSTIN is 15 characters.
            </p>
          )}
        </label>
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">
            Company (official name) <span className="text-red-600">*</span>
          </span>
          <ClientCompanyField
            name="buyerCompany"
            fieldId="buyerCompany"
            invalid={Boolean(buyerFieldErrors.buyerCompany)}
            inputClassName={border(buyerFieldErrors.buyerCompany)}
            value={form.buyerCompany}
            email={form.buyerEmail}
            phone={form.buyerPhone}
            placeholder="Type client name or initials"
            onChange={(next) => {
              setBuyerFieldErrors((prev) => ({ ...prev, buyerCompany: undefined }));
              setForm((f) => ({ ...f, buyerCompany: next }));
            }}
            onSelectClient={(client) => void applySelectedClient(client)}
          />
          {buyerFieldErrors.buyerCompany ? (
            <span className="mt-1 block text-xs text-red-700">
              {buyerFieldErrors.buyerCompany}
            </span>
          ) : null}
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
        ).map(([key, label]) => {
          const fieldError =
            key === "buyerEmail" || key === "buyerPhone"
              ? buyerFieldErrors[key]
              : undefined;
          return (
          <label key={key} className="block text-xs">
            <span className="mb-0.5 block text-mid-green">{label}</span>
            <input
              data-buyer-field={key}
              value={form[key]}
              inputMode={key === "buyerPhone" ? "tel" : undefined}
              aria-invalid={Boolean(fieldError) || undefined}
              onChange={(e) => {
                const value =
                  key === "buyerPhone"
                    ? sanitizePhoneInput(e.target.value)
                    : e.target.value;
                if (key === "buyerEmail" || key === "buyerPhone") {
                  setBuyerFieldErrors((prev) => ({ ...prev, [key]: undefined }));
                }
                setForm((f) => ({ ...f, [key]: value }));
              }}
              className={border(fieldError)}
            />
            {fieldError ? (
              <span className="mt-1 block text-xs text-red-700">{fieldError}</span>
            ) : null}
          </label>
          );
        })}
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">
            State (for GST) <span className="text-red-600">*</span>
          </span>
          <select
            data-buyer-field="buyerState"
            value={form.buyerState}
            aria-invalid={Boolean(buyerFieldErrors.buyerState) || undefined}
            onChange={(e) => {
              setBuyerFieldErrors((prev) => ({ ...prev, buyerState: undefined }));
              setForm((f) => ({ ...f, buyerState: e.target.value }));
            }}
            className={border(buyerFieldErrors.buyerState)}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {buyerFieldErrors.buyerState ? (
            <span className="mt-1 block text-xs text-red-700">
              {buyerFieldErrors.buyerState}
            </span>
          ) : null}
        </label>
        <label className="block text-xs">
          <span className="mb-0.5 block text-mid-green">
            Address <span className="text-red-600">*</span>
          </span>
          <textarea
            data-buyer-field="buyerAddress"
            value={form.buyerAddress}
            aria-invalid={Boolean(buyerFieldErrors.buyerAddress) || undefined}
            onChange={(e) => {
              setBuyerFieldErrors((prev) => ({ ...prev, buyerAddress: undefined }));
              setForm((f) => ({ ...f, buyerAddress: e.target.value }));
            }}
            rows={3}
            className={border(buyerFieldErrors.buyerAddress)}
          />
          {buyerFieldErrors.buyerAddress ? (
            <span className="mt-1 block text-xs text-red-700">
              {buyerFieldErrors.buyerAddress}
            </span>
          ) : null}
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
        showUnit={form.showUnit}
        onRemoveUnit={() => setUnitConfirmOpen(true)}
        otherTaxLabel={form.otherTaxLabel}
        lineItems={form.lineItems}
        calc={calc}
        discountPercent={form.discountPercent}
        activeSection={previewSection}
        onSelectSection={setPreviewSection}
        sidebar={renderPreviewSidebar()}
      />
    );
  }

  const productDetailIdx =
    productDetailKey == null
      ? -1
      : form.lineItems.findIndex((l) => l.key === productDetailKey);
  const productDetailLine =
    productDetailIdx >= 0 ? form.lineItems[productDetailIdx] : null;

  const saveLabel = conflict
    ? "Conflict"
    : saving
      ? "Saving…"
      : saveError
        ? "Save failed"
        : hasPendingSave
          ? notice
            ? "Not saved"
            : "Saving…"
          : form.id
            ? "Saved"
            : "Unsaved";
  const saveTone =
    saveLabel === "Save failed" || saveLabel === "Conflict" || saveLabel === "Not saved"
      ? "bg-red-50 text-red-800"
      : saveLabel === "Saving…"
        ? "bg-light-green/30 text-dark-secondary"
        : "bg-light-green/25 text-dark-secondary";
  const readyLabel =
    readinessGaps.length === 0
      ? "Ready to send"
      : readinessWaived
        ? "Gaps acknowledged"
        : "Not ready";
  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-light-green/35 bg-white text-mid-green hover:bg-light-green/15 disabled:opacity-60";
  const field =
    "h-8 rounded-md border border-light-green/35 bg-background px-2 text-sm outline-none focus:border-mid-green";
  const cellInput = `${field} w-full`;
  const numInput =
    `${cellInput} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
  const moneyInput =
    "h-9 w-full rounded-md border border-light-green/35 bg-background px-2 text-right text-base font-semibold tabular-nums outline-none focus:border-mid-green [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const chargeInput =
    `${field} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

  const formBody = (
    <form onSubmit={(e) => onSave(e)} className="min-w-0 flex-1 space-y-3 pb-8">
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
          {(quoteStatus || form.status).replaceAll("_", " ").toLowerCase()}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${saveTone}`}
          aria-live="polite"
        >
          {saveLabel}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            readinessGaps.length === 0
              ? "bg-light-green/25 text-dark-secondary"
              : "bg-amber-50 text-amber-950"
          }`}
        >
          {readyLabel}
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
          <QuoteCalculator compact className={iconBtn} />
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
            onClick={() => openSendModal("WHATSAPP")}
            className={iconBtn}
            title="WhatsApp"
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

      {saveError ? (
        <p className="text-sm text-red-700" role="alert">
          {saveError}
          {conflict ? (
            <span className="ml-2 inline-flex gap-2">
              <button
                type="button"
                className="underline"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  conflictHoldRef.current = false;
                  forceSaveRef.current = true;
                  setConflict(false);
                  setSaveError("");
                  void saveQuote();
                }}
              >
                Overwrite
              </button>
            </span>
          ) : null}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-red-700" role="alert">
          {notice}
        </p>
      ) : null}
      {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}

      <section
        id="quote-readiness"
        aria-label="Ready to send"
        className="rounded-xl border border-light-green/30 bg-white/80 px-3 py-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-dark-primary">
            {readinessGaps.length === 0 ? "Ready to send" : "Not ready to send"}
          </h2>
          <span className="text-[11px] text-mid-green">
            Saved means stored. Preview is for review. Sending stays blocked until
            these gaps are fixed or acknowledged.
          </span>
        </div>
        {readinessGaps.length > 0 ? (
          <>
            <ul className="mt-2 space-y-1">
              {readinessGaps.map((gap) => (
                <li key={gap.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{gap.message}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-mid-green underline"
                    onClick={() => {
                      if (gap.fix === "buyer") openBuyerPanel("edit");
                      else if (gap.fix === "price" && gap.lineIndex != null)
                        focusLineField(gap.lineIndex, "price");
                      else if (gap.fix === "hsn" && gap.lineIndex != null)
                        focusLineField(gap.lineIndex, "hsn");
                      else if (gap.fix === "stock" && gap.lineIndex != null)
                        focusLineField(gap.lineIndex, "price");
                      else if (gap.fix === "warranty" || gap.fix === "terms") {
                        document
                          .getElementById("quote-commercial")
                          ?.scrollIntoView({ block: "center" });
                      }
                    }}
                  >
                    Fix
                  </button>
                </li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-xs text-dark-primary">
              <input
                type="checkbox"
                checked={readinessWaived}
                onChange={(e) =>
                  setWaivedForKey(e.target.checked ? readinessKey : null)
                }
              />
              I have reviewed these gaps and want to continue anyway. Buyer company,
              address, and state are still required to generate the PDF.
            </label>
          </>
        ) : (
          <p className="mt-1 text-xs text-mid-green">
            Buyer details, prices, and HSN look complete.
          </p>
        )}
      </section>

      {renderPreviewModal()}

      {productDetailLine?.productId ? (
        <ProductDetailDialog
          productId={productDetailLine.productId}
          seed={{
            id: productDetailLine.productId,
            code: productDetailLine.catalogCode || "",
            name: productDetailLine.catalogName || "",
            sourceProductId: productDetailLine.catalogSourceId,
            description: productDetailLine.description,
            hsnCode: productDetailLine.hsnCode,
            unit: productDetailLine.unit,
            taxRate: productDetailLine.taxRate,
            lastPrice: productDetailLine.catalogLastPrice,
            offerPrice: productDetailLine.catalogOfferPrice,
            mrp: productDetailLine.catalogMrp,
          }}
          onClose={() => setProductDetailKey(null)}
          actions={
            <button
              type="button"
              onClick={() => openCatalogSearch(productDetailIdx)}
              className="inline-flex items-center gap-1 rounded-lg border border-mid-green/40 px-3 py-1.5 text-sm text-mid-green hover:bg-mid-green/10"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
              Change mapping
            </button>
          }
        />
      ) : null}

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
                      setSendHint("Sends the quotation PDF to this email.");
                      setSendTo(
                        form.buyerEmail.trim() ||
                          sendContext?.customerEmail?.trim() ||
                          (sendDefaults.suggestedChannel === "EMAIL"
                            ? sendDefaults.suggestedTo
                            : "")
                      );
                    } else {
                      setSendHint(
                        "Sends the quotation PDF. WhatsApp only delivers this if the buyer has messaged the business number in the last 24 hours."
                      );
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
                  <option value="WHATSAPP">WhatsApp</option>
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
                  disabled={sending}
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
            ref={buyerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="buyer-details-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="buyer-details-title" className="text-lg font-semibold">
                  {buyerIntent === "print"
                    ? "Fill buyer details to print"
                    : buyerIntent === "pdf"
                      ? "Fill buyer details to generate PDF"
                      : buyerIntent === "send"
                        ? "Fill buyer details to send quote"
                        : "Buyer details"}
                </h2>
                {buyerError ? null : (
                  <p className="mt-1 text-sm text-mid-green">
                    Company name, address, and state are required on the quotation.
                  </p>
                )}
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
                <p
                  className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{buyerError}</span>
                </p>
              ) : null}
              {suggestedState ? (
                <button
                  type="button"
                  className="mb-3 text-left text-xs text-mid-green underline"
                  onClick={() =>
                    setForm((f) => ({ ...f, buyerState: suggestedState }))
                  }
                >
                  Use {suggestedState} from the RFQ (address is not filled in)
                </button>
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
                {buyerIntent === "print"
                  ? "Continue to print"
                  : buyerIntent === "pdf"
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

      {discountDialog ? (
        <QuoteDiscountDialog
          percent={discountDialog.percent}
          amount={discountDialog.amount}
          amountMode={discountDialog.amountMode}
          methods={discountDialog.methods}
          hasExistingDiscount={discountDialog.hasExistingDiscount}
          currentSubtotal={calc.subtotal}
          lines={form.lineItems.map((line) => ({
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent ?? 0,
          }))}
          onPercentChange={(percent) =>
            setDiscountDialog((current) =>
              current ? { ...current, percent, amountMode: false } : current
            )
          }
          onAmountChange={(amount) =>
            setDiscountDialog((current) =>
              current ? { ...current, amount } : current
            )
          }
          onAmountModeChange={(amountMode) =>
            setDiscountDialog((current) =>
              current ? { ...current, amountMode } : current
            )
          }
          onMethodsChange={(methods) =>
            setDiscountDialog((current) =>
              current
                ? {
                    ...current,
                    methods,
                    amountMode: methods.method === "lines" ? false : current.amountMode,
                  }
                : current
            )
          }
          onCancel={closeDiscountDialog}
          onClearAll={() => {
            clearAllDiscounts();
            closeDiscountDialog();
          }}
          onApply={() => {
            applyDiscountSelection(
              discountDialog.percent,
              discountDialog.methods,
              discountDialog.amountMode && discountDialog.methods.method === "header"
                ? discountDialog.amount
                : 0
            );
            closeDiscountDialog();
          }}
        />
      ) : null}

      {markupDialog ? (
        <QuoteMarkupDialog
          percent={markupDialog.percent}
          hasExistingMarkup={hasAppliedMarkup}
          lines={form.lineItems.map((line) => ({
            qty: line.qty,
            unitPrice: line.unitPrice,
            costPrice: line.costPrice,
          }))}
          onPercentChange={(percent) =>
            setMarkupDialog((current) =>
              current ? { ...current, percent } : current
            )
          }
          onCancel={closeMarkupDialog}
          onClear={() => {
            clearMarkup();
            closeMarkupDialog();
          }}
          onApply={(opts) => {
            applyMarkup(markupDialog.percent, opts);
            closeMarkupDialog();
          }}
        />
      ) : null}

      {unitConfirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 px-4"
          onClick={() => setUnitConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unit-confirm-title"
            className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="unit-confirm-title" className="text-lg font-semibold">
              Remove units?
            </h2>
            <p className="mt-2 text-sm text-mid-green">
              Some clients do not need units on the quotation. This will hide
              Nos, Pcs, and other units from this quote, including the preview
              and PDF. Quantity stays visible.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnitConfirmOpen(false)}
                className="rounded-lg border border-light-green/50 px-3 py-2 text-sm hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, showUnit: false }));
                  setUnitConfirmOpen(false);
                }}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
              >
                Remove units
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
            <section className="min-w-0 rounded-xl bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
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
                  {form.showUnit ? null : (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, showUnit: true }))}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.5} />
                      Unit
                    </button>
                  )}
                  <label className="inline-flex items-center gap-1 text-[11px] text-mid-green">
                    <select
                      value={form.gstMode}
                      aria-label="GST split"
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
                    {form.gstMode === "AUTO" ? (
                      <span>{describeGstAuto(form.buyerState, sellerState)}</span>
                    ) : null}
                  </label>
                  {showVendorCost ? null : (
                    <button
                      type="button"
                      onClick={() => setShowVendorCost(true)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                      title="Show vendor cost prices for each product"
                    >
                      <Wallet className="h-3 w-3" strokeWidth={1.5} />
                      Vendor
                    </button>
                  )}
                  {showMarketplace ? null : (
                    <button
                      type="button"
                      onClick={() => setShowMarketplace(true)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                      title="Show Amazon, Flipkart and IndiaMART prices for each product"
                    >
                      <Store className="h-3 w-3" strokeWidth={1.5} />
                      Marketplace
                    </button>
                  )}
                  {showCatalog ? null : (
                    <button
                      type="button"
                      onClick={() => setShowCatalog(true)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15"
                      title="Show catalog last, offer and MRP for each product"
                    >
                      <Tag className="h-3 w-3" strokeWidth={1.5} />
                      Catalog
                    </button>
                  )}
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
                    onClick={undoLines}
                    disabled={!canUndo}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-light-green/40 bg-background px-2 text-xs hover:bg-light-green/15 disabled:opacity-40"
                  >
                    <Undo2 className="h-3 w-3" strokeWidth={1.5} />
                    Undo
                  </button>
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

              <div className="overflow-x-auto">
              <table className="w-full min-w-[76rem] border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-dark-secondary/[0.04] text-[10px] uppercase tracking-wide text-mid-green">
                    <tr>
                      <th className="min-w-[16rem] px-2 py-1.5 font-medium">Item</th>
                      <th className="min-w-[12rem] px-2 py-1.5 font-medium">Description</th>
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
                      {form.showUnit ? (
                        <th className="px-1.5 py-1.5 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Unit
                            <button
                              type="button"
                              onClick={() => setUnitConfirmOpen(true)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-light-green/50 text-mid-green hover:bg-light-green/20"
                              title="Remove units from quotation"
                              aria-label="Remove units from quotation"
                            >
                              <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        </th>
                      ) : null}
                      {showVendorCost ? (
                        <th className="px-1.5 py-1.5 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Vendor cost
                            <button
                              type="button"
                              onClick={() => setShowVendorCost(false)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-light-green/50 text-mid-green hover:bg-light-green/20"
                              title="Hide vendor cost"
                              aria-label="Hide vendor cost"
                            >
                              <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        </th>
                      ) : null}
                      {showMarketplace ? (
                        <th className="px-1.5 py-1.5 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Marketplace
                            <button
                              type="button"
                              onClick={() => setShowMarketplace(false)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-light-green/50 text-mid-green hover:bg-light-green/20"
                              title="Hide marketplace prices"
                              aria-label="Hide marketplace prices"
                            >
                              <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        </th>
                      ) : null}
                      {showCatalog ? (
                        <th className="px-1.5 py-1.5 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Catalog
                            <button
                              type="button"
                              onClick={() => setShowCatalog(false)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-light-green/50 text-mid-green hover:bg-light-green/20"
                              title="Hide catalog prices"
                              aria-label="Hide catalog prices"
                            >
                              <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        </th>
                      ) : null}
                      <th className="px-1.5 py-1.5 text-xs font-semibold">Sell</th>
                      <th className="px-1.5 py-1.5 font-medium" title="Per-product discount %">
                        Disc%
                      </th>
                      <th className="px-1.5 py-1.5 font-medium">Warranty</th>
                      <th className="px-1.5 py-1.5 font-medium">Tax%</th>
                      <th className="min-w-[8.5rem] px-2 py-1.5 text-right text-xs font-semibold leading-tight">
                        Total
                        {form.withGst ? (
                          <span className="mt-0.5 block text-[9px] font-medium normal-case tracking-normal text-mid-green">
                            excl. GST
                          </span>
                        ) : null}
                      </th>
                      <th className="min-w-[6.5rem] px-1 py-1.5">
                        <span className="sr-only">Line actions</span>
                      </th>
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
                            <div className="flex items-start gap-1.5">
                              <button
                                type="button"
                                onClick={() => openCatalogSearch(idx)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-light-green/40 text-mid-green hover:bg-light-green/20"
                                title="Search catalog"
                                aria-label={`Search catalog, line ${idx + 1}`}
                              >
                                <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                              <textarea
                                value={line.aliasName}
                                onChange={(e) =>
                                  updateLine(idx, { aliasName: e.target.value })
                                }
                                rows={Math.min(
                                  8,
                                  Math.max(
                                    2,
                                    line.aliasName.split(/\n/).length,
                                    Math.ceil(line.aliasName.length / 28)
                                  )
                                )}
                                aria-label={`Item name, line ${idx + 1}`}
                                className={`${field} min-h-[2.5rem] min-w-[12rem] w-full resize-y px-2 py-1.5 leading-snug whitespace-pre-wrap break-words`}
                                placeholder="Name on quote"
                                title={
                                  line.catalogName
                                    ? `On quote · catalog: ${line.catalogName}`
                                    : "Shown as the product name on the quotation"
                                }
                              />
                            </div>
                            {line.productId ? (
                              <button
                                type="button"
                                onClick={() => openMappedProductDetail(idx)}
                                className="mt-1 block max-w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-mid-green underline-offset-2 hover:bg-light-green/20 hover:underline"
                                title="Open catalog product details (internal only — not on preview, PDF, or email)"
                              >
                                Catalog:{" "}
                                {catalogProductRefLabel({
                                  sourceProductId: line.catalogSourceId,
                                  code: line.catalogCode,
                                  name: line.catalogName,
                                })}
                              </button>
                            ) : line.customItem ? (
                              <p className="mt-1 px-1 text-[11px] text-mid-green">
                                Custom line — not in the catalog
                              </p>
                            ) : (
                              <p className="mt-1 px-1 text-[11px] text-mid-green">
                                Not in catalog
                              </p>
                            )}
                            {line.productId &&
                            line.aliasName.trim() &&
                            catalogBindingLooksMismatched(
                              line.aliasName,
                              [line.catalogName, line.description]
                                .filter(Boolean)
                                .join(" ")
                            ) ? (
                              <p className="mt-1 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-1 text-[11px] text-amber-950">
                                Catalog mismatch — review suggestions; this SKU may not match the RFQ line.
                              </p>
                            ) : null}
                            {!line.productId && !line.customItem && line.aliasName.trim() ? (
                              <div className="mt-1 rounded-md border border-light-green/40 bg-light-green/10 px-2 py-1 text-[11px] text-dark-primary">
                                <p>No catalog product picked yet.</p>
                                <button
                                  type="button"
                                  className="mt-1 font-medium text-mid-green underline"
                                  onClick={() => updateLine(idx, { customItem: true })}
                                >
                                  Mark as custom line
                                </button>
                              </div>
                            ) : null}
                            {searchIdx === idx ? (
                              <div className="absolute left-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-light-green/40 bg-background p-2 shadow-lg">
                                <input
                                  autoFocus
                                  value={searchQ}
                                  onChange={(e) => {
                                    setSearchQ(e.target.value);
                                    setSearchLoading(e.target.value.trim().length > 0);
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
                            aria-label={`Description, line ${idx + 1}`}
                            className={`${cellInput} min-w-[10rem]`}
                            placeholder="Description"
                            title="Fetched from the product; edit as needed for this quote"
                          />
                        </td>
                        {form.showHsn ? (
                          <td className="px-1.5 py-1.5 align-top">
                            <input
                              data-line-field={`hsn-${idx}`}
                              value={line.hsnCode || ""}
                              inputMode="numeric"
                              aria-label={`HSN, line ${idx + 1}`}
                              aria-invalid={Boolean(hsnFieldError(line.hsnCode || "")) || undefined}
                              onChange={(e) =>
                                updateLine(idx, { hsnCode: sanitizeHsnInput(e.target.value) })
                              }
                              className={`${cellInput} min-w-[6.5rem] px-1 font-mono text-xs`}
                              placeholder="—"
                              title="HSN shown on the quotation"
                            />
                            {hsnFieldError(line.hsnCode || "") ? (
                              <p className="mt-0.5 text-[10px] text-red-700">
                                {hsnFieldError(line.hsnCode || "")}
                              </p>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-1.5 py-1.5 align-top">
                          <LineQtyInput
                            value={line.qty}
                            className={numInput}
                            ariaLabel={`Quantity, line ${idx + 1}`}
                            fieldId={`qty-${idx}`}
                            onCommit={(qty) => updateLine(idx, { qty })}
                            onReject={(message) => toast(message, "error")}
                          />
                        </td>
                        {form.showUnit ? (
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
                        ) : null}
                        {showVendorCost ? (
                        <td className="px-1.5 py-1.5 align-top">
                          <QuoteLineVendorCostCell
                            line={line}
                            selectClassName={`${cellInput} h-7 px-1 text-[10px] text-mid-green`}
                            onChooseCost={(quote) =>
                              updateLine(idx, {
                                costPrice: quote.unitPrice,
                                costVendorName: quote.vendorName,
                              })
                            }
                            onUseAsSell={(quote) =>
                              updateLine(idx, {
                                unitPrice: quote.unitPrice,
                                costPrice: quote.unitPrice,
                                costVendorName: quote.vendorName,
                              })
                            }
                          />
                        </td>
                        ) : null}
                        {showMarketplace ? (
                        <td className="px-1.5 py-1.5 align-top">
                          <MarketplacePriceStack
                            loading={
                              marketplaceByQuery[
                                marketplaceQueryFromText(
                                  line.catalogName,
                                  line.aliasName,
                                  line.description
                                )
                              ]?.loading
                            }
                            prices={
                              marketplaceByQuery[
                                marketplaceQueryFromText(
                                  line.catalogName,
                                  line.aliasName,
                                  line.description
                                )
                              ]?.prices
                            }
                            onPick={(price) => updateLine(idx, { unitPrice: price })}
                          />
                        </td>
                        ) : null}
                        {showCatalog ? (
                        <td className="px-1.5 py-1.5 align-top">
                          <CatalogPriceStack
                            loading={
                              line.productId
                                ? catalogByProductId[line.productId]?.loading
                                : false
                            }
                            prices={
                              line.productId
                                ? catalogByProductId[line.productId]?.prices
                                : null
                            }
                            onPick={(price) => updateLine(idx, { unitPrice: price })}
                          />
                        </td>
                        ) : null}
                        <td className="px-1.5 py-1.5 align-top">
                          <div data-line-field={`price-${idx}`}>
                          <CalcMoneyInput
                            value={line.unitPrice}
                            max={MAX_QUOTE_UNIT_PRICE}
                            onCommit={(unitPrice) => {
                              setNotice("");
                              updateLine(idx, { unitPrice });
                            }}
                            onRangeError={(message) => {
                              setNotice(message);
                              toast(message, "error");
                            }}
                            className={moneyInput}
                            title="Sell price on the quotation"
                            aria-label={`Sell price, line ${idx + 1}`}
                          />
                          {(() => {
                            const margin = lineMargin(line.unitPrice, line.costPrice);
                            const last = line.catalogLastPrice;
                            const suggest =
                              !(line.unitPrice > 0) && last != null && last > 0
                                ? { price: last, source: "last price" }
                                : !(line.unitPrice > 0) &&
                                    line.costPrice != null &&
                                    line.costPrice > 0
                                  ? { price: line.costPrice, source: "vendor cost" }
                                  : null;
                            return (
                              <div className="mt-0.5 space-y-0.5 text-[10px] leading-snug text-mid-green">
                                <div>
                                  {line.costPrice == null
                                    ? "Cost: no cost"
                                    : `Cost ${formatMoney(line.costPrice)}`}
                                  {margin.missing
                                    ? " · Margin —"
                                    : ` · Margin ${formatMoney(margin.amount)}${
                                        margin.percent != null ? ` (${margin.percent}%)` : ""
                                      }`}
                                </div>
                                {suggest ? (
                                  <button
                                    type="button"
                                    className="underline"
                                    onClick={() =>
                                      updateLine(idx, { unitPrice: suggest.price })
                                    }
                                  >
                                    Use {suggest.source} {formatMoney(suggest.price)}
                                  </button>
                                ) : null}
                              </div>
                            );
                          })()}
                          </div>
                          {clampDiscountPercent(line.discountPercent ?? 0) > 0 ? (
                            <span className="mt-0.5 block text-[10px] tabular-nums text-mid-green">
                              Net{" "}
                              {formatMoney(
                                effectiveUnitPrice(
                                  line.unitPrice,
                                  line.discountPercent
                                )
                              )}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-1.5 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={
                              clampDiscountPercent(line.discountPercent ?? 0) > 0
                                ? line.discountPercent ?? 0
                                : ""
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw.trim() === "") {
                                updateLine(idx, { discountPercent: 0 });
                                return;
                              }
                              const next = Number(raw);
                              if (!Number.isFinite(next)) return;
                              updateLine(idx, {
                                discountPercent: clampDiscountPercent(next),
                              });
                            }}
                            className={numInput}
                            title="Per-product discount % (editable)"
                            aria-label={`Discount percent, line ${idx + 1}`}
                            placeholder="0"
                          />
                        </td>
                        <td className="w-[6.5rem] px-1 py-1.5 align-top">
                          <div className="flex w-full max-w-[6.25rem] flex-col gap-1">
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={9999}
                                step={1}
                                value={(line.warrantyQty ?? 0) > 0 ? line.warrantyQty : ""}
                                placeholder="—"
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updateLine(idx, {
                                    warrantyQty:
                                      raw.trim() === ""
                                        ? 0
                                        : clampWarrantyQty(Number(raw)),
                                  });
                                }}
                                className={`${numInput} w-[2.35rem] px-0.5`}
                                title={
                                  (line.warrantyQty ?? 0) > 0
                                    ? "Warranty duration"
                                    : "Warranty not specified"
                                }
                                aria-label={`Warranty duration, line ${idx + 1}`}
                              />
                              <select
                                value={normalizeWarrantyUnit(line.warrantyUnit)}
                                onChange={(e) =>
                                  updateLine(idx, {
                                    warrantyUnit: e.target.value as WarrantyUnit,
                                  })
                                }
                                className={`${cellInput} min-w-0 flex-1 px-0.5 text-[10px]`}
                                title="Warranty unit"
                                aria-label="Warranty unit"
                              >
                                {WARRANTY_UNITS.map((unit) => (
                                  <option key={unit.value} value={unit.value}>
                                    {unit.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <select
                              value={normalizeWarrantyService(line.warrantyService)}
                              onChange={(e) =>
                                updateLine(idx, {
                                  warrantyService: e.target
                                    .value as WarrantyService,
                                })
                              }
                              className={`${cellInput} w-full px-0.5 text-[10px]`}
                              title="Warranty service type"
                              aria-label="Warranty service type"
                            >
                              {WARRANTY_SERVICES.map((service) => (
                                <option key={service.value || "none"} value={service.value}>
                                  {service.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-1.5 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.taxRate}
                            aria-label={`Tax rate, line ${idx + 1}`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw.trim() === "") return;
                              const next = Number(raw);
                              if (!Number.isFinite(next) || next < 0) return;
                              updateLine(idx, { taxRate: next });
                            }}
                            className={numInput}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right align-middle text-sm font-semibold tabular-nums text-dark-primary">
                          <div>{formatMoney(calc.lineTotals[idx] ?? 0)}</div>
                          {form.withGst ? (
                            <div className="text-[10px] font-normal normal-case tracking-normal text-mid-green">
                              excl. GST
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-1 py-1.5 align-middle">
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveLine(idx, -1)}
                              disabled={idx === 0}
                              className="rounded p-1 text-mid-green hover:bg-light-green/30 disabled:opacity-30"
                              aria-label={`Move line ${idx + 1} up`}
                            >
                              <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLine(idx, 1)}
                              disabled={idx === form.lineItems.length - 1}
                              className="rounded p-1 text-mid-green hover:bg-light-green/30 disabled:opacity-30"
                              aria-label={`Move line ${idx + 1} down`}
                            >
                              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateLine(idx)}
                              className="rounded p-1 text-mid-green hover:bg-light-green/30"
                              aria-label={`Duplicate line ${idx + 1}`}
                            >
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="rounded p-1 text-mid-green hover:bg-light-green/30"
                              disabled={form.lineItems.length <= 1}
                              aria-label={`Remove line ${idx + 1}`}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                id="quote-commercial"
                className="grid gap-2 border-t border-light-green/20 px-3 py-2 sm:grid-cols-3"
              >
                <label className="block text-xs">
                  <span className="mb-0.5 block text-mid-green">Payment terms</span>
                  <input
                    value={commercial.paymentTerms}
                    onChange={(e) => updateCommercial({ paymentTerms: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-0.5 block text-mid-green">
                    Validity {commercial.validity.trim() ? "" : "· not specified"}
                  </span>
                  <input
                    value={commercial.validity}
                    placeholder="Not specified"
                    onChange={(e) => updateCommercial({ validity: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-0.5 block text-mid-green">
                    Delivery {commercial.delivery.trim() ? "" : "· not specified"}
                  </span>
                  <input
                    value={commercial.delivery}
                    placeholder="Not specified"
                    onChange={(e) => updateCommercial({ delivery: e.target.value })}
                    className={field}
                  />
                </label>
                {warrantyAsk ? (
                  <button
                    type="button"
                    className="text-left text-xs text-mid-green underline sm:col-span-3"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        lineItems: f.lineItems.map((line) =>
                          (line.warrantyQty ?? 0) > 0
                            ? line
                            : {
                                ...line,
                                warrantyQty: warrantyAsk.qty,
                                warrantyUnit: warrantyAsk.unit,
                                warrantyService: warrantyAsk.service,
                              }
                        ),
                      }));
                    }}
                  >
                    RFQ asks for {warrantyAsk.qty} {warrantyAsk.unit}
                    {warrantyAsk.service ? ` ${warrantyAsk.service}` : ""} — apply to
                    lines that are not specified
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-light-green/20 px-3 py-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-mid-green">
                      Markup
                    </span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={openMarkupDialog}
                        className={`${chargeInput} inline-flex min-w-[7.25rem] items-center justify-between gap-1.5 px-2.5 hover:border-mid-green`}
                        title="Edit trader markup on cost into sell prices"
                      >
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-mid-green" strokeWidth={2} />
                          <span className="tabular-nums">
                            {hasAppliedMarkup
                              ? `${appliedMarkupPercent}%`
                              : "Select"}
                          </span>
                        </span>
                      </button>
                      {hasAppliedMarkup ? (
                        <button
                          type="button"
                          onClick={clearMarkup}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-light-green/35 text-mid-green hover:bg-light-green/20"
                          title="Clear markup"
                          aria-label="Clear markup"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      ) : null}
                    </div>
                    {hasAppliedMarkup ? (
                      <span className="mt-0.5 block max-w-[11rem] text-[10px] leading-snug text-mid-green">
                        Built into sell prices · click to edit
                      </span>
                    ) : null}
                  </div>
                  <div className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-mid-green">
                      Discount
                    </span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={openDiscountDialog}
                        className={`${chargeInput} inline-flex min-w-[7.25rem] items-center justify-between gap-1.5 px-2.5 hover:border-mid-green`}
                        title="Edit whole quote and/or per-product discount"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Percent className="h-3 w-3 text-mid-green" strokeWidth={2} />
                          <span className="tabular-nums">
                            {form.discountPercent > 0
                              ? `${form.discountPercent}% quote`
                              : form.discountAmount > 0
                                ? formatMoney(form.discountAmount)
                                : hasAnyLineDiscount
                                ? appliedLineDiscountPercent
                                  ? `${appliedLineDiscountPercent}% lines`
                                  : "Mixed lines"
                                : "Select"}
                          </span>
                        </span>
                      </button>
                      {form.discountPercent > 0 ||
                      form.discountAmount > 0 ||
                      hasAnyLineDiscount ? (
                        <button
                          type="button"
                          onClick={clearAllDiscounts}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-light-green/35 text-mid-green hover:bg-light-green/20"
                          title="Remove discount"
                          aria-label="Remove discount"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      ) : null}
                    </div>
                    {form.discountPercent > 0 ? (
                      <span className="mt-0.5 block max-w-[11rem] text-[10px] leading-snug text-mid-green">
                        Whole quote only · click to edit
                      </span>
                    ) : hasAnyLineDiscount ? (
                      <span className="mt-0.5 block max-w-[11rem] text-[10px] leading-snug text-mid-green">
                        Per product only · click to edit
                      </span>
                    ) : null}
                  </div>
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
                <div className="min-w-[18rem] flex-1 space-y-1.5 text-sm sm:max-w-md sm:flex-none">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-mid-green">Totals</span>
                    {hasOverrides ? (
                      <button
                        type="button"
                        onClick={resetCalculations}
                        className="inline-flex items-center gap-1 text-xs text-mid-green hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                        Reset
                      </button>
                    ) : null}
                  </div>
                  {vendorCostTotal > 0 ? (
                    <>
                      <div className="flex justify-between text-mid-green">
                        <span>Vendor cost</span>
                        <span className="tabular-nums font-medium">{formatMoney(vendorCostTotal)}</span>
                      </div>
                      {hasAppliedMarkup ? (
                        <div className="flex justify-between text-mid-green">
                          <span>Markup {appliedMarkupPercent}%</span>
                          <span className="tabular-nums font-medium">
                            +{formatMoney(calc.subtotal - vendorCostTotal)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-mid-green">
                          <span>Margin vs cost</span>
                          <span className="tabular-nums font-medium">
                            {formatMoney(calc.subtotal - vendorCostTotal)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : null}
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      {form.withGst ? "Subtotal excl. GST" : "Subtotal"}
                      {form.manualOverrides.subtotal ? " (manual)" : ""}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={calc.subtotal}
                      onChange={(e) =>
                        setOverride("subtotal", Number(e.target.value))
                      }
                      className="h-8 w-32 rounded border border-light-green/40 bg-background px-1.5 text-right text-sm font-medium tabular-nums outline-none"
                    />
                  </label>
                  {calc.discountAmount > 0 ? (
                    <div className="flex justify-between text-mid-green">
                      <span>Discount</span>
                      <span className="tabular-nums font-medium">-{formatMoney(calc.discountAmount)}</span>
                    </div>
                  ) : null}
                  {form.withGst && calc.gstSplit === "CGST_SGST" ? (
                    <>
                      <div className="flex justify-between">
                        <span>CGST</span>
                        <span className="tabular-nums font-medium">{formatMoney(calc.cgstAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SGST</span>
                        <span className="tabular-nums font-medium">{formatMoney(calc.sgstAmount)}</span>
                      </div>
                    </>
                  ) : null}
                  {form.withGst && calc.gstSplit === "IGST" ? (
                    <div className="flex justify-between">
                      <span>IGST</span>
                      <span className="tabular-nums font-medium">{formatMoney(calc.igstAmount)}</span>
                    </div>
                  ) : null}
                  <label className="flex items-center justify-between gap-3 rounded-md bg-dark-secondary px-3 py-2 text-background">
                    <span className="text-sm font-semibold">
                      {form.withGst ? "Grand total incl. GST" : "Grand total"}
                      {form.manualOverrides.grandTotal ? " · man" : ""}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={calc.grandTotal}
                      onChange={(e) =>
                        setOverride("grandTotal", Number(e.target.value))
                      }
                      aria-label={form.withGst ? "Grand total incl. GST" : "Grand total"}
                      className="w-36 bg-transparent text-right text-lg font-bold tabular-nums text-background outline-none"
                    />
                  </label>
                </div>
              </div>
            </section>
      </div>
    </form>
  );

  if (!requirementContext) return formBody;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {formBody}
      <div className="lg:sticky lg:top-3 lg:self-start lg:max-h-[calc(100vh-5rem)]">
        <QuoteRequirementSidebar context={requirementContext} />
      </div>
    </div>
  );
}

function LineQtyInput({
  value,
  onCommit,
  onReject,
  className,
  ariaLabel,
  fieldId,
}: {
  value: number;
  onCommit: (qty: number) => void;
  onReject: (message: string) => void;
  className?: string;
  ariaLabel: string;
  fieldId: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value));
  const [syncedValue, setSyncedValue] = useState(value);
  if (!focused && value !== syncedValue) {
    setSyncedValue(value);
    setText(Number.isFinite(value) ? String(value) : "");
  }

  return (
    <input
      data-line-field={fieldId}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={className}
      value={focused ? text : String(value)}
      onFocus={() => {
        setFocused(true);
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (/[a-z]/i.test(raw)) {
          onReject("Quantity must be a number");
          return;
        }
        setText(raw.replace(/[^\d.]/g, ""));
      }}
      onBlur={() => {
        setFocused(false);
        const trimmed = text.trim();
        if (!trimmed) {
          onReject("Quantity is required. The previous quantity was kept.");
          setText(String(value));
          return;
        }
        const next = Number(trimmed);
        if (!Number.isFinite(next) || next < 0) {
          onReject("Quantity cannot be negative. The previous quantity was kept.");
          setText(String(value));
          return;
        }
        if (next === 0) {
          onReject("Quantity is zero, so this line total becomes ₹0.");
        }
        onCommit(next);
      }}
    />
  );
}
