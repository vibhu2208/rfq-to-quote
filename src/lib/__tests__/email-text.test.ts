import { describe, expect, it } from "vitest";
import {
  emailBodyFromParts,
  extractCustomerIdentityFromEmail,
  htmlToPlainText,
  normalizeOutboundEmailText,
  normalizeStoredCustomerIdentity,
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

describe("extractCustomerIdentityFromEmail", () => {
  it("prefers signature Contact/Company over From mailbox display name", () => {
    const body = `
Hi team,

Please quote for network switches, Wi-Fi access points and 24 monitors for our new office.

Thanks,
Company: Chote Bade Cafe
Contact: Vaibhav Singh
`;
    expect(
      extractCustomerIdentityFromEmail(body, "Chotebade cafe", "buyer@example.com")
    ).toEqual({
      customerName: "Vaibhav Singh",
      customerCompany: "Chote Bade Cafe",
      customerPhone: "",
      customerEmail: "buyer@example.com",
    });
  });

  it("falls back to From name when signature has no Contact", () => {
    expect(
      extractCustomerIdentityFromEmail(
        "Please quote 10 laptops.\nCompany: Acme Pvt Ltd",
        "Priya Sharma",
        "priya@acme.test"
      )
    ).toEqual({
      customerName: "Priya Sharma",
      customerCompany: "Acme Pvt Ltd",
      customerPhone: "",
      customerEmail: "priya@acme.test",
    });
  });

  it("handles Contact/Company jammed on one line", () => {
    expect(
      extractCustomerIdentityFromEmail(
        "Regards Company: Chote Bade Cafe Contact: Vaibhav Singh",
        "Chotebade cafe",
        "buyer@example.com"
      )
    ).toEqual({
      customerName: "Vaibhav Singh",
      customerCompany: "Chote Bade Cafe",
      customerPhone: "",
      customerEmail: "buyer@example.com",
    });
  });

  it("parses freeform Regards signature for name, company, and phone", () => {
    const body = `Hi team,

We are setting up a small branch office in Nashik and would like your best price for the following:

1. Eight-port gigabit PoE switch - 3 nos

Regards,
Rohan Mehta
IT Procurement Lead
Shreeji Logistics Pvt. Ltd.
Nashik, Maharashtra
+91 98220 45117`;
    expect(
      extractCustomerIdentityFromEmail(
        body,
        "Chotebade cafe",
        "chotebadecafe@gmail.com"
      )
    ).toEqual({
      customerName: "Rohan Mehta",
      customerCompany: "Shreeji Logistics Pvt. Ltd.",
      customerPhone: "+91 98220 45117",
      customerEmail: "chotebadecafe@gmail.com",
    });
  });

  it("repairs legacy leads that stored the From mailbox name as contact", () => {
    const body = `
RFQ: Network switches, Wi-Fi access points and 24 monitors for new office

Company: Chote Bade Cafe
Contact: Vaibhav Singh
`;
    expect(
      normalizeStoredCustomerIdentity({
        rawText: body,
        customerName: "Chotebade cafe",
        customerCompany: "",
      })
    ).toEqual({
      customerName: "Vaibhav Singh",
      customerCompany: "Chote Bade Cafe",
      customerPhone: "",
      customerEmail: "",
      changed: true,
    });
  });

  it("repairs freeform signature leads missing company and phone", () => {
    const body = `Hi team,

Please quote PoE switches and monitors.

Regards,
Rohan Mehta
IT Procurement Lead
Shreeji Logistics Pvt. Ltd.
Nashik, Maharashtra
+91 98220 45117`;
    expect(
      normalizeStoredCustomerIdentity({
        rawText: body,
        customerName: "Chotebade cafe",
        customerCompany: "",
        customerPhone: "",
        customerEmail: "chotebadecafe@gmail.com",
      })
    ).toEqual({
      customerName: "Rohan Mehta",
      customerCompany: "Shreeji Logistics Pvt. Ltd.",
      customerPhone: "+91 98220 45117",
      customerEmail: "chotebadecafe@gmail.com",
      changed: true,
    });
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
