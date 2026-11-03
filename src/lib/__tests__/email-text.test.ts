import { describe, expect, it } from "vitest";
import {
  normalizeOutboundEmailText,
  plainTextToEmailHtml,
} from "@/lib/email-text";

describe("normalizeOutboundEmailText", () => {
  it("replaces fancy punctuation and rupee symbols", () => {
    const raw = "Price — ₹1,200… “best” quote";
    expect(normalizeOutboundEmailText(raw)).toBe(
      'Price - Rs.1,200... "best" quote'
    );
  });

  it("strips nbsp and soft unicode spaces", () => {
    expect(normalizeOutboundEmailText("Hello\u00A0world")).toBe("Hello world");
  });
});

describe("plainTextToEmailHtml", () => {
  it("escapes html and preserves line breaks", () => {
    const html = plainTextToEmailHtml("A <B>\nC");
    expect(html).toContain("A &lt;B&gt;<br/>C");
  });
});
