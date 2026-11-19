import { describe, expect, it } from "vitest";
import {
  buildFieldUpdateBody,
  buildStatusChangeBody,
  normalizeTagsInput,
  parseTagsJson,
} from "@/lib/telemarketing/contact-update";
import {
  contactRequiresPhoneOrEmail,
  validateEmailInput,
  validatePhoneInput,
} from "@/lib/telemarketing/validation";

describe("telemarketing validation", () => {
  it("allows empty phone on update", () => {
    expect(validatePhoneInput("")).toEqual({ ok: true, value: "" });
  });

  it("rejects invalid phone digits", () => {
    expect(validatePhoneInput("123").ok).toBe(false);
    expect(validatePhoneInput("12345678901234567").ok).toBe(false);
  });

  it("normalizes valid phone", () => {
    expect(validatePhoneInput("+91 98765 43210")).toEqual({
      ok: true,
      value: "919876543210",
    });
  });

  it("validates email format", () => {
    expect(validateEmailInput("bad").ok).toBe(false);
    expect(validateEmailInput("a@b.co")).toEqual({ ok: true, value: "a@b.co" });
  });

  it("creation requires phone or email", () => {
    expect(contactRequiresPhoneOrEmail("", "")).toBe(false);
    expect(contactRequiresPhoneOrEmail("9876543210", "")).toBe(true);
  });
});

describe("telemarketing contact-update copy", () => {
  it("builds field update body", () => {
    expect(buildFieldUpdateBody("phone", "", "9876543210")).toBe(
      "Phone updated: — → 9876543210"
    );
  });

  it("builds status change body", () => {
    expect(buildStatusChangeBody("NO_ACTION", "CONNECTED")).toBe(
      "Status changed: No action → Connected"
    );
  });

  it("parses and normalizes tags", () => {
    expect(parseTagsJson(["District", "area"])).toEqual(["District", "area"]);
    expect(normalizeTagsInput(["District", "district", ""])).toEqual(["district"]);
  });
});