import type { RfqRequirementItem } from "@/lib/rfq-items";
import type { VendorQuotedLineItem } from "@/lib/parse-vendor-price";

export type VendorReplyIntent =
  | "ACCEPTED"
  | "DECLINED"
  | "COUNTER"
  | "UNCLEAR";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Turn the admin's plain-language negotiation note into a professional
 * email body that continues the Recore thread.
 */
export async function formatVendorNegotiationEmail(input: {
  vendorName: string;
  plainNote: string;
  threadRef: string;
  currentTotal: number | null;
  lineItems: VendorQuotedLineItem[];
  rfqItems: RfqRequirementItem[];
  subject: string;
}): Promise<{ subject: string; body: string }> {
  const company = process.env.COMPANY_NAME || "QuoteFlow";
  const priceBlock =
    input.lineItems.length > 0
      ? input.lineItems
          .map(
            (l) =>
              `${l.lineNumber}. ${l.description} — ₹${l.unitPrice.toLocaleString("en-IN")} / ${l.unit} (qty ${l.quantity})`
          )
          .join("\n")
      : input.currentTotal != null
        ? `Current quoted total: ₹${input.currentTotal.toLocaleString("en-IN")}`
        : "Current quote: (see prior email)";

  const fallbackBody = `Hello ${input.vendorName},

Thank you for your quotation. We would like to negotiate as follows:

${input.plainNote.trim()}

Your current prices for reference:
${priceBlock}

Please reply with your best revised unit prices (INR) for each line, or let us know if you cannot revise.

Reference: [REF:${input.threadRef}]

Thanks,
${company}`;

  const fallbackSubject = input.subject.startsWith("Re:")
    ? input.subject
    : `Re: ${input.subject || `Quote negotiation [REF:${input.threadRef}]`}`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { subject: fallbackSubject, body: fallbackBody };
  }

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const system = `You write professional vendor negotiation emails for an Indian electronics trader.
Return ONLY valid JSON:
{
  "subject": string,  // keep Re: and [REF:...] if present in the original subject
  "body": string      // full email body including greeting and sign-off
}
Rules:
- Rewrite the admin's casual/plain notes into clear, polite business English.
- Do NOT invent discounts, deadlines, or commitments not in the plain note.
- Keep specific numbers the admin mentioned.
- Ask the vendor to reply with revised per-line INR unit prices or clearly decline.
- Always include Reference: [REF:${input.threadRef}] near the end.
- Sign off with "${company}".
- Keep under 25 lines.`;

  const user = `Vendor name: ${input.vendorName}
Original subject: ${input.subject || "(none)"}
Thread ref: ${input.threadRef}

Current quoted lines:
${priceBlock}

Admin plain-language negotiation notes:
${input.plainNote.trim()}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "QuoteFlow Vendor Negotiation",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) return { subject: fallbackSubject, body: fallbackBody };

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { subject: fallbackSubject, body: fallbackBody };

    const parsed = extractJson(content) as { subject?: unknown; body?: unknown };
    const body =
      typeof parsed.body === "string" && parsed.body.trim()
        ? parsed.body.trim()
        : fallbackBody;
    let subject =
      typeof parsed.subject === "string" && parsed.subject.trim()
        ? parsed.subject.trim()
        : fallbackSubject;
    if (!subject.includes(`[REF:${input.threadRef}]`)) {
      subject = `${subject} [REF:${input.threadRef}]`;
    }
    if (!/^re\s*:/i.test(subject)) {
      subject = `Re: ${subject}`;
    }
    if (!body.includes(`[REF:${input.threadRef}]`)) {
      return {
        subject,
        body: `${body}\n\nReference: [REF:${input.threadRef}]\n\nThanks,\n${company}`,
      };
    }
    return { subject, body };
  } catch {
    return { subject: fallbackSubject, body: fallbackBody };
  }
}

/**
 * Classify a vendor reply after a negotiation (or initial quote) for intent.
 */
export async function classifyVendorReplyIntent(input: {
  replyText: string;
  subject?: string;
  hadNegotiation: boolean;
  previousTotal: number | null;
  newTotal: number | null;
}): Promise<{ intent: VendorReplyIntent; summary: string; confidence: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const heuristic = (): {
    intent: VendorReplyIntent;
    summary: string;
    confidence: number;
  } => {
    const lower = input.replyText.toLowerCase();
    const negative =
      /\b(cannot|can't|unable|no\b|not possible|regret|decline|reject|final price|won't|will not)\b/i.test(
        lower
      );
    const positive =
      /\b(ok|okay|agree|accepted|revised|updated|new price|best price|can offer|we offer)\b/i.test(
        lower
      );
    if (negative && !positive) {
      return {
        intent: "DECLINED",
        summary: "Vendor declined or cannot revise.",
        confidence: 0.6,
      };
    }
    if (
      input.newTotal != null &&
      input.previousTotal != null &&
      input.newTotal !== input.previousTotal
    ) {
      return {
        intent: "COUNTER",
        summary: "Vendor sent an updated price.",
        confidence: 0.65,
      };
    }
    if (input.newTotal != null) {
      return {
        intent: "ACCEPTED",
        summary: "Vendor provided pricing.",
        confidence: 0.55,
      };
    }
    return {
      intent: "UNCLEAR",
      summary: "Could not clearly classify the reply.",
      confidence: 0.3,
    };
  };

  if (!apiKey) return heuristic();

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const system = `You classify vendor replies to RFQ / price negotiation emails.
Return ONLY valid JSON:
{
  "intent": "ACCEPTED" | "DECLINED" | "COUNTER" | "UNCLEAR",
  "confidence": number,
  "summary": string
}
Rules:
- DECLINED = vendor refuses to lower/revise price, says no, final offer they won't change, or rejects the deal.
- COUNTER = vendor offers a different/revised price (new numbers).
- ACCEPTED = vendor agrees to the requested terms / confirms they will match the ask (with or without restating prices).
- UNCLEAR = ambiguous, questions only, or no clear commercial stance.
- Prefer DECLINED when the tone is clearly negative even if old prices are restated.`;

  const user = `Had prior negotiation email: ${input.hadNegotiation}
Previous total INR: ${input.previousTotal ?? "null"}
Newly extracted total INR: ${input.newTotal ?? "null"}
Subject: ${input.subject || "(none)"}

Vendor reply:
${input.replyText.slice(0, 8000)}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "QuoteFlow Vendor Reply Intent",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return heuristic();
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return heuristic();
    const parsed = extractJson(content) as {
      intent?: unknown;
      confidence?: unknown;
      summary?: unknown;
    };
    const intentRaw = String(parsed.intent || "").toUpperCase();
    const intent: VendorReplyIntent =
      intentRaw === "ACCEPTED" ||
      intentRaw === "DECLINED" ||
      intentRaw === "COUNTER" ||
      intentRaw === "UNCLEAR"
        ? intentRaw
        : "UNCLEAR";
    return {
      intent,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : heuristic().summary,
    };
  } catch {
    return heuristic();
  }
}
