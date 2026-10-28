"use client";

import Link from "next/link";
import { ClipboardEvent, FormEvent, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

export default function GenerateQuotePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const assignFile = useCallback((next: File | null) => {
    setFile(next);
    setError("");
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
      setError("Paste a requirement, or attach a photo, PDF, or document");
      setLoading(false);
      return;
    }

    const body = new FormData();
    body.append("text", pasted);
    body.append("company", String(form.get("company") || ""));
    body.append("contactName", String(form.get("contactName") || ""));
    body.append("email", String(form.get("email") || ""));
    body.append("phone", String(form.get("phone") || ""));
    body.append("subject", String(form.get("subject") || ""));
    if (file) body.append("file", file);

    const res = await fetch("/api/quotes/generate", {
      method: "POST",
      body,
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Could not generate quote from this requirement"
      );
      return;
    }

    router.push(`/quotes/${data.id}`);
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
          Paste the requirement, or drop a photo / PDF / document. We create the requirement and a
          draft quote from it.
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
            Or photo / PDF / document
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
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
              PDF, photo (PNG/JPG/WEBP/HEIC), Word, or text — max 20MB
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
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="rounded-md border border-light-green/40 bg-white/70 px-3 py-1.5 text-sm text-dark-secondary hover:bg-white"
            >
              Take photo
            </button>
            {file ? (
              <button
                type="button"
                onClick={() => {
                  assignFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  if (cameraInputRef.current) cameraInputRef.current.value = "";
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
            <input
              name="company"
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              placeholder="Client company — used to match master"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-dark-secondary">Contact (optional)</span>
            <input
              name="contactName"
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              placeholder="Who you are speaking with"
            />
          </label>
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
              ? "Reading document & generating quote…"
              : "Creating requirement & quote…"
            : "Generate quote"}
        </button>
      </form>
    </div>
  );
}
