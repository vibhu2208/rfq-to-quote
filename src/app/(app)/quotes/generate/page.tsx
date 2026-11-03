"use client";

import Link from "next/link";
import { ClipboardEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import {
  ClientCompanyField,
  contactFieldsFromClient,
  type ClientHit,
} from "@/components/client-company-field";
import { QuoteCalculator } from "@/components/quote-calculator";
import { apiFetch, parseApiJson, userFacingFetchError } from "@/lib/fetch-error";
import { stabilizeIntakeFile } from "@/lib/intake-file";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,.csv,.xlsx,.xls,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fieldClass =
  "h-9 w-full rounded-lg border border-light-green/30 bg-background px-2.5 text-sm outline-none placeholder:text-mid-green/55 focus:border-mid-green";

function pickClipboardFile(files: FileList | File[]): File | null {
  const list = Array.from(files);
  return (
    list.find(
      (f) =>
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        /\.(pdf|png|jpe?g|webp|tif|tiff|heic|gif|bmp|docx?|txt|rtf|csv|xlsx|xls)$/i.test(f.name)
    ) || null
  );
}

function isSpreadsheet(file: File) {
  return /\.(csv|xlsx|xls)$/i.test(file.name) || /csv|spreadsheet|excel/i.test(file.type);
}

function fileKind(file: File): "sheet" | "image" | "pdf" | "doc" {
  if (isSpreadsheet(file)) return "sheet";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tif|tiff|heic)$/i.test(file.name)) {
    return "image";
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  return "doc";
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GenerateQuotePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [partyId, setPartyId] = useState("");

  const assignFile = useCallback((next: File | null) => {
    if (!next) {
      setFile(null);
      setError("");
      return;
    }
    void stabilizeIntakeFile(next)
      .then((stable) => {
        setFile(stable);
        setError("");
      })
      .catch((err) => {
        setFile(null);
        setError(userFacingFetchError(err, "Could not read that file"));
      });
  }, []);

  useEffect(() => {
    if (!file || fileKind(file) !== "image") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onPaste(e: ClipboardEvent) {
    const fromFiles = pickClipboardFile(e.clipboardData.files);
    if (fromFiles) {
      e.preventDefault();
      assignFile(fromFiles);
      return;
    }
    const item = Array.from(e.clipboardData.items).find(
      (i) => i.kind === "file" && (i.type.startsWith("image/") || i.type === "application/pdf")
    );
    const fromItem = item?.getAsFile() || null;
    if (fromItem) {
      e.preventDefault();
      assignFile(fromItem);
    }
  }

  function clearFile() {
    assignFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const pasted = String(form.get("text") || "").trim();

    if (!pasted && !file) {
      setError("Paste a requirement, or attach a photo, PDF, CSV, or document");
      setLoading(false);
      return;
    }

    try {
      let res: Response;
      if (file) {
        const upload = await stabilizeIntakeFile(file);
        const body = new FormData();
        body.append("file", upload);
        body.append("text", pasted);
        body.append("company", company);
        body.append("contactName", contactName);
        body.append("email", email);
        body.append("phone", phone);
        body.append("partyId", partyId);
        body.append("subject", String(form.get("subject") || ""));
        res = await apiFetch("/api/rfqs/from-document", { method: "POST", body });
      } else {
        res = await apiFetch("/api/rfqs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company,
            contactName: contactName || company || "From paste",
            email,
            phone,
            productNeeded: pasted,
            quantity: "",
            notes: "",
            subject: String(form.get("subject") || ""),
          }),
        });
      }
      const data = await parseApiJson<{
        id?: string;
        error?: string | { fieldErrors?: Record<string, string[]> };
      }>(res, "Could not capture this requirement");

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : data.error?.fieldErrors
              ? Object.values(data.error.fieldErrors as Record<string, string[]>)
                  .flat()
                  .join(", ")
              : "Could not capture this requirement"
        );
        return;
      }

      router.push(`/rfq/${data.id}`);
    } catch (err) {
      setError(userFacingFetchError(err, "Could not capture this requirement"));
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = loading
    ? file
      ? isSpreadsheet(file)
        ? "Matching catalog…"
        : "Extracting…"
      : "Creating…"
    : "Extract & continue";

  const kind = file ? fileKind(file) : null;
  const FileGlyph =
    kind === "sheet" ? FileSpreadsheet : kind === "image" ? ImageIcon : kind === "pdf" ? FileText : Paperclip;

  return (
    <form
      onSubmit={onSubmit}
      onPaste={onPaste}
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)]"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-light-green/20 px-4 py-2.5">
        <Link
          href="/quotes"
          className="text-sm text-mid-green hover:text-dark-primary hover:underline"
        >
          ← Quotes
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-dark-primary">Generate quote</h1>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-mid-green sm:block">
          Paste text, a screenshot, or a spreadsheet — we match the catalog next.
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <QuoteCalculator />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-mid-green px-3.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            {submitLabel}
          </button>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 border-b border-dark-primary/10 bg-dark-primary/[0.04] px-4 py-2 text-sm text-dark-primary">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.4fr)_minmax(17.5rem,0.85fr)] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col gap-3 border-light-green/20 p-4 lg:overflow-hidden lg:border-r">
          <label className="flex min-h-0 flex-1 flex-col text-sm">
            <span className="mb-1.5 flex items-center gap-1.5 font-medium text-dark-secondary">
              <ClipboardPaste className="h-3.5 w-3.5 text-mid-green" strokeWidth={1.5} />
              Requirement
            </span>
            <textarea
              name="text"
              className="min-h-[12rem] w-full flex-1 resize-none rounded-lg border border-light-green/30 bg-background px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-mid-green/55 focus:border-mid-green"
              placeholder="Paste WhatsApp text, email, RFQ, specs, quantities — or paste a screenshot anywhere on this page."
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-dark-secondary">
              File or screenshot
            </span>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = pickClipboardFile(e.dataTransfer.files);
                if (dropped) assignFile(dropped);
              }}
              className={`flex min-h-[5.5rem] cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-3 py-2.5 text-left transition ${
                dragOver
                  ? "border-mid-green bg-light-green/20"
                  : file
                    ? "border-mid-green/50 bg-light-green/10"
                    : "border-light-green/40 bg-background hover:border-mid-green/70"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => assignFile(e.target.files?.[0] || null)}
              />
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-mid-green">
                  <FileGlyph className="h-4 w-4" strokeWidth={1.5} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                {file ? (
                  <>
                    <span className="block truncate text-sm font-medium text-dark-primary">
                      {file.name || "Attached file"}
                    </span>
                    <span className="text-xs text-mid-green">{fileSizeLabel(file.size)}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm text-dark-primary">
                      Drop a file, paste a screenshot, or choose one
                    </span>
                    <span className="text-xs text-mid-green">
                      PDF, photo, Word, CSV, or Excel · Product, SKU, Qty · max 20MB
                    </span>
                  </>
                )}
              </span>
              {file ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-dark-secondary hover:bg-white"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Remove
                </button>
              ) : (
                <span className="inline-flex h-8 shrink-0 items-center rounded-md border border-light-green/35 bg-white px-2.5 text-xs font-medium text-dark-secondary">
                  Choose
                </span>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 bg-[#fbfaf6] p-4 lg:overflow-y-auto">
          <p className="text-sm font-medium text-dark-secondary">Client</p>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-mid-green">Company</span>
            <ClientCompanyField
              value={company}
              email={email}
              phone={phone}
              placeholder="Type client name or initials"
              onChange={(next) => {
                setCompany(next);
                if (!next.trim()) setPartyId("");
              }}
              onSelectClient={(client: ClientHit | null) => {
                if (!client) {
                  setPartyId("");
                  return;
                }
                setPartyId(client.id);
                setCompany(client.legalName);
                const fields = contactFieldsFromClient(client);
                if (fields.name) setContactName(fields.name);
                if (fields.email) setEmail(fields.email);
                if (fields.phone) setPhone(fields.phone);
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-mid-green">Contact</span>
            <input
              name="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className={fieldClass}
              placeholder="Who you are speaking with"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-mid-green">Email</span>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-mid-green">Phone</span>
              <input
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-mid-green">Subject</span>
            <input
              name="subject"
              className={fieldClass}
              placeholder="Short label on the requirement"
            />
          </label>
          <p className="mt-auto hidden text-[12px] leading-relaxed text-mid-green lg:block">
            Client fields are optional. Extract opens suggested products and vendors — then generate
            the quote.
          </p>
        </aside>
      </div>
    </form>
  );
}
