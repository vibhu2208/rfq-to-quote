/**
 * Heuristic: does this inbound text look like a product / RFQ requirement?
 * Used to keep WhatsApp chatter (hi/ok/thanks) out of the RFQ inbox.
 */

const GREETING_ONLY =
  /^(hi+|hii+|hello|hey|namaste|namaskar|good\s*(morning|afternoon|evening)|ok+|okay|k+|thanks?|thank\s*you|ty|yes|no|👍|🙏|🙂|😊)[\s!.]*$/i;

const REQUIREMENT_HINT =
  /\b(rfq|quote|quotation|need|needed|require|requirement|looking\s+for|want|pls|please|supply|procure|price|rate|budget|enquiry|inquiry|indent|po\b|purchase|order|qty|quantity|nos?\.?|pcs?\.?|units?|pieces?|kg|ltr|litre|meter|metre|box|set|pair)\b/i;

const QTY_PATTERN =
  /(?:^|[\s:])(\d{1,6}(?:[.,]\d+)?)\s*(?:x|×|\*)?\s*(?:nos?\.?|pcs?\.?|pieces?|units?|qty|quantity|kg|ltr|litres?|boxes?|sets?|pairs?|meters?|metres?)?\b/i;

const PRODUCTISH =
  /\b(laptop|desktop|monitor|printer|switch|router|cable|ups|inverter|battery|server|camera|hdd|ssd|ram|cpu|mouse|keyboard|projector|tv|led|panel|toner|cartridge|antivirus|license|software|firewall|access\s*point|poe|cat6|cat\s*6)\b/i;

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
  const multiLine = text.split(/\n/).map((line) => line.trim()).filter(Boolean).length >= 2;
  const longEnough = cleaned.length >= 40;
  const listLike = /(?:^|\n)\s*[-*•\d]+[.)]\s+\S+/m.test(text);

  if (hasHint && (hasQty || hasProduct || multiLine || longEnough || listLike)) {
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
  if (/\b(please|pls)?\s*(quote|send\s+quote|share\s+(price|rate))\b/i.test(lower)) {
    return cleaned.length >= 12;
  }
  return false;
}
