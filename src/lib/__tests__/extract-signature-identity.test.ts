import { beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveCustomerIdentityFromEmail + Gemini", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_SIGNATURE_MODEL = "gemini-3.1-flash-lite";
    delete process.env.GEMINI_SIGNATURE_ALWAYS;
  });

  it("merges Gemini fields when heuristic cannot parse the signature", async () => {
    process.env.GEMINI_SIGNATURE_ALWAYS = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      customerName: "Priya Nair",
                      customerCompany: "Coastal Pharma Solutions LLP",
                      customerPhone: "94470 31256",
                      customerEmail: "",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }))
    );

    const { resolveCustomerIdentityFromEmail } = await import(
      "@/lib/ai/extract-signature-identity"
    );

    // Odd closing with no standard Regards / labeled fields — heuristics miss it.
    const body = `Please quote sixteen-port switches for Kochi.

Sent from my iPhone
--
Priya Nair, Admin Manager @ Coastal Pharma Solutions LLP
Call me 94470 31256`;

    const result = await resolveCustomerIdentityFromEmail(
      body,
      "Chotebade cafe",
      "chotebadecafe@gmail.com"
    );

    expect(result).toEqual({
      customerName: "Priya Nair",
      customerCompany: "Coastal Pharma Solutions LLP",
      customerPhone: "94470 31256",
      customerEmail: "chotebadecafe@gmail.com",
    });
    expect(fetch).toHaveBeenCalled();
  });

  it("falls back to heuristic when Gemini fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        text: async () => "boom",
      }))
    );

    const { resolveCustomerIdentityFromEmail } = await import(
      "@/lib/ai/extract-signature-identity"
    );

    const body = `Thanks & regards,
Priya Nair | Admin Manager
Coastal Pharma Solutions LLP
Mob: 94470 31256`;

    const result = await resolveCustomerIdentityFromEmail(
      body,
      "Chotebade cafe",
      "buyer@test.com"
    );

    expect(result.customerName).toBe("Priya Nair");
    expect(result.customerCompany).toBe("Coastal Pharma Solutions LLP");
  });
});
