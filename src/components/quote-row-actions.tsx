"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Download,
  Eye,
  Mail,
  MessageCircle,
  Pencil,
  Printer,
  Send,
  Upload,
  X,
} from "lucide-react";

const QuotePdfPreviewModal = dynamic(
  () => import("@/components/quote-pdf-preview-modal").then((m) => m.QuotePdfPreviewModal),
  { ssr: false },
);
const QuoteAttachmentsDialog = dynamic(
  () => import("@/components/quote-attachments-dialog").then((m) => m.QuoteAttachmentsDialog),
  { ssr: false },
);

export type QuoteRowActionQuote = {
  id: string;
  quoteNumber: string;
  quoteName?: string | null;
  buyerEmail: string;
  buyerPhone: string;
};

export function QuoteRowActions({
  quote,
  attachmentCount = 0,
}: {
  quote: QuoteRowActionQuote;
  attachmentCount?: number;
}) {
  const [busy, setBusy] = useState<"print" | "download" | "email" | null>(null);
  const [error, setError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attached, setAttached] = useState(attachmentCount);
  const [sendTo, setSendTo] = useState(quote.buyerEmail);
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);

  const fileName = quote.quoteNumber || "quote";

  async function onPrint() {
    setBusy("print");
    setError("");
    try {
      const { printQuotePdf } = await import("@/lib/quote-pdf-client");
      await printQuotePdf(quote.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDownload() {
    setBusy("download");
    setError("");
    try {
      const { downloadQuotePdf } = await import("@/lib/quote-pdf-client");
      await downloadQuotePdf(quote.id, fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  function openEmail() {
    setSendTo(quote.buyerEmail.trim());
    setSendNote("");
    setError("");
    setEmailOpen(true);
  }

  async function sendEmail() {
    const to = sendTo.trim();
    if (!to) {
      setError("Enter an email address");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quote.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "EMAIL",
          to,
          note: sendNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Send failed");
      }
      setEmailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-light-green/25 disabled:opacity-40";

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <Link href={`/quotes/${quote.id}`} className={btn} title="Edit">
          <Pencil className="h-4 w-4" strokeWidth={1.5} />
          <span className="sr-only">Edit</span>
        </Link>
        <button
          type="button"
          className={btn}
          title="Preview"
          onClick={() => {
            setError("");
            setPreviewOpen(true);
          }}
        >
          <Eye className="h-4 w-4" strokeWidth={1.5} />
          <span className="sr-only">Preview</span>
        </button>
        <button
          type="button"
          className={`${btn} relative`}
          title="Attach note, screenshot, or file"
          onClick={() => {
            setError("");
            setAttachOpen(true);
          }}
        >
          <Upload className="h-4 w-4" strokeWidth={1.5} />
          {attached > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 min-w-3 rounded-full bg-mid-green px-0.5 text-[9px] leading-3 text-background">
              {attached > 9 ? "9+" : attached}
            </span>
          ) : null}
          <span className="sr-only">Upload</span>
        </button>
        <button type="button" className={btn} title="Print" disabled={busy !== null} onClick={() => void onPrint()}>
          <Printer className="h-4 w-4" strokeWidth={1.5} />
          <span className="sr-only">Print</span>
        </button>
        <button type="button" className={btn} title="Email" disabled={busy !== null} onClick={openEmail}>
          <Mail className="h-4 w-4" strokeWidth={1.5} />
          <span className="sr-only">Email</span>
        </button>
        <button
          type="button"
          className={btn}
          title="WhatsApp (coming soon)"
          onClick={() => {
            setError("");
            setWhatsAppOpen(true);
          }}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
          <span className="sr-only">WhatsApp</span>
        </button>
        <button
          type="button"
          className={btn}
          title="Download"
          disabled={busy !== null}
          onClick={() => void onDownload()}
        >
          <Download className="h-4 w-4" strokeWidth={1.5} />
          <span className="sr-only">Download</span>
        </button>
      </div>
      {error && !emailOpen && !whatsAppOpen ? (
        <p className="mt-1 text-right text-[11px] text-dark-primary">{error}</p>
      ) : null}

      {emailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`email-quote-${quote.id}`}
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`email-quote-${quote.id}`} className="text-lg font-semibold">
                  Email quote
                </h2>
                <p className="mt-1 text-sm text-mid-green">
                  {quote.quoteNumber}
                  {quote.quoteName ? ` · ${quote.quoteName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="rounded-lg p-1 hover:bg-light-green/20"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-mid-green" />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">Email</span>
                <input
                  type="email"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                  placeholder="buyer@example.com"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">Note (optional)</span>
                <textarea
                  value={sendNote}
                  onChange={(e) => setSendNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-mid-green hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendEmail()}
                className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
              >
                <Send className="h-4 w-4" strokeWidth={1.5} />
                {sending ? "Sending…" : "Send quote"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <QuotePdfPreviewModal
          quoteId={quote.id}
          quoteNumber={quote.quoteNumber}
          quoteName={quote.quoteName}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {attachOpen ? (
        <QuoteAttachmentsDialog
          quoteId={quote.id}
          quoteNumber={quote.quoteNumber}
          quoteName={quote.quoteName}
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          onCountChange={setAttached}
        />
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
    </>
  );
}
