import { describe, expect, it } from "vitest";
import {
  filenameFromUpload,
  formatAttachmentSize,
  isPreviewableAttachment,
  parseQuoteAttachmentApiPath,
  sanitizeFileName,
} from "@/lib/quote-attachments";
import {
  isQuoteStorageSetupError,
  quoteAttachmentObjectPath,
} from "@/lib/supabase-storage";
import { s3ConfigFromEnv } from "@/lib/s3-storage";

describe("parseQuoteAttachmentApiPath", () => {
  it("reads quote id and attachment id from the delete URL", () => {
    expect(
      parseQuoteAttachmentApiPath(
        "/api/quotes/cmvwbc8tq003tm330qrnfexlx/attachments/cmvwd0v9r0005m3b4poftol9g"
      )
    ).toEqual({
      quoteId: "cmvwbc8tq003tm330qrnfexlx",
      attachmentId: "cmvwd0v9r0005m3b4poftol9g",
    });
  });

  it("returns null for the attachments collection URL", () => {
    expect(
      parseQuoteAttachmentApiPath("/api/quotes/cmvwbc8tq003tm330qrnfexlx/attachments")
    ).toBeNull();
  });
});

describe("quote attachments", () => {
  it("sanitizes unsafe file names", () => {
    expect(sanitizeFileName(`quote\\scan?.pdf`)).toBe("quote_scan_.pdf");
    expect(sanitizeFileName("   ")).toBe("attachment");
  });

  it("names pasted screenshots from mime type", () => {
    expect(filenameFromUpload({ name: "image.png", type: "image/png" })).toBe(
      "pasted-screenshot.png"
    );
    expect(filenameFromUpload({ name: "spec.docx", type: "" })).toBe("spec.docx");
  });

  it("formats sizes and previewable types", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(2048)).toBe("2.0 KB");
    expect(isPreviewableAttachment("image/jpeg")).toBe(true);
    expect(isPreviewableAttachment("application/pdf")).toBe(true);
    expect(isPreviewableAttachment("application/vnd.ms-excel")).toBe(false);
  });
});

describe("quoteAttachmentObjectPath", () => {
  it("uses an ASCII storage key so names with spaces and accents do not fail upload", () => {
    const path = quoteAttachmentObjectPath(
      "quote-1",
      "att-1",
      "Chote Bade Café_ Good Food, Bright Moments.png"
    );
    expect(path).toBe("quotes/quote-1/att-1/Chote_Bade_Cafe_Good_Food_Bright_Moments.png");
    expect(path).not.toMatch(/[^\w./-]/);
  });
});

describe("s3ConfigFromEnv", () => {
  it("reads S3 credentials and defaults the quote-attachments bucket", () => {
    expect(s3ConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      s3ConfigFromEnv({
        S3_ACCESS_KEY_ID: "access",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
        S3_REGION: "eu-west-1",
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      accessKeyId: "access",
      bucket: "quote-attachments",
      region: "eu-west-1",
      forcePathStyle: true,
    });
  });
});

describe("isQuoteStorageSetupError", () => {
  it("treats RLS and existing-bucket errors as setup issues, not upload failures", () => {
    expect(
      isQuoteStorageSetupError("new row violates row-level security policy")
    ).toBe(true);
    expect(isQuoteStorageSetupError("The resource already exists")).toBe(true);
    expect(isQuoteStorageSetupError("Invalid Compact JWS")).toBe(false);
  });
});
