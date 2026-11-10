/**
 * Heuristic: does this inbound text look like a product / RFQ requirement?
 * Used to keep WhatsApp chatter and email promo/newsletters out of the RFQ inbox.
 */

const GREETING_ONLY =
  /^(hi+|hii+|hello|hey|namaste|namaskar|good\s*(morning|afternoon|evening)|ok+|okay|k+|thanks?|thank\s*you|ty|yes|no|👍|🙏|🙂|😊)[\s!.]*$/i;

const REQUIREMENT_HINT =
  /\b(rfq|quote|quotation|need|needed|require|requirement|looking\s+for|want|pls|please|supply|procure|price|rate|budget|enquiry|inquiry|indent|po\b|purchase|order|qty|quantity|nos?\.?|pcs?\.?|units?|pieces?|kg|ltr|litre|meter|metre|box|set|pair)\b/i;

const QTY_PATTERN =
  /(?:^|[\s:])(\d{1,6}(?:[.,]\d+)?)\s*(?:x|×|\*)?\s*(?:nos?\.?|pcs?\.?|pieces?|units?|qty|quantity|kg|ltr|litres?|boxes?|sets?|pairs?|meters?|metres?)?\b/i;

const PRODUCTISH =
  /\b(laptop|desktop|monitor|printer|switch|router|cable|ups|inverter|battery|server|camera|hdd|ssd|ram|cpu|mouse|keyboard|projector|tv|led|panel|toner|cartridge|antivirus|license|software|firewall|access\s*point|poe|cat6|cat\s*6)\b/i;

/** Bulk / marketing signals in subject or body. */
const PROMO_TEXT =
  /\b(unsubscribe|view\s+in\s+(?:your\s+)?browser|manage\s+(?:email\s+)?preferences|email\s+preferences|one[- ]click\s+unsubscribe|you('re| are)\s+receiving\s+this|this\s+(email|message)\s+was\s+sent\s+to|%[\s-]*off|limited[- ]time\s+offer|exclusive\s+offer|flash\s+sale|newsletter|promotional|promo\s+code|don'?t\s+miss\s+out|act\s+now|shop\s+now|claim\s+your|free\s+trial|upgrade\s+your\s+(plan|subscription)|subscription\s+has\s+expired|your\s+subscription\s+(is|has)|microsoft\s+365\s+benefits|new\s+in\s+[a-z0-9]|weekly\s+digest|daily\s+digest)\b/i;

/** Phishing / account-scare mail that should never become an RFQ. */
const PHISH_TEXT =
  /\b(netflix\s+support|netflix\s+subscription|account\s+suspension|avoid\s+account\s+suspension|update\s+your\s+payment(\s+information)?|restore\s+your\s+subscription|verify\s+your\s+(account|identity|mailbox)|confirm\s+your\s+(account|identity|password)|unusual\s+(sign[- ]?in|activity)|click\s+here\s+to\s+(restore|verify|update|confirm|secure)|password\s+expir|mailbox\s+quota|secure\s+your\s+account)\b/i;

const PROMO_FROM_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|newsletter|marketing|promotions?|promo|news|digest|notify|notification|updates?|mailer|bounce|automail)\b/i;

const MARKETPLACE_FROM =
  /indiamart\.com|tradeindia\.com|leads@|@marketplace/i;

export type InboundEmailSignals = {
  subject?: string;
  text: string;
  fromEmail?: string;
  /** mailparser Map or plain header bag (lower-case keys preferred). */
  headers?: Map<string, unknown> | Record<string, unknown> | null;
};

function headerGet(
  headers: InboundEmailSignals["headers"],
  name: string
): string {
  if (!headers) return "";
  const needle = name.toLowerCase();
  if (headers instanceof Map) {
    for (const [key, value] of headers.entries()) {
      if (String(key).toLowerCase() === needle) {
        return stringifyHeader(value);
      }
    }
    return "";
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle) return stringifyHeader(value);
  }
  return "";
}

function stringifyHeader(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyHeader).join(" ");
  if (typeof value === "object" && value !== null && "value" in value) {
    return stringifyHeader((value as { value: unknown }).value);
  }
  return String(value);
}

export function isMarketplaceLeadSender(fromEmail: string): boolean {
  return MARKETPLACE_FROM.test(fromEmail || "");
}

/**
 * Marketing / newsletter / bulk mail that should never become an RFQ.
 * Marketplace lead senders are excluded — those are real buyer requirements.
 */
export function looksLikePromotionalEmail(input: InboundEmailSignals): boolean {
  const from = (input.fromEmail || "").trim().toLowerCase();
  if (from && isMarketplaceLeadSender(from)) return false;

  const listUnsub = headerGet(input.headers, "list-unsubscribe");
  const precedence = headerGet(input.headers, "precedence").toLowerCase();
  const autoSubmitted = headerGet(input.headers, "auto-submitted").toLowerCase();
  const xCampaign =
    headerGet(input.headers, "x-campaign") ||
    headerGet(input.headers, "x-mailgun-campaign-id") ||
    headerGet(input.headers, "x-sg-eid") ||
    headerGet(input.headers, "x-campaign-id");

  if (listUnsub) return true;
  if (/\b(bulk|list|junk)\b/.test(precedence)) return true;
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (xCampaign) return true;

  const local = from.split("@")[0] || "";
  if (PROMO_FROM_LOCAL.test(local)) return true;

  // Common consumer / SaaS promo senders (not B2B RFQ buyers).
  if (
    /@(email|e|accountprotection|communication|news|info|updates)\.microsoft\.com$/i.test(
      from
    ) ||
    /@microsoftemail\.com$/i.test(from) ||
    /@(mail|email)\.(beehiiv|substack|groww|duolingo|indeed|render)\./i.test(from) ||
    /@(donotreply|jobalert)\./i.test(from)
  ) {
    return true;
  }

  const subject = (input.subject || "").trim();
  const body = (input.text || "").trim();
  const combined = `${subject}\n${body}`.slice(0, 8000);
  if (PROMO_TEXT.test(combined)) return true;
  if (PHISH_TEXT.test(combined)) return true;

  return false;
}

export function messageLooksLikeRequirement(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  if (cleaned.length < 12) return false;
  if (GREETING_ONLY.test(cleaned)) return false;

  // Placeholder captions from media without a real request.
  if (/^\[whatsapp (image|document|video) received\]$/i.test(cleaned)) {
    return false;
  }

  const lower = cleaned.toLowerCase();
  const hasHint = REQUIREMENT_HINT.test(cleaned);
  const hasQty = QTY_PATTERN.test(cleaned);
  const hasProduct = PRODUCTISH.test(cleaned);
  const multiLine =
    text.split(/\n/).map((line) => line.trim()).filter(Boolean).length >= 2;
  const longEnough = cleaned.length >= 40;
  const listLike = /(?:^|\n)\s*[-*•\d]+[.)]\s+\S+/m.test(text);
  // Subject "need …" + long unrelated body is not enough without product/qty.
  const substance = hasQty || hasProduct || listLike;

  if (hasHint && substance) return true;
  // Multi-line RFQ-ish asks without a catalog keyword still count when detailed.
  if (hasHint && multiLine && cleaned.length >= 80 && !PHISH_TEXT.test(cleaned)) {
    return true;
  }
  if (hasQty && (hasProduct || multiLine || listLike || longEnough)) {
    return true;
  }
  if (hasProduct && (hasQty || hasHint || longEnough)) {
    return true;
  }
  // "Need 10 Dell laptops" style without formal RFQ wording still counts.
  if (hasQty && cleaned.length >= 18 && !/^\d+$/.test(cleaned)) {
    return true;
  }
  // Explicit ask for price/quote alone with product context already covered;
  // bare "please quote" with little else is still a requirement.
  if (
    /\b(please|pls)?\s*(quote|send\s+quote|share\s+(price|rate))\b/i.test(lower)
  ) {
    return cleaned.length >= 12 && !PHISH_TEXT.test(cleaned);
  }
  return false;
}

/**
 * Gate for inbound email → RFQ. Promo/newsletters are rejected; marketplace
 * lead mail and clear product requirements are kept.
 */
export function emailLooksLikeRequirement(input: InboundEmailSignals): boolean {
  if (looksLikePromotionalEmail(input)) return false;

  const from = (input.fromEmail || "").trim();
  if (from && isMarketplaceLeadSender(from)) return true;

  const combined = [input.subject, input.text]
    .filter((part) => (part || "").trim())
    .join("\n");
  return messageLooksLikeRequirement(combined);
}
