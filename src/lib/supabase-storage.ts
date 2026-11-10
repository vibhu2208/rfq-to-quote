import {
  getSupabaseAdmin,
  QUOTE_ATTACHMENT_BUCKET,
  supabaseStorageConfigured,
} from "@/lib/supabase";
import { deleteFromS3, downloadFromS3, s3ConfigFromEnv, uploadToS3 } from "@/lib/s3-storage";

let bucketReady: Promise<void> | null = null;

export function isQuoteStorageSetupError(message: string): boolean {
  return /row-level security|already exists|must be owner|not allowed/i.test(message);
}

export async function ensureQuoteAttachmentBucket(): Promise<void> {
  if (!supabaseStorageConfigured()) return;
  if (!bucketReady) {
    bucketReady = (async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return;
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) {
        if (!isQuoteStorageSetupError(listError.message)) {
          console.warn("Quote attachment bucket list skipped:", listError.message);
        }
        return;
      }
      if (buckets?.some((b) => b.id === QUOTE_ATTACHMENT_BUCKET || b.name === QUOTE_ATTACHMENT_BUCKET)) {
        return;
      }
      const { error } = await supabase.storage.createBucket(QUOTE_ATTACHMENT_BUCKET, {
        public: false,
        fileSizeLimit: "20MB",
      });
      if (error && !isQuoteStorageSetupError(error.message)) {
        console.warn("Quote attachment bucket create skipped:", error.message);
      }
    })().catch((e) => {
      bucketReady = Promise.resolve();
      const message = e instanceof Error ? e.message : String(e);
      console.warn("Quote attachment storage setup skipped:", message);
    });
  }
  await bucketReady;
}

export function storageObjectFileName(fileName: string): string {
  const trimmed = fileName.trim() || "file";
  const dot = trimmed.lastIndexOf(".");
  const ext = dot > 0 ? trimmed.slice(dot) : "";
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  const safeExt = ext
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w.]/g, "")
    .slice(0, 12);
  return `${base || "file"}${safeExt}`;
}

export function quoteAttachmentObjectPath(quoteId: string, attachmentId: string, fileName: string): string {
  return `quotes/${quoteId}/${attachmentId}/${storageObjectFileName(fileName)}`;
}

export function leadAttachmentObjectPath(leadId: string, attachmentId: string, fileName: string): string {
  return `leads/${leadId}/${attachmentId}/${storageObjectFileName(fileName)}`;
}

async function uploadAttachmentObject(path: string, contentType: string, body: Buffer): Promise<string | null> {
  if (s3ConfigFromEnv()) {
    return uploadToS3({
      key: path,
      body,
      contentType,
    });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  await ensureQuoteAttachmentBucket();
  const { error } = await Promise.race([
    supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).upload(path, body, {
      contentType: contentType || "application/octet-stream",
      upsert: true,
    }),
    new Promise<{ error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ error: { message: "Storage upload timed out" } }), 8000);
    }),
  ]);
  if (error) {
    if (isQuoteStorageSetupError(error.message) || /not found|bucket/i.test(error.message)) {
      console.warn("Attachment storage upload skipped:", error.message);
      return null;
    }
    throw new Error(error.message);
  }
  return path;
}

export async function uploadQuoteAttachmentFile(input: {
  quoteId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<string | null> {
  const path = quoteAttachmentObjectPath(input.quoteId, input.attachmentId, input.fileName);
  return uploadAttachmentObject(path, input.contentType, input.body);
}

export async function uploadLeadAttachmentFile(input: {
  leadId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<string | null> {
  const path = leadAttachmentObjectPath(input.leadId, input.attachmentId, input.fileName);
  return uploadAttachmentObject(path, input.contentType, input.body);
}

export async function downloadQuoteAttachmentFile(storageKey: string): Promise<Buffer | null> {
  if (!storageKey) return null;
  if (s3ConfigFromEnv()) {
    const fromS3 = await downloadFromS3(storageKey);
    if (fromS3) return fromS3;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).download(storageKey);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteQuoteAttachmentFile(storageKey: string): Promise<void> {
  if (!storageKey) return;
  if (s3ConfigFromEnv()) {
    await deleteFromS3(storageKey);
    return;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).remove([storageKey]);
}
