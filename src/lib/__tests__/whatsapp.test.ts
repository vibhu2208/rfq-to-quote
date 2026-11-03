import { describe, expect, it } from "vitest";
import {
  extractWhatsAppInboundMessages,
  normalizeWhatsAppNumber,
  whatsappQuoteCaption,
} from "@/lib/whatsapp";

describe("normalizeWhatsAppNumber", () => {
  it("adds India country code to a 10-digit mobile number", () => {
    expect(normalizeWhatsAppNumber("98370 66344")).toBe("919837066344");
  });

  it("keeps an already international number", () => {
    expect(normalizeWhatsAppNumber("+91 98370-66344")).toBe("919837066344");
  });

  it("strips a leading 00 international prefix", () => {
    expect(normalizeWhatsAppNumber("00919837066344")).toBe("919837066344");
  });

  it("strips a local 0 trunk prefix from an 11-digit Indian number", () => {
    expect(normalizeWhatsAppNumber("09837066344")).toBe("919837066344");
  });

  it("rejects values that are not phone numbers", () => {
    expect(() => normalizeWhatsAppNumber("buyer@company.com")).toThrow(
      /WhatsApp number/i
    );
    expect(() => normalizeWhatsAppNumber("123")).toThrow(/WhatsApp number/i);
  });
});

describe("whatsappQuoteCaption", () => {
  it("stays within the WhatsApp document caption limit", () => {
    const caption = whatsappQuoteCaption({
      quoteNumber: "Q-2026-0001",
      grandTotalLabel: "₹12,000.00",
      threadRef: "QREF-Q-2026-0001",
      extra: "x".repeat(2000),
    });
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain("Q-2026-0001");
  });
});

describe("extractWhatsAppInboundMessages", () => {
  it("reads text messages and skips delivery statuses", () => {
    const messages = extractWhatsAppInboundMessages({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [
                  { profile: { name: "Ravi Kumar" }, wa_id: "919811112222" },
                ],
                messages: [
                  {
                    from: "919811112222",
                    id: "wamid.ABC",
                    timestamp: "1730000000",
                    type: "text",
                    text: { body: "Need 10 laptops" },
                  },
                ],
                statuses: [{ id: "wamid.OLD", status: "delivered" }],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      {
        messageId: "wamid.ABC",
        from: "919811112222",
        name: "Ravi Kumar",
        text: "Need 10 laptops",
        timestamp: "1730000000",
      },
    ]);
  });

  it("uses image or document captions as the RFQ text", () => {
    const messages = extractWhatsAppInboundMessages({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919800000000",
                    id: "wamid.IMG",
                    type: "image",
                    image: { caption: "RFQ photo attached", id: "media-1" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(messages[0]?.text).toBe("RFQ photo attached");
  });
});
