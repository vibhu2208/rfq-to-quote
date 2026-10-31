"use client";

import Link from "next/link";
import { ClipboardEvent, FormEvent, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClientCompanyField,
  contactFieldsFromClient,
  type ClientHit,
} from "@/components/client-company-field";
import { apiFetch, parseApiJson, userFacingFetchError } from "@/lib/fetch-error";
import { stabilizeIntakeFile } from "@/lib/intake-file";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,.csv,.xlsx,.xls,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

export default function GenerateQuotePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6" onPaste={onPaste}>
      <div>
        <p className="text-sm text-mid-green">
          <Link href="/quotes" className="hover:underline">
            ← Quotes
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-dark-primary">Generate quote</h1>
        <p className="mt-1 text-sm text-mid-green">
          Paste text, a screenshot, or a CSV of line items. We extract the requirement, match it to
          the product catalog, then open suggested products and vendors.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-xl bg-white/60 p-6 shadow-[0_8px_30px_rgba(11,43,38,0.08)]"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-dark-secondary">Paste requirement</span>
          <textarea
            name="text"
            rows={8}
            className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
            placeholder="Paste WhatsApp text, email, RFQ, specs, quantities — anything they sent. You can also paste a screenshot here."
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-dark-secondary">
            Or photo / PDF / CSV / document
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
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
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
            {file ? (
              <span className="text-sm text-dark-primary">
                {file.name || "Attached file"} ({Math.max(1, Math.round(file.size / 1024))} KB)
              </span>
            ) : (
              <span className="text-sm text-mid-green">
                Drop a file here, paste a screenshot, or choose one
              </span>
            )}
            <span className="mt-1 text-xs text-mid-green">
              PDF, photo, Word, CSV, or Excel — columns like Product, SKU, Qty — max 20MB
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

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-dark-secondary">Company (optional)</span>
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
            <span className="mb-1.5 block text-dark-secondary">Contact (optional)</span>
            <input
              name="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              placeholder="Who you are speaking with"
            />
          </label>
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

        <label className="block text-sm">
          <span className="mb-1.5 block text-dark-secondary">Subject (optional)</span>
          <input
            name="subject"
            className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
            placeholder="Short label on the quote / requirement"
          />
        </label>

        {error ? <p className="text-sm text-dark-primary">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-mid-green px-4 py-2.5 font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
        >
          {loading
            ? file
              ? /\.(csv|xlsx|xls)$/i.test(file.name)
                ? "Matching catalog from spreadsheet…"
                : "Extracting requirement from screenshot…"
              : "Creating requirement…"
            : "Extract & continue"}
        </button>
      </form>
    </div>
  );
}
