"use client";

import {
  ClipboardEvent,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Download,
  Eye,
  FileText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { errorMessageFromJson, readJsonResponse } from "@/lib/http";
import {
  formatAttachmentSize,
  isPreviewableAttachment,
  QUOTE_ATTACHMENT_MAX_BYTES,
  type QuoteAttachmentMeta,
} from "@/lib/quote-attachments";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.gif,.bmp,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*";

function pickClipboardFile(files: FileList | File[]): File | null {
  const list = Array.from(files);
  return list.find((f) => f.size > 0) || null;
}

function fileFromClipboard(e: ClipboardEvent): File | null {
  const fromFiles = pickClipboardFile(e.clipboardData.files);
  if (fromFiles) return fromFiles;
  const item = Array.from(e.clipboardData.items).find(
    (i) => i.kind === "file" && (i.type.startsWith("image/") || i.type === "application/pdf")
  );
  return item?.getAsFile() || null;
}

function fileLabel(file: File): string {
  if (file.name && file.name !== "image.png") return file.name;
  if (file.type.startsWith("image/")) return "Pasted screenshot";
  if (file.type === "application/pdf") return "PDF";
  return file.name || "File";
}

export function QuoteAttachmentsDialog({
  quoteId,
  quoteNumber,
  quoteName,
  open,
  onClose,
  onCountChange,
}: {
  quoteId: string;
  quoteNumber: string;
  quoteName?: string | null;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<QuoteAttachmentMeta[]>([]);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<QuoteAttachmentMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/attachments`);
      const { data, parseError } = await readJsonResponse<{
        attachments?: QuoteAttachmentMeta[];
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(errorMessageFromJson(data, parseError || "Could not load attachments"));
      }
      const next = data?.attachments ?? [];
      setItems(next);
      onCountChange?.(next.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load attachments");
    } finally {
      setLoading(false);
    }
  }, [onCountChange, quoteId]);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setFile(null);
    setError("");
    setPreview(null);
    void load();
    const t = window.setTimeout(() => pasteZoneRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [load, open]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function assignFile(next: File | null) {
    if (next && next.size > QUOTE_ATTACHMENT_MAX_BYTES) {
      setError(`File is too large (max ${QUOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB)`);
      return;
    }
    setFile(next);
    setError("");
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const pasted = fileFromClipboard(e);
    if (pasted) {
      e.preventDefault();
      assignFile(pasted);
      return;
    }
    const text = e.clipboardData.getData("text/plain").trim();
    if (text && e.target instanceof HTMLTextAreaElement) return;
    if (text) {
      e.preventDefault();
      setNote((prev) => (prev ? `${prev}\n${text}` : text));
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = pickClipboardFile(e.dataTransfer.files);
    if (dropped) assignFile(dropped);
  }

  async function save() {
    if (!file && !note.trim()) {
      setError("Add a note, paste a screenshot, or choose a file");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      if (file) body.append("file", file);
      if (note.trim()) body.append("note", note.trim());
      const res = await fetch(`/api/quotes/${quoteId}/attachments`, {
        method: "POST",
        body,
      });
      const { data, parseError } = await readJsonResponse<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(errorMessageFromJson(data, parseError || "Upload failed"));
      }
      setNote("");
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: QuoteAttachmentMeta) {
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/attachments/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const { data, parseError } = await readJsonResponse<{ error?: string }>(res);
        throw new Error(errorMessageFromJson(data, parseError || "Delete failed"));
      }
      setItems((prev) => {
        const next = prev.filter((a) => a.id !== item.id);
        onCountChange?.(next.length);
        return next;
      });
      if (preview?.id === item.id) setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`attach-quote-${quoteId}`}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`attach-quote-${quoteId}`} className="text-lg font-semibold">
              Attach to quote
            </h2>
            <p className="mt-1 text-sm text-mid-green">
              {quoteNumber}
              {quoteName ? ` · ${quoteName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-light-green/20"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-mid-green" />
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div
            ref={pasteZoneRef}
            tabIndex={0}
            onPaste={onPaste}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => pasteZoneRef.current?.focus()}
            className={`cursor-text rounded-lg border border-dashed px-3 py-4 outline-none ${
              dragOver ? "border-mid-green bg-light-green/20" : "border-light-green/50 bg-white/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                assignFile(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex items-start gap-3">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-16 w-16 rounded-md object-cover"
                  />
                ) : (
                  <FileText className="mt-0.5 h-5 w-5 text-mid-green" strokeWidth={1.5} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fileLabel(file)}</p>
                  <p className="text-xs text-mid-green">{formatAttachmentSize(file.size)}</p>
                  <button
                    type="button"
                    onClick={() => assignFile(null)}
                    className="mt-1 text-xs text-mid-green underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="mx-auto h-5 w-5 text-mid-green" strokeWidth={1.5} />
                <p className="mt-2 text-sm text-dark-primary">
                  Paste a screenshot, drop a file, or{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    choose one
                  </button>
                </p>
                <p className="mt-1 text-xs text-mid-green">
                  Photo, PDF, Word, note, or any file — max 20MB
                </p>
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Internal note, follow-up, or caption for the file"
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>

          {error ? <p className="text-sm text-dark-primary">{error}</p> : null}

          <div>
            <h3 className="text-sm font-medium">Saved on this quote</h3>
            {loading ? (
              <p className="mt-2 text-sm text-mid-green">Loading…</p>
            ) : items.length === 0 ? (
              <p className="mt-2 text-sm text-mid-green">Nothing attached yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-light-green/30 rounded-lg border border-light-green/30 bg-white/40">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 px-3 py-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-mid-green" strokeWidth={1.5} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.hasFile ? item.fileName : "Note"}</p>
                      <p className="text-[11px] text-mid-green">
                        {item.hasFile ? formatAttachmentSize(item.size) : "Text"}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      {(item.hasFile && isPreviewableAttachment(item.contentType)) || item.note ? (
                        <button
                          type="button"
                          className="rounded-lg p-1 text-mid-green hover:bg-light-green/20"
                          title="Preview"
                          onClick={() => setPreview(item)}
                        >
                          <Eye className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      ) : null}
                      {item.hasFile ? (
                        <a
                          href={`/api/quotes/${quoteId}/attachments/${item.id}`}
                          className="rounded-lg p-1 text-mid-green hover:bg-light-green/20"
                          title="Download"
                        >
                          <Download className="h-4 w-4" strokeWidth={1.5} />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-lg p-1 text-mid-green hover:bg-light-green/20"
                        title="Delete"
                        onClick={() => void remove(item)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-mid-green hover:bg-light-green/20"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            {saving ? "Saving…" : "Save attachment"}
          </button>
        </div>
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/50 px-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-medium">
                {preview.hasFile ? preview.fileName : "Note"}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg p-1 hover:bg-slate-100"
                aria-label="Close attachment preview"
              >
                <X className="h-5 w-5 text-slate-700" />
              </button>
            </div>
            <div className="min-h-[40vh] overflow-auto bg-slate-50 p-4">
              {preview.note ? (
                <p className="mb-3 whitespace-pre-wrap text-sm text-dark-primary">{preview.note}</p>
              ) : null}
              {preview.hasFile && preview.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/quotes/${quoteId}/attachments/${preview.id}?inline=1`}
                  alt={preview.fileName}
                  className="mx-auto max-h-[70vh] max-w-full rounded-md"
                />
              ) : preview.hasFile && preview.contentType === "application/pdf" ? (
                <iframe
                  title={preview.fileName}
                  src={`/api/quotes/${quoteId}/attachments/${preview.id}?inline=1`}
                  className="h-[70vh] w-full rounded-md bg-white"
                />
              ) : preview.hasFile && preview.contentType.startsWith("text/") ? (
                <iframe
                  title={preview.fileName}
                  src={`/api/quotes/${quoteId}/attachments/${preview.id}?inline=1`}
                  className="h-64 w-full rounded-md bg-white"
                />
              ) : preview.hasFile ? (
                <a
                  href={`/api/quotes/${quoteId}/attachments/${preview.id}`}
                  className="text-sm text-mid-green underline"
                >
                  Download {preview.fileName}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
