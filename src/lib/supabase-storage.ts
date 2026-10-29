import { prisma } from "@/lib/prisma";
import {
  getSupabaseAdmin,
  QUOTE_ATTACHMENT_BUCKET,
  supabaseStorageConfigured,
} from "@/lib/supabase";

let bucketReady: Promise<void> | null = null;

export async function ensureQuoteAttachmentBucket(): Promise<void> {
  if (!supabaseStorageConfigured()) return;
  if (!bucketReady) {
    bucketReady = (async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return;
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO storage.buckets (id, name, public, file_size_limit)
          VALUES ('${QUOTE_ATTACHMENT_BUCKET}', '${QUOTE_ATTACHMENT_BUCKET}', false, 20971520)
          ON CONFLICT (id) DO NOTHING
        `);
        return;
      }
      if (buckets?.some((b) => b.id === QUOTE_ATTACHMENT_BUCKET || b.name === QUOTE_ATTACHMENT_BUCKET)) {
        return;
      }
      const { error } = await supabase.storage.createBucket(QUOTE_ATTACHMENT_BUCKET, {
        public: false,
        fileSizeLimit: "20MB",
      });
      if (error && !/already exists/i.test(error.message)) {
        throw new Error(error.message);
      }
    })().catch((e) => {
      bucketReady = null;
      throw e;
    });
  }
  await bucketReady;
}

export function quoteAttachmentObjectPath(quoteId: string, attachmentId: string, fileName: string): string {
  const safe = fileName.replace(/[/\\]/g, "_") || "file";
  return `quotes/${quoteId}/${attachmentId}/${safe}`;
}

export async function uploadQuoteAttachmentFile(input: {
  quoteId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  await ensureQuoteAttachmentBucket();
  const path = quoteAttachmentObjectPath(input.quoteId, input.attachmentId, input.fileName);
  const { error } = await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).upload(path, input.body, {
    contentType: input.contentType || "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function downloadQuoteAttachmentFile(storageKey: string): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !storageKey) return null;
  const { data, error } = await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).download(storageKey);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteQuoteAttachmentFile(storageKey: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !storageKey) return;
  await supabase.storage.from(QUOTE_ATTACHMENT_BUCKET).remove([storageKey]);
}
