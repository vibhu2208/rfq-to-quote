import { describe, expect, it } from "vitest";
import {
  filenameFromUpload,
  formatAttachmentSize,
  isPreviewableAttachment,
  sanitizeFileName,
} from "@/lib/quote-attachments";

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
