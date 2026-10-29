export const QUOTE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

const TYPE_FILENAMES: Record<string, string> = {
  "image/png": "pasted-screenshot.png",
  "image/jpeg": "pasted-screenshot.jpg",
  "image/jpg": "pasted-screenshot.jpg",
  "image/webp": "pasted-screenshot.webp",
  "image/gif": "pasted-screenshot.gif",
  "image/heic": "pasted-screenshot.heic",
  "image/heif": "pasted-screenshot.heic",
  "image/tiff": "pasted-screenshot.tiff",
  "image/bmp": "pasted-screenshot.bmp",
  "application/pdf": "document.pdf",
  "text/plain": "note.txt",
};

export type QuoteAttachmentMeta = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  note: string;
  hasFile: boolean;
  createdAt: string;
};

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "attachment").slice(0, 180);
}

export function filenameFromUpload(file: { name?: string; type?: string }): string {
  const name = (file.name || "").trim();
  if (name && name !== "image.png" && name.includes(".")) return sanitizeFileName(name);
  const typed = TYPE_FILENAMES[file.type || ""];
  if (typed) return typed;
  return sanitizeFileName(name || "attachment");
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewableAttachment(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType === "application/pdf" ||
    contentType.startsWith("text/")
  );
}
