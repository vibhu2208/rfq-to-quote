"use client";

import Link from "next/link";
import {
  ClipboardEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import {
  ClientCompanyField,
  contactFieldsFromClient,
  type ClientHit,
} from "@/components/client-company-field";
import { apiFetch, parseApiJson, userFacingFetchError } from "@/lib/fetch-error";
import { stabilizeIntakeFile } from "@/lib/intake-file";

type IntakeMode = "text" | "document";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (leadId: string) => void;
};

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,image/*,application/pdf";

function isAcceptedUpload(file: File) {
  if (!file) return false;
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword" ||
    file.type === "text/plain" ||
    file.type === "application/rtf" ||
    file.type === "text/rtf"
  ) {
    return true;
  }
  // Some OS drops leave type empty — trust the extension.
  return /\.(pdf|png|jpe?g|webp|tif|tiff|heic|gif|bmp|docx?|txt|rtf)$/i.test(
    file.name
  );
}

function pickClipboardFile(files: FileList | File[]): File | null {
  const list = Array.from(files);
  return list.find(isAcceptedUpload) || list[0] || null;
}

function fileFromClipboard(e: ClipboardEvent): File | null {
  const fromFiles = pickClipboardFile(e.clipboardData.files);
  if (fromFiles) return fromFiles;
  const item = Array.from(e.clipboardData.items).find(
    (i) =>
      i.kind === "file" &&
      (i.type.startsWith("image/") || i.type === "application/pdf")
  );
  return item?.getAsFile() || null;
}

export function CaptureRequirementDrawer({ open, onClose, onCreated }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [mode, setMode] = useState<IntakeMode>("text");
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
  const [copied, setCopied] = useState(false);
  const [publicUrl, setPublicUrl] = useState("/request");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPublicUrl(`${window.location.origin}/request`);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(false);
  }, [open]);

  function applyClient(client: ClientHit | null) {
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
  }

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
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onPaste(e: ClipboardEvent) {
    const pasted = fileFromClipboard(e);
    if (!pasted) return;
    e.preventDefault();
    setMode("document");
    assignFile(pasted);
  }

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formEl = e.currentTarget;
    const form = new FormData(formEl);

    try {
      if (mode === "document") {
        if (!file) {
          setError("Choose a document or photo to upload");
          return;
        }

        const upload = await stabilizeIntakeFile(file);
        const body = new FormData();
        body.append("file", upload);
        body.append("company", company);
        body.append("contactName", contactName);
        body.append("email", email);
        body.append("phone", phone);
        body.append("partyId", partyId);
        body.append("notes", String(form.get("notes") || ""));

        const res = await apiFetch("/api/rfqs/from-document", {
          method: "POST",
          body,
        });
        const data = await parseApiJson<{
          id?: string;
          error?: string;
        }>(res, "Could not extract the requirement from this screenshot");

        if (!res.ok || !data.id) {
          setError(
            typeof data.error === "string"
              ? data.error
              : "Could not extract the requirement from this screenshot"
          );
          return;
        }

        onCreated?.(data.id);
        onClose();
        return;
      }

      const productNeeded = String(form.get("productNeeded") || "").trim();
      const quantity = String(form.get("quantity") || "").trim();
      const notes = String(form.get("notes") || "").trim();
      const subject = String(form.get("subject") || "").trim();
      const requirement = [productNeeded, quantity ? `Qty: ${quantity}` : "", notes]
        .filter(Boolean)
        .join("\n");

      const res = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: contactName.trim() || company.trim() || "Unknown",
          customerCompany: company.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          subject: subject || `Lead: ${productNeeded.slice(0, 80)}`,
          requirement,
          channel: "MANUAL",
          skipDuplicateCheck: true,
        }),
      });
      const data = await parseApiJson<{
        id?: string;
        error?: string | { fieldErrors?: Record<string, string[]> };
      }>(res, "Could not capture requirement");

      if (!res.ok || !data.id) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : data.error &&
                typeof data.error === "object" &&
                "fieldErrors" in data.error &&
                data.error.fieldErrors
              ? Object.values(
                  data.error.fieldErrors as Record<string, string[]>
                )
                  .flat()
                  .join(", ")
              : "Could not capture requirement";
        setError(msg);
        return;
      }

      onCreated?.(data.id);
      onClose();
    } catch (err) {
      setError(userFacingFetchError(err, "Could not capture requirement"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-dark-primary/35"
        aria-label="Close capture drawer"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-drawer-title"
        className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-[-12px_0_40px_rgba(11,43,38,0.18)]"
        onPaste={onPaste}
        onDragOver={(e) => {
          // Keep browser from opening the dropped file as a navigation.
          if (mode === "document") e.preventDefault();
        }}
        onDrop={(e) => {
          if (mode !== "document") return;
          e.preventDefault();
          dragDepthRef.current = 0;
          setDragOver(false);
          const dropped = pickClipboardFile(e.dataTransfer.files);
          if (dropped) {
            assignFile(dropped);
            setError("");
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-dark-primary/8 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
              New lead
            </p>
            <h2
              id="capture-drawer-title"
              className="text-lg font-semibold text-dark-primary"
            >
              Create requirement
            </h2>
            <p className="mt-0.5 text-xs text-mid-green">
              Capture here, or share the public form with buyers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-mid-green hover:bg-dark-secondary/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
            <h3 className="text-sm font-semibold text-dark-primary">
              Public form
            </h3>
            <p className="mt-1 text-xs text-mid-green">
              Share this link so customers can submit a requirement themselves.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-dark-secondary/[0.05] px-2.5 py-2 text-[11px] text-dark-primary">
                {publicUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyPublicLink()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-dark-secondary/[0.06] px-3 text-xs font-medium text-dark-primary hover:bg-mid-green/15"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-mid-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <Link
                href="/request"
                target="_blank"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green/15 px-3 text-xs font-medium text-dark-primary hover:bg-mid-green/25"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </Link>
            </div>
          </section>

          <div className="flex gap-1 rounded-xl bg-dark-secondary/[0.05] p-1">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === "text"
                  ? "bg-dark-primary text-background"
                  : "text-mid-green hover:text-dark-primary"
              }`}
            >
              Type it
            </button>
            <button
              type="button"
              onClick={() => setMode("document")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === "document"
                  ? "bg-dark-primary text-background"
                  : "text-mid-green hover:text-dark-primary"
              }`}
            >
              Upload
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs text-mid-green">
              Company
              <div className="mt-1">
                <ClientCompanyField
                  value={company}
                  email={email}
                  phone={phone}
                  placeholder="Type client name or initials"
                  onChange={(next) => {
                    setCompany(next);
                    if (!next.trim()) setPartyId("");
                  }}
                  onSelectClient={applyClient}
                />
              </div>
            </label>
            <label className="block text-xs text-mid-green">
              Contact name{mode === "text" ? " *" : ""}
              <input
                name="contactName"
                required={mode === "text"}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                placeholder="Who you are speaking with"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-mid-green">
                Email
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                />
              </label>
              <label className="block text-xs text-mid-green">
                Phone
                <input
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                />
              </label>
            </div>

            {mode === "document" ? (
              <>
                <div>
                  <span className="mb-1 block text-xs text-mid-green">
                    Paste screenshot or attach a document *
                  </span>
                  <div
                    ref={pasteZoneRef}
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onPaste={onPaste}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragDepthRef.current += 1;
                      setDragOver(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = "copy";
                      }
                      setDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragDepthRef.current = Math.max(
                        0,
                        dragDepthRef.current - 1
                      );
                      if (dragDepthRef.current === 0) setDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragDepthRef.current = 0;
                      setDragOver(false);
                      const dropped = pickClipboardFile(e.dataTransfer.files);
                      if (dropped) {
                        assignFile(dropped);
                        setError("");
                      } else {
                        setError(
                          "Drop a PDF, image, Word, or text file (max 20MB)"
                        );
                      }
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-8 text-center outline-none transition ${
                      dragOver
                        ? "border-mid-green bg-mid-green/10"
                        : "border-dark-primary/15 bg-dark-secondary/[0.03] hover:border-mid-green/50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT}
                      className="sr-only"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const next = e.target.files?.[0] || null;
                        if (next) assignFile(next);
                      }}
                    />
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Pasted screenshot"
                        className="pointer-events-none mb-2 max-h-36 w-full rounded-md object-contain"
                      />
                    ) : null}
                    {file ? (
                      <span className="pointer-events-none text-sm text-dark-primary">
                        {file.name || "Pasted screenshot"} (
                        {Math.max(1, Math.round(file.size / 1024))} KB)
                      </span>
                    ) : (
                      <>
                        <span className="pointer-events-none text-sm font-medium text-dark-primary">
                          {dragOver
                            ? "Drop file to attach"
                            : "Drop a file here"}
                        </span>
                        <span className="pointer-events-none mt-1 text-xs text-mid-green">
                          Or click to browse · Ctrl+V to paste a screenshot
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full bg-dark-secondary/[0.06] px-3 py-1.5 text-xs font-medium text-dark-primary"
                    >
                      Choose file
                    </button>
                    {file ? (
                      <button
                        type="button"
                        onClick={() => {
                          assignFile(null);
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                        }}
                        className="rounded-full px-3 py-1.5 text-xs text-mid-green hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="block text-xs text-mid-green">
                  Notes (optional)
                  <textarea
                    name="notes"
                    rows={2}
                    className="mt-1 w-full rounded-lg bg-dark-secondary/[0.05] px-3 py-2 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="block text-xs text-mid-green">
                  Subject (optional)
                  <input
                    name="subject"
                    className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                    placeholder="Short label"
                  />
                </label>
                <label className="block text-xs text-mid-green">
                  Product / service needed *
                  <textarea
                    name="productNeeded"
                    required
                    rows={4}
                    className="mt-1 w-full rounded-lg bg-dark-secondary/[0.05] px-3 py-2 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                    placeholder="Specs, brand, grade, size, delivery…"
                  />
                </label>
                <label className="block text-xs text-mid-green">
                  Quantity
                  <input
                    name="quantity"
                    className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                    placeholder="e.g. 500 pcs"
                  />
                </label>
                <label className="block text-xs text-mid-green">
                  Extra notes
                  <textarea
                    name="notes"
                    rows={2}
                    className="mt-1 w-full rounded-lg bg-dark-secondary/[0.05] px-3 py-2 text-sm text-dark-primary outline-none focus:ring-1 focus:ring-mid-green/30"
                    placeholder="Deadline, budget, site constraints…"
                  />
                </label>
              </>
            )}

            {error ? (
              <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-10 w-full rounded-full bg-dark-primary text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
            >
              {loading
                ? mode === "document"
                  ? "Extracting…"
                  : "Creating…"
                : mode === "document"
                  ? "Extract & create"
                  : "Create requirement"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
