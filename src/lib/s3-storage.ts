import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { QUOTE_ATTACHMENT_BUCKET } from "@/lib/supabase";

export type S3StorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
};

export function s3ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): S3StorageConfig | null {
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim() || "";
  if (!accessKeyId || !secretAccessKey) return null;
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  return {
    accessKeyId,
    secretAccessKey,
    bucket: env.S3_BUCKET?.trim() || QUOTE_ATTACHMENT_BUCKET,
    region: env.S3_REGION?.trim() || "eu-west-1",
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
  };
}

let client: S3Client | null = null;
let clientKey = "";
let bucketReady: Promise<void> | null = null;

function isMissingBucket(error: unknown): boolean {
  const name =
    error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const message = error instanceof Error ? error.message : String(error);
  return name === "NoSuchBucket" || /NoSuchBucket|specified bucket does not exist/i.test(message);
}

function s3Client(config: S3StorageConfig): S3Client {
  const key = `${config.region}|${config.endpoint || ""}|${config.accessKeyId}`;
  if (!client || clientKey !== key) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    clientKey = key;
    bucketReady = null;
  }
  return client;
}

async function ensureBucket(config: S3StorageConfig): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const s3 = s3Client(config);
      try {
        await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
        return;
      } catch {
        try {
          await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (!/already exists|BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(message)) {
            throw e;
          }
        }
      }
    })().catch((e) => {
      bucketReady = null;
      throw e;
    });
  }
  await bucketReady;
}

async function putObject(config: S3StorageConfig, input: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await s3Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType || "application/octet-stream",
    })
  );
}

export async function uploadToS3(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const config = s3ConfigFromEnv();
  if (!config) throw new Error("S3 is not configured");
  try {
    await putObject(config, input);
  } catch (error) {
    if (!isMissingBucket(error)) throw error;
    await ensureBucket(config);
    await putObject(config, input);
  }
  return input.key;
}

export async function downloadFromS3(key: string): Promise<Buffer | null> {
  const config = s3ConfigFromEnv();
  if (!config || !key) return null;
  try {
    const out = await s3Client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key })
    );
    if (!out.Body) return null;
    return Buffer.from(await out.Body.transformToByteArray());
  } catch {
    return null;
  }
}

export async function deleteFromS3(key: string): Promise<void> {
  const config = s3ConfigFromEnv();
  if (!config || !key) return;
  await s3Client(config)
    .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    .catch(() => undefined);
}
