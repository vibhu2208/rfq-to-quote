import { describe, expect, it } from "vitest";
import {
  emailLooksLikeRequirement,
  looksLikePromotionalEmail,
  messageLooksLikeRequirement,
} from "@/lib/inbound-requirement";

describe("messageLooksLikeRequirement", () => {
  it("accepts clear product RFQs", () => {
    expect(
      messageLooksLikeRequirement(
        "Need 10 Dell laptops i5 16GB RAM for our office. Please quote."
      )
    ).toBe(true);
    expect(
      messageLooksLikeRequirement(
        "RFQ:\n1. 24 port PoE switch - 5 nos\n2. Cat6 cable box - 2"
      )
    ).toBe(true);
  });

  it("rejects greetings and chatter", () => {
    expect(messageLooksLikeRequirement("Hi")).toBe(false);
    expect(messageLooksLikeRequirement("ok")).toBe(false);
    expect(messageLooksLikeRequirement("Thanks!")).toBe(false);
    expect(messageLooksLikeRequirement("Good morning")).toBe(false);
    expect(
      messageLooksLikeRequirement("[WhatsApp image received]")
    ).toBe(false);
  });

  it("accepts short qty + product asks", () => {
    expect(messageLooksLikeRequirement("Need 5 UPS 1kVA")).toBe(true);
  });
});

describe("looksLikePromotionalEmail / emailLooksLikeRequirement", () => {
  it("rejects Microsoft-style promo mail even when product words appear", () => {
    const promo = {
      subject: "Get more from Microsoft 365",
      fromEmail: "email@email.microsoft.com",
      text:
        "Upgrade your subscription today. Limited-time offer on Microsoft 365 licenses. Unsubscribe anytime.",
      headers: new Map([["list-unsubscribe", "<mailto:unsub@microsoft.com>"]]),
    };
    expect(looksLikePromotionalEmail(promo)).toBe(true);
    expect(emailLooksLikeRequirement(promo)).toBe(false);
  });

  it("rejects noreply newsletter digests", () => {
    expect(
      emailLooksLikeRequirement({
        subject: "Weekly digest: hottest jobs",
        fromEmail: "careerbrew@substack.com",
        text: "You're receiving this because you subscribed. View in browser.",
      })
    ).toBe(false);
  });

  it("keeps a real buyer RFQ", () => {
    expect(
      emailLooksLikeRequirement({
        subject: "Quotation required – IT hardware",
        fromEmail: "purchase@acme-industries.com",
        text:
          "Please quote:\n1. Business Laptops – 10 Units\n2. 24-port PoE switch – 5 nos",
      })
    ).toBe(true);
  });

  it("keeps IndiaMART-style marketplace leads", () => {
    expect(
      emailLooksLikeRequirement({
        subject: "Buyer requirement for UPS",
        fromEmail: "leads@indiamart.com",
        text: "Buyer is looking for 10 kVA UPS. Contact details inside.",
        headers: new Map([["list-unsubscribe", "<https://indiamart.com/unsub>"]]),
      })
    ).toBe(true);
  });
});
