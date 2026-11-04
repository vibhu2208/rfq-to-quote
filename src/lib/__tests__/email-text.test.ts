import { describe, expect, it } from "vitest";
import {
  emailBodyFromParts,
  htmlToPlainText,
  normalizeOutboundEmailText,
  plainTextToEmailHtml,
  structureEmailBodyForDisplay,
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

describe("htmlToPlainText", () => {
  it("keeps paragraphs and list items instead of one flat line", () => {
    const html = `
      <p>Dear Team,</p>
      <p>Please quote:</p>
      <ul>
        <li>CCTV Cameras – 10 Units</li>
        <li>Laptops – 5 Units</li>
      </ul>
      <p>Thanks<br/>Vaibhav</p>
    `;
    const text = htmlToPlainText(html);
    expect(text).toContain("Dear Team,");
    expect(text).toContain("• CCTV Cameras");
    expect(text).toContain("• Laptops");
    expect(text).toMatch(/Thanks\nVaibhav/);
    expect(text.includes("\n")).toBe(true);
  });
});

describe("emailBodyFromParts", () => {
  it("prefers plain text when present", () => {
    expect(emailBodyFromParts("Line A\nLine B", "<p>Ignored</p>")).toBe(
      "Line A\nLine B"
    );
  });

  it("falls back to structured html", () => {
    expect(emailBodyFromParts("", "<p>Hello</p><p>World</p>")).toMatch(
      /Hello\n+World/
    );
  });
});

describe("structureEmailBodyForDisplay", () => {
  it("splits flattened bullet lists for legacy bodies", () => {
    const flat =
      "Dear Team, Please quote: • CCTV Cameras – 10 Units • Laptops – 5 Units Thanks";
    const structured = structureEmailBodyForDisplay(flat);
    expect(structured).toContain("\n• CCTV");
    expect(structured).toContain("\n• Laptops");
  });

  it("decodes &nbsp;/&quot; and breaks numbered RFQ lines", () => {
    const flat =
      "&nbsp;&nbsp;1)&nbsp;INTERACTIVE FRONT PANEL VIEWSONIC 86&quot; IFP Qty&nbsp;:&nbsp;1Rate&nbsp;:&nbsp;0.00 2)&nbsp;Harman In Ceiling Speaker Qty&nbsp;:&nbsp;6Rate&nbsp;:&nbsp;0.00 12)&nbsp;Installation Charges";
    const structured = structureEmailBodyForDisplay(flat);
    expect(structured).not.toContain("&nbsp;");
    expect(structured).not.toContain("&quot;");
    expect(structured).toContain('VIEWSONIC 86"');
    expect(structured.startsWith("1. INTERACTIVE")).toBe(true);
    expect(structured).toContain("\n2. Harman");
    expect(structured).toContain("\n12. Installation");
    expect(structured).toContain("Qty: 1");
    expect(structured).toContain("Rate: 0.00");
    expect(structured.split("\n").length).toBeGreaterThan(4);
  });
});
