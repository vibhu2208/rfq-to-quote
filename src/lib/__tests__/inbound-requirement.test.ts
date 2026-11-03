import { describe, expect, it } from "vitest";
import { messageLooksLikeRequirement } from "@/lib/inbound-requirement";

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
