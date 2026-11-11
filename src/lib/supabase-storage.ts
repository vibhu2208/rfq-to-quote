import {
  getSupabaseAdmin,
  LEAD_ATTACHMENT_BUCKET,
  QUOTE_ATTACHMENT_BUCKET,
  supabaseStorageConfigured,
} from "@/lib/supabase";
import {
  deleteFromS3,
  downloadFromS3,
  ensureS3Bucket,
  s3ConfigFromEnv,
  uploadToS3,
} from "@/lib/s3-storage";

let quoteBucketReady: Promise<void> | null = null;
let leadBucketReady: Promise<void> | null = null;

export function isQuoteStorageSetupError(message: string): boolean {
  return /row-level security|already exists|must be owner|not allowed/i.test(message);
}

async function ensureSupabaseBucket(bucket: string): Promise<void> {
  if (!supabaseStorageConfigured()) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    if (!isQuoteStorageSetupError(listError.message)) {
      console.warn(`${bucket} bucket list skipped:`, listError.message);
    }
    return;
  }
  if (buckets?.some((b) => b.id === bucket || b.name === bucket)) {
    return;
  }
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: "20MB",
  });
  if (error && !isQuoteStorageSetupError(error.message)) {
    console.warn(`${bucket} bucket create skipped:`, error.message);
  }
}

export async function ensureQuoteAttachmentBucket(): Promise<void> {
  if (!supabaseStorageConfigured() && !s3ConfigFromEnv()) return;
  if (!quoteBucketReady) {
    quoteBucketReady = (async () => {
      if (s3ConfigFromEnv()) {
        await ensureS3Bucket(QUOTE_ATTACHMENT_BUCKET);
        return;
      }
      await ensureSupabaseBucket(QUOTE_ATTACHMENT_BUCKET);
    })().catch((e) => {
      quoteBucketReady = Promise.resolve();
      const message = e instanceof Error ? e.message : String(e);
      console.warn("Quote attachment storage setup skipped:", message);
    });
  }
  await quoteBucketReady;
}

export async function ensureLeadAttachmentBucket(): Promise<void> {
  if (!supabaseStorageConfigured() && !s3ConfigFromEnv()) return;
  if (!leadBucketReady) {
    leadBucketReady = (async () => {
      if (s3ConfigFromEnv()) {
        await ensureS3Bucket(LEAD_ATTACHMENT_BUCKET);
        return;
      }
      await ensureSupabaseBucket(LEAD_ATTACHMENT_BUCKET);
    })().catch((e) => {
      leadBucketReady = Promise.resolve();
      const message = e instanceof Error ? e.message : String(e);
      console.warn("Lead attachment storage setup skipped:", message);
    });
  }
  await leadBucketReady;
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

async function uploadAttachmentObject(
  path: string,
  contentType: string,
  body: Buffer,
  bucket: string
): Promise<string | null> {
  if (s3ConfigFromEnv()) {
    await ensureS3Bucket(bucket);
    return uploadToS3({
      key: path,
      body,
      contentType,
      bucket,
    });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  await ensureSupabaseBucket(bucket);
  const { error } = await Promise.race([
    supabase.storage.from(bucket).upload(path, body, {
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
  return uploadAttachmentObject(path, input.contentType, input.body, QUOTE_ATTACHMENT_BUCKET);
}

export async function uploadLeadAttachmentFile(input: {
  leadId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<string | null> {
  const path = leadAttachmentObjectPath(input.leadId, input.attachmentId, input.fileName);
  return uploadAttachmentObject(path, input.contentType, input.body, LEAD_ATTACHMENT_BUCKET);
}

async function downloadFromBuckets(
  storageKey: string,
  preferredBucket: string,
  fallbackBucket?: string
): Promise<Buffer | null> {
  if (!storageKey) return null;
  if (s3ConfigFromEnv()) {
    const primary = await downloadFromS3(storageKey, preferredBucket);
    if (primary) return primary;
    if (fallbackBucket && fallbackBucket !== preferredBucket) {
      const legacy = await downloadFromS3(storageKey, fallbackBucket);
      if (legacy) return legacy;
    }
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const primary = await supabase.storage.from(preferredBucket).download(storageKey);
  if (!primary.error && primary.data) {
    return Buffer.from(await primary.data.arrayBuffer());
  }
  if (fallbackBucket && fallbackBucket !== preferredBucket) {
    const legacy = await supabase.storage.from(fallbackBucket).download(storageKey);
    if (!legacy.error && legacy.data) {
      return Buffer.from(await legacy.data.arrayBuffer());
    }
  }
  return null;
}

export async function downloadQuoteAttachmentFile(storageKey: string): Promise<Buffer | null> {
  return downloadFromBuckets(storageKey, QUOTE_ATTACHMENT_BUCKET);
}

export async function downloadLeadAttachmentFile(storageKey: string): Promise<Buffer | null> {
  // Older lead uploads may still live in the quote-attachments bucket.
  return downloadFromBuckets(
    storageKey,
    LEAD_ATTACHMENT_BUCKET,
    QUOTE_ATTACHMENT_BUCKET
  );
}

export async function deleteQuoteAttachmentFile(storageKey: string): Promise<void> {
  if (!storageKey) return;
  if (s3ConfigFromEnv()) {
    await deleteFromS3(storageKey, QUOTE_ATTACHMENT_BUCKET);
    return;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).remove([storageKey]);
}

export async function deleteLeadAttachmentFile(storageKey: string): Promise<void> {
  if (!storageKey) return;
  if (s3ConfigFromEnv()) {
    await deleteFromS3(storageKey, LEAD_ATTACHMENT_BUCKET);
    await deleteFromS3(storageKey, QUOTE_ATTACHMENT_BUCKET);
    return;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.storage.from(LEAD_ATTACHMENT_BUCKET).remove([storageKey]);
  await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).remove([storageKey]);
}
