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
import { useRouter } from "next/navigation";
import {
  ClientCompanyField,
  type ClientHit,
} from "@/components/client-company-field";

type IntakeMode = "text" | "document";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,image/*,application/pdf";

function pickClipboardFile(files: FileList | File[]): File | null {
  const list = Array.from(files);
  return (
    list.find(
      (f) =>
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        /\.(pdf|png|jpe?g|webp|tif|tiff|heic|gif|bmp|docx?|txt|rtf)$/i.test(f.name)
    ) || null
  );
}

function fileFromClipboard(e: ClipboardEvent): File | null {
  const fromFiles = pickClipboardFile(e.clipboardData.files);
  if (fromFiles) return fromFiles;
  const item = Array.from(e.clipboardData.items).find(
    (i) => i.kind === "file" && (i.type.startsWith("image/") || i.type === "application/pdf")
  );
  return item?.getAsFile() || null;
}

export default function CaptureRequirementPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
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

  function applyClient(client: ClientHit | null) {
    if (!client) {
      setPartyId("");
      return;
    }
    setPartyId(client.id);
    setCompany(client.legalName);
    if (client.managedByName) setContactName(client.managedByName);
    if (client.email) setEmail(client.email);
    if (client.phone) setPhone(client.phone);
  }

  const assignFile = useCallback((next: File | null) => {
    setFile(next);
    setError("");
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formEl = e.currentTarget;
    const form = new FormData(formEl);

    if (mode === "document") {
      if (!file) {
        setError("Choose a document or photo to upload");
        setLoading(false);
        return;
      }

      const body = new FormData();
      body.append("file", file);
      body.append("company", company);
      body.append("contactName", contactName);
      body.append("email", email);
      body.append("phone", phone);
      body.append("partyId", partyId);
      body.append("notes", String(form.get("notes") || ""));

      const res = await fetch("/api/rfqs/from-document", {
        method: "POST",
        body,
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not extract the requirement from this screenshot"
        );
        return;
      }

      router.push(`/rfq/${data.id}`);
      return;
    }

    const payload = {
      company,
      contactName,
      email,
      phone,
      productNeeded: String(form.get("productNeeded") || ""),
      quantity: String(form.get("quantity") || ""),
      notes: String(form.get("notes") || ""),
      subject: String(form.get("subject") || ""),
    };

    const res = await fetch("/api/rfqs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : data.error?.fieldErrors
            ? Object.values(data.error.fieldErrors as Record<string, string[]>)
                .flat()
                .join(", ")
            : "Could not capture requirement";
      setError(msg);
      return;
    }

    router.push(`/rfq/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6" onPaste={onPaste}>
      <div>
        <p className="text-sm text-mid-green">
          <Link href="/inbox" className="hover:underline">
            ← Inbox
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-dark-primary">Capture requirement</h1>
        <p className="mt-1 text-sm text-mid-green">
          Type a requirement, or paste a screenshot. Both go to suggested products and vendors
          next — then you convert to a quote.
        </p>
      </div>

      <div className="flex gap-2 rounded-lg bg-white/40 p-1">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "text"
              ? "bg-mid-green text-background"
              : "text-dark-secondary hover:bg-white/60"
          }`}
        >
          Type it
        </button>
        <button
          type="button"
          onClick={() => setMode("document")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "document"
              ? "bg-mid-green text-background"
              : "text-dark-secondary hover:bg-white/60"
          }`}
        >
          Upload → quote
        </button>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl bg-white/60 p-6 shadow-[0_8px_30px_rgba(11,43,38,0.08)]"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block text-dark-secondary">Company</span>
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
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-dark-secondary">
            Contact name{mode === "text" ? " *" : ""}
          </span>
          <input
            name="contactName"
            required={mode === "text"}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
            placeholder="Who you are speaking with"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-dark-secondary">Email</span>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-dark-secondary">Phone</span>
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
        </div>

        {mode === "document" ? (
          <>
            <div>
              <span className="mb-1.5 block text-sm text-dark-secondary">
                Paste screenshot or attach a document *
              </span>
              <div
                ref={pasteZoneRef}
                role="button"
                tabIndex={0}
                onClick={() => pasteZoneRef.current?.focus()}
                onPaste={onPaste}
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
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center outline-none transition focus:border-mid-green ${
                  dragOver
                    ? "border-mid-green bg-light-green/20"
                    : "border-light-green/50 bg-background hover:border-mid-green/70"
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
                    alt="Pasted screenshot"
                    className="mb-3 max-h-48 w-full rounded-md object-contain"
                  />
                ) : null}
                {file ? (
                  <span className="text-sm text-dark-primary">
                    {file.name || "Pasted screenshot"} (
                    {Math.max(1, Math.round(file.size / 1024))} KB)
                  </span>
                ) : (
                  <span className="text-sm text-mid-green">
                    Click here and press Ctrl+V to paste a screenshot, or drop a file
                  </span>
                )}
                <span className="mt-1 text-xs text-mid-green">
                  Screenshot from clipboard, photo, PDF, or Word — max 20MB. We extract the
                  items, then open suggested products and vendors.
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-light-green/40 bg-white/70 px-3 py-1.5 text-sm text-dark-secondary hover:bg-white"
                >
                  Choose file
                </button>
                {file ? (
                  <button
                    type="button"
                    onClick={() => {
                      assignFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="rounded-md px-3 py-1.5 text-sm text-dark-primary hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Notes (optional)</span>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              />
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Subject (optional)</span>
              <input
                name="subject"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="Short label for the inbox"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Product / service needed *</span>
              <textarea
                name="productNeeded"
                required
                rows={4}
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="Specs, brand, grade, size, delivery — everything they said"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Quantity</span>
              <input
                name="quantity"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="e.g. 500 pcs, 2 tonnes"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Extra notes</span>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="Deadline, budget hints, site constraints…"
              />
            </label>
          </>
        )}

        {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-mid-green px-4 py-2.5 font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
        >
          {loading
            ? mode === "document"
              ? "Extracting requirement…"
              : "Analysing…"
            : mode === "document"
              ? "Extract & continue"
              : "Capture & analyse"}
        </button>
      </form>
    </div>
  );
}
