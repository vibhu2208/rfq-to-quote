import type { QuoteReplyIntent, QuoteStatus } from "@prisma/client";

export type QuoteReplyAnalysis = {
  intent: QuoteReplyIntent;
  confidence: number;
  summary: string;
  counterPrice: number | null;
  needsAssistance: boolean;
  assistanceReason: string;
  suggestedReply: string;
  /** True when the buyer ask can be answered from quote data and/or company Q&A. */
  answerableFromKnowledge: boolean;
  /** Buyer questions/topics that are outside known quote data and company Q&A. */
  unknownAsks: string[];
  /** Status to apply when confidence is high enough; null = leave unchanged. */
  statusUpdate: QuoteStatus | null;
};

export type CompanyQaEntry = {
  question: string;
  answer: string;
  tags: string[];
};

/** Structured quote facts the model is allowed to use when drafting a reply. */
export type QuoteReplyKnowledge = {
  quoteNumber: string;
  buyerName: string;
  buyerCompany: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerState: string;
  buyerAddress: string;
  withGst: boolean;
  gstMode: string;
  subtotal: number;
  gstAmount: number;
  deliveryCharge: number;
  discountAmount: number;
  discountPercent: number;
  otherTaxAmount: number;
  otherTaxLabel: string;
  grandTotal: number;
  notes: string;
  validUntil: string | null;
  currency: string;
  companyName: string;
  companyGstin: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  sellerState: string;
  lineItems: Array<{
    description: string;
    productCode: string;
    qty: number;
    unit: string;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }>;
};

const INTENTS: QuoteReplyIntent[] = [
  "ACCEPT",
  "REJECT",
  "QUESTION",
  "COUNTER_OFFER",
  "REQUEST_REVISION",
  "ACKNOWLEDGEMENT",
  "UNCLEAR",
];

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

function asIntent(value: unknown): QuoteReplyIntent {
  if (typeof value === "string" && (INTENTS as string[]).includes(value)) {
    return value as QuoteReplyIntent;
  }
  return "UNCLEAR";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, 8);
}

function statusForIntent(intent: QuoteReplyIntent, confidence: number): QuoteStatus | null {
  if (confidence < 0.55) return null;
  switch (intent) {
    case "ACCEPT":
      return "ACCEPTED";
    case "REJECT":
      return "REJECTED";
    case "COUNTER_OFFER":
    case "REQUEST_REVISION":
    case "QUESTION":
      return "UNDER_NEGOTIATION";
    case "ACKNOWLEDGEMENT":
      return "VIEWED";
    default:
      return null;
  }
}

function formatMoney(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatQuoteKnowledgeForPrompt(k: QuoteReplyKnowledge): string {
  const lines = k.lineItems.map(
    (li, i) =>
      `${i + 1}. ${li.description}${li.productCode ? ` [${li.productCode}]` : ""} — qty ${li.qty} ${li.unit} @ ${formatMoney(li.unitPrice)} (GST ${li.taxRate}%) = ${formatMoney(li.lineTotal)}`
  );

  return `Quote number: ${k.quoteNumber}
Buyer: ${k.buyerName || "(unknown)"}${k.buyerCompany ? ` / ${k.buyerCompany}` : ""}
Buyer email: ${k.buyerEmail || "(none)"}
Buyer phone: ${k.buyerPhone || "(none)"}
Buyer state/address: ${[k.buyerState, k.buyerAddress].filter(Boolean).join(" — ") || "(none)"}
GST on quote: ${k.withGst ? "yes" : "no"} (mode: ${k.gstMode || "AUTO"})
Subtotal: ${formatMoney(k.subtotal)}
GST amount: ${formatMoney(k.gstAmount)}
Delivery charge: ${formatMoney(k.deliveryCharge)}
Discount: ${formatMoney(k.discountAmount)}${k.discountPercent ? ` (${k.discountPercent}%)` : ""}
${k.otherTaxAmount ? `Other tax (${k.otherTaxLabel || "other"}): ${formatMoney(k.otherTaxAmount)}\n` : ""}Grand total: ${formatMoney(k.grandTotal)}
Valid until: ${k.validUntil || "(not set)"}
Quote notes: ${k.notes?.trim() || "(none)"}
Seller company: ${k.companyName}
Seller GSTIN: ${k.companyGstin || "(not set)"}
Seller email/phone: ${[k.companyEmail, k.companyPhone].filter(Boolean).join(" / ") || "(not set)"}
Seller address/state: ${[k.companyAddress, k.sellerState].filter(Boolean).join(" — ") || "(not set)"}
Line items:
${lines.length ? lines.join("\n") : "(no line items)"}`;
}

function looksLikeUnknownAsk(body: string): boolean {
  return /\b(lead time|delivery (date|time|schedule)|eta|shipping|payment terms?|advance|credit|warranty|guarantee|installation|moq|minimum order|stock|availability|sample|certificate|test report|packing|freight|incoterms?|hsn|custom(s)? duty|import|export)\b/i.test(
    body
  );
}

function heuristicAnalysis(
  body: string,
  knowledge?: QuoteReplyKnowledge,
  qaEntries: CompanyQaEntry[] = []
): QuoteReplyAnalysis {
  const lower = body.toLowerCase();
  const accept =
    /\b(accept|accepted|go ahead|proceed|confirm(ed)?|approved|looks good|please send invoice|po\b|purchase order)\b/i.test(
      body
    );
  const reject =
    /\b(reject|declin(e|ed)|not interested|too (expensive|high)|cancel|won't proceed|will not proceed)\b/i.test(
      body
    );
  const counter =
    /\b(counter|can you do|best price|discount|negotiate|reduce|lower|₹|rs\.?|inr)\b/i.test(body) &&
    /\d/.test(body);
  const revision =
    /\b(revis(e|ion)|change|update|modify|wrong|incorrect|qty|quantity|spec)\b/i.test(body);
  const question = /\?/.test(body) || /\b(clarif|what about|when can|lead time|delivery)\b/i.test(body);

  let intent: QuoteReplyIntent = "UNCLEAR";
  if (accept && !reject) intent = "ACCEPT";
  else if (reject) intent = "REJECT";
  else if (counter) intent = "COUNTER_OFFER";
  else if (revision) intent = "REQUEST_REVISION";
  else if (question) intent = "QUESTION";
  else if (/\b(thanks|received|got it|noted)\b/i.test(lower)) intent = "ACKNOWLEDGEMENT";

  const qaHit = qaEntries[0];
  const canAnswerFromQa =
    Boolean(qaHit) &&
    (intent === "QUESTION" || intent === "UNCLEAR" || intent === "ACKNOWLEDGEMENT");

  const asksOutside =
    intent === "QUESTION" && looksLikeUnknownAsk(body) && !canAnswerFromQa
      ? ["Buyer asked about terms/details not listed on the quote"]
      : [];

  const canAnswerTotals =
    intent === "QUESTION" &&
    /\b(total|price|amount|gst|grand total|cost)\b/i.test(body) &&
    Boolean(knowledge);

  const needsAssistance =
    intent === "COUNTER_OFFER" ||
    intent === "REQUEST_REVISION" ||
    (intent === "UNCLEAR" && !canAnswerFromQa) ||
    (intent === "QUESTION" && !canAnswerTotals && !canAnswerFromQa) ||
    asksOutside.length > 0;

  let suggestedReply = "";
  if (canAnswerFromQa && qaHit && !needsAssistance) {
    suggestedReply = qaHit.answer;
  } else if (canAnswerTotals && knowledge && !needsAssistance) {
    suggestedReply = `The grand total on quotation ${knowledge.quoteNumber} is ${formatMoney(knowledge.grandTotal)}.

Subtotal: ${formatMoney(knowledge.subtotal)}
GST: ${formatMoney(knowledge.gstAmount)}
Grand total: ${formatMoney(knowledge.grandTotal)}

Please let us know if you would like to proceed.`;
  }

  return {
    intent,
    confidence: intent === "UNCLEAR" ? 0.4 : 0.62,
    summary: canAnswerFromQa
      ? `Answered from company Q&A.`
      : `Heuristic classification: ${intent.replaceAll("_", " ").toLowerCase()}.`,
    counterPrice: null,
    needsAssistance,
    assistanceReason: needsAssistance
      ? asksOutside[0] ||
        "Buyer reply needs a human decision or asks for information not on the quote."
      : "",
    suggestedReply,
    answerableFromKnowledge: Boolean(suggestedReply) && !needsAssistance,
    unknownAsks: asksOutside,
    statusUpdate: statusForIntent(intent, 0.62),
  };
}

function formatCompanyQa(entries: CompanyQaEntry[]): string {
  if (!entries.length) return "(none)";
  return entries
    .map((e, i) => `${i + 1}. Q: ${e.question.slice(0, 400)}\n   A: ${e.answer.slice(0, 800)}`)
    .join("\n");
}

/**
 * Classify a buyer reply and draft a response grounded in quote knowledge
 * and approved company Q&A. Anything outside those sources must flag assistance.
 */
export async function analyzeQuoteReply(input: {
  subject: string;
  body: string;
  knowledge: QuoteReplyKnowledge;
  knowledgeEntries?: CompanyQaEntry[];
}): Promise<QuoteReplyAnalysis> {
  const qaEntries = input.knowledgeEntries ?? [];
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return heuristicAnalysis(input.body, input.knowledge, qaEntries);
  }

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const system = `You are a sales assistant for ${input.knowledge.companyName}.
You analyze buyer email replies to a commercial quotation and draft replies using ONLY the provided quote knowledge and approved company Q&A.

Return ONLY valid JSON:
{
  "intent": "ACCEPT" | "REJECT" | "QUESTION" | "COUNTER_OFFER" | "REQUEST_REVISION" | "ACKNOWLEDGEMENT" | "UNCLEAR",
  "confidence": number,               // 0 to 1
  "summary": string,                  // one short sentence
  "counterPrice": number|null,        // INR if buyer proposes a price
  "answerableFromKnowledge": boolean, // true only if every buyer ask is answerable from KNOWN QUOTE DATA or COMPANY Q&A
  "unknownAsks": string[],            // asks NOT in quote data AND NOT in company Q&A
  "needsAssistance": boolean,         // true if a human must decide or answer unknownAsks
  "assistanceReason": string,         // why assistance is needed (empty if not)
  "suggestedReply": string            // short polite email body only (no subject line)
}

Intent rules:
- ACCEPT = clear go-ahead / PO / approval.
- REJECT = clear no / declined.
- COUNTER_OFFER = buyer proposes different price or commercial terms.
- REQUEST_REVISION = wants line items / qty / specs changed.
- QUESTION = asks for info without accepting/rejecting.
- ACKNOWLEDGEMENT = received/thanks only.
- UNCLEAR = mixed or ambiguous.

Knowledge / assistance rules (critical):
1. Treat "KNOWN QUOTE DATA" and "COMPANY Q&A (approved human answers)" as your only sources of truth.
2. You MAY answer questions supported by quote data (totals, GST, line items, listed delivery charge, discount, notes, validity, company contact/GSTIN).
3. You MAY also answer using COMPANY Q&A when it clearly matches the buyer ask (payment terms, lead time, warranty, etc.). Prefer quote figures for numbers; use Q&A for policy/process.
4. If the buyer asks about ANYTHING not in quote data AND not in company Q&A — put it in unknownAsks and set needsAssistance=true and answerableFromKnowledge=false.
5. Never invent prices, dates, policies, or commitments.
6. COUNTER_OFFER and REQUEST_REVISION always needAssistance=true (human must decide).
7. When answerableFromKnowledge=true, write suggestedReply as a structured email body (no subject, no greeting, no sign-off):
   - First line: one-sentence direct answer.
   - Then a blank line and labelled facts, one per line, e.g. "Grand total: INR 10,384" / "GST: INR 1,584" / "Payment terms: …".
   - Then a blank line and one next-step sentence (e.g. please confirm to proceed).
   - Keep it under 12 lines. Use exact figures from quote data / Q&A.
8. When needsAssistance=true, suggestedReply should be a brief holding reply only — do NOT guess answers.
9. Do not invent facts not in the buyer message, KNOWN QUOTE DATA, or COMPANY Q&A.`;

  const user = `KNOWN QUOTE DATA:
${formatQuoteKnowledgeForPrompt(input.knowledge)}

COMPANY Q&A (approved human answers):
${formatCompanyQa(qaEntries)}

Buyer email subject: ${input.subject || "(none)"}

Buyer reply:
${input.body.slice(0, 8000)}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "QuoteFlow Quote Reply Analyzer",
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

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenRouter quote-reply analysis failed:", res.status, errText.slice(0, 300));
      return heuristicAnalysis(input.body, input.knowledge, qaEntries);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return heuristicAnalysis(input.body, input.knowledge, qaEntries);

    const parsed = extractJson(content) as Record<string, unknown>;
    const intent = asIntent(parsed.intent);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    let unknownAsks = asStringArray(parsed.unknownAsks);
    const suggestedReply =
      typeof parsed.suggestedReply === "string" ? parsed.suggestedReply.trim() : "";

    const qaCoversAsk = qaEntries.length > 0 && Boolean(suggestedReply);
    if (qaCoversAsk) unknownAsks = [];

    const answerableFromKnowledge =
      typeof parsed.answerableFromKnowledge === "boolean"
        ? (parsed.answerableFromKnowledge || qaCoversAsk) && unknownAsks.length === 0
        : unknownAsks.length === 0 &&
          (intent === "ACCEPT" ||
            intent === "REJECT" ||
            intent === "ACKNOWLEDGEMENT" ||
            (intent === "QUESTION" && Boolean(suggestedReply)));

    let needsAssistance =
      typeof parsed.needsAssistance === "boolean"
        ? parsed.needsAssistance
        : !answerableFromKnowledge ||
          intent === "COUNTER_OFFER" ||
          intent === "REQUEST_REVISION" ||
          intent === "UNCLEAR" ||
          confidence < 0.55 ||
          unknownAsks.length > 0;

    if (intent === "COUNTER_OFFER" || intent === "REQUEST_REVISION" || intent === "UNCLEAR") {
      needsAssistance = true;
    }
    if (unknownAsks.length > 0 && !qaCoversAsk) {
      needsAssistance = true;
    }
    if (qaCoversAsk && intent === "QUESTION") {
      needsAssistance = false;
    }

    const assistanceReason =
      typeof parsed.assistanceReason === "string" && parsed.assistanceReason.trim()
        ? parsed.assistanceReason.trim()
        : unknownAsks.length > 0
          ? `Buyer asked for information not on the quote or in company Q&A: ${unknownAsks.join("; ")}`
          : needsAssistance
            ? "Buyer reply needs a human decision or a custom answer."
            : "";

    return {
      intent,
      confidence,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      counterPrice:
        parsed.counterPrice == null || parsed.counterPrice === ""
          ? null
          : Number(parsed.counterPrice) || null,
      needsAssistance,
      assistanceReason: needsAssistance ? assistanceReason : "",
      suggestedReply,
      answerableFromKnowledge: answerableFromKnowledge && !needsAssistance,
      unknownAsks,
      statusUpdate: statusForIntent(intent, confidence),
    };
  } catch (err) {
    console.error("analyzeQuoteReply error:", err);
    return heuristicAnalysis(input.body, input.knowledge, qaEntries);
  }
}

export function buildAutoReplyBody(input: {
  intent: QuoteReplyIntent;
  buyerName: string;
  quoteNumber: string;
  companyName: string;
  suggestedReply?: string;
}): string | null {
  const greeting = input.buyerName.trim()
    ? `Hello ${input.buyerName.trim()},`
    : "Hello,";

  if (input.suggestedReply?.trim()) {
    return `${greeting}\n\n${input.suggestedReply.trim()}\n\nThanks,\n${input.companyName}`;
  }

  switch (input.intent) {
    case "ACCEPT":
      return `${greeting}

Thank you for accepting quotation ${input.quoteNumber}. We will proceed with the next steps and share invoice / delivery details shortly.

Thanks,
${input.companyName}`;
    case "REJECT":
      return `${greeting}

Thank you for letting us know regarding quotation ${input.quoteNumber}. We appreciate your time and are happy to help if requirements change.

Thanks,
${input.companyName}`;
    case "ACKNOWLEDGEMENT":
      return `${greeting}

Thanks for confirming you received quotation ${input.quoteNumber}. Please reply if you have any questions.

Thanks,
${input.companyName}`;
    case "QUESTION":
    case "COUNTER_OFFER":
    case "REQUEST_REVISION":
    case "UNCLEAR":
      return `${greeting}

Thanks for your reply on quotation ${input.quoteNumber}. We have received your message and will get back to you shortly.

Thanks,
${input.companyName}`;
    default:
      return null;
  }
}

/** Whether we should send an automatic email for this analysis. */
export function shouldAutoSendQuoteReply(analysis: QuoteReplyAnalysis): boolean {
  // Holding acknowledgement when a human must intervene.
  if (analysis.needsAssistance) return true;
  if (analysis.confidence < 0.55) return true;
  if (
    analysis.intent === "ACCEPT" ||
    analysis.intent === "REJECT" ||
    analysis.intent === "ACKNOWLEDGEMENT"
  ) {
    return true;
  }
  // Grounded FAQ-style answer from quote knowledge.
  if (
    analysis.intent === "QUESTION" &&
    analysis.answerableFromKnowledge &&
    analysis.suggestedReply.trim()
  ) {
    return true;
  }
  return false;
}
