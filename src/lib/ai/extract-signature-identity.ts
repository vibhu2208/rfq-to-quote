import {
  extractCustomerIdentityFromEmail,
  type CustomerIdentityFromEmail,
} from "@/lib/email-text";

function extractJsonObject(text: string): unknown {
  const trimmed = String(text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in Gemini signature response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function asCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Ask Gemini Flash Lite to read contact/company/phone/email from the email
 * body (signature / closing). Returns null when the key is missing or the
 * call fails — caller should keep heuristic results.
 */
export async function extractSignatureIdentityWithGemini(
  body: string
): Promise<Partial<CustomerIdentityFromEmail> | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.GEMINI_SIGNATURE_MODEL?.trim() || "gemini-3.1-flash-lite";
  // Signature is almost always at the end; keep prompt small/cheap.
  const snippet = String(body || "").slice(-2500);
  if (!snippet.trim()) return null;

  const prompt = `Extract the BUYER contact identity from this inbound RFQ email.
Use the signature / closing (after Thanks/Regards), not the product list.
Return ONLY JSON with keys:
{"customerName":"","customerCompany":"","customerPhone":"","customerEmail":""}
Rules:
- customerName = person (e.g. Priya Nair), never the mailbox trade name alone if a person is signed
- customerCompany = organisation / LLP / Pvt Ltd / cafe / etc from the signature
- customerPhone = mobile/phone if present (keep digits/spaces as written)
- customerEmail = only if an email appears in the body/signature (else "")
- If a field is missing, use ""

Email:
"""
${snippet}
"""`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 256,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini signature extract ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) return null;

  const parsed = extractJsonObject(text) as Record<string, unknown>;
  return {
    customerName: asCleanString(parsed.customerName),
    customerCompany: asCleanString(parsed.customerCompany),
    customerPhone: asCleanString(parsed.customerPhone),
    customerEmail: asCleanString(parsed.customerEmail),
  };
}

function identityLooksWeak(
  identity: CustomerIdentityFromEmail,
  fromName: string
): boolean {
  const name = identity.customerName.trim().toLowerCase();
  const from = fromName.trim().toLowerCase();
  if (!identity.customerCompany.trim()) return true;
  if (!identity.customerName.trim()) return true;
  if (!identity.customerPhone.trim()) return true;
  if (from && name === from) return true;
  return false;
}

/**
 * Heuristic first; Gemini Flash Lite fills/overrides when the signature is
 * weak or the model returns clearer fields. Falls back silently if Gemini fails.
 */
export async function resolveCustomerIdentityFromEmail(
  body: string,
  fromName = "",
  fromEmail = ""
): Promise<CustomerIdentityFromEmail> {
  const heuristic = extractCustomerIdentityFromEmail(body, fromName, fromEmail);

  const needsAi =
    Boolean(process.env.GEMINI_API_KEY?.trim()) &&
    (identityLooksWeak(heuristic, fromName) ||
      process.env.GEMINI_SIGNATURE_ALWAYS === "1");

  if (!needsAi) return heuristic;

  try {
    const ai = await extractSignatureIdentityWithGemini(body);
    if (!ai) return heuristic;

    return {
      customerName: ai.customerName || heuristic.customerName,
      customerCompany: ai.customerCompany || heuristic.customerCompany,
      customerPhone: ai.customerPhone || heuristic.customerPhone,
      customerEmail:
        ai.customerEmail || heuristic.customerEmail || fromEmail.trim(),
    };
  } catch (err) {
    console.warn(
      "[signature-identity] Gemini extract failed; using heuristic",
      err instanceof Error ? err.message : err
    );
    return heuristic;
  }
}
