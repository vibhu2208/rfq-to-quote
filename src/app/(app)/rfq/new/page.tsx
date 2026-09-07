"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type IntakeMode = "text" | "document";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,image/*,application/pdf";

export default function CaptureRequirementPage() {
  const router = useRouter();
  const [mode, setMode] = useState<IntakeMode>("text");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      body.append("company", String(form.get("company") || ""));
      body.append("contactName", String(form.get("contactName") || ""));
      body.append("email", String(form.get("email") || ""));
      body.append("phone", String(form.get("phone") || ""));
      body.append("notes", String(form.get("notes") || ""));

      const res = await fetch("/api/quotes/from-document", {
        method: "POST",
        body,
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not create quote from document"
        );
        return;
      }

      router.push(`/quotes/${data.id}`);
      return;
    }

    const payload = {
      company: String(form.get("company") || ""),
      contactName: String(form.get("contactName") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
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
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="text-sm text-mid-green">
          <Link href="/inbox" className="hover:underline">
            ← Inbox
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-dark-primary">Capture requirement</h1>
        <p className="mt-1 text-sm text-mid-green">
          Type a requirement for the RFQ inbox, or upload a document/photo to extract product,
          model, company, quantity, and price into a draft quote right away.
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
        {mode === "document" ? (
          <>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Document or photo *</span>
              <input
                type="file"
                accept={ACCEPT}
                required
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-mid-green file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-background"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                }}
              />
              {file ? (
                <span className="mt-1.5 block text-xs text-mid-green">
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </span>
              ) : (
                <span className="mt-1.5 block text-xs text-mid-green">
                  PDF, PNG, JPG, WEBP, TIFF, HEIC, or DOCX — max 20MB. We pull product, model,
                  company, qty, and price into a draft quote.
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Company override (optional)</span>
              <input
                name="company"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="Leave blank to use company from the document"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Contact override (optional)</span>
              <input
                name="contactName"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="Leave blank to use contact from the document"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-dark-secondary">Email (optional)</span>
                <input
                  name="email"
                  type="email"
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-dark-secondary">Phone (optional)</span>
                <input
                  name="phone"
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
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
              <span className="mb-1.5 block text-dark-secondary">Company</span>
              <input
                name="company"
                className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                placeholder="Client company"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-dark-secondary">Contact name *</span>
              <input
                name="contactName"
                required
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
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-dark-secondary">Phone</span>
                <input
                  name="phone"
                  className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
            </div>
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
              ? "Extracting & creating quote…"
              : "Analysing…"
            : mode === "document"
              ? "Create quote from document"
              : "Capture & analyse"}
        </button>
      </form>
    </div>
  );
}
