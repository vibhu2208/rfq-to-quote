/**
 * Normalize outbound email copy so clients don't show quoted-printable
 * artifacts (=E2=80=94, =C2=A0, soft-break "=") from fancy Unicode.
 */
export function normalizeOutboundEmailText(value: string): string {
  return String(value || "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u20B9/g, "Rs.")
    .replace(/[\u00A2-\u00A5\u20A0-\u20BF]/g, (ch) => {
      if (ch === "₹" || ch === "₨") return "Rs.";
      return ch;
    })
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      // Skip invalid / private-use junk (e.g. &#1048958;)
      if (!Number.isFinite(code) || code <= 0 || code > 0xffff) return "";
      return String.fromCharCode(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = Number.parseInt(h, 16);
      if (!Number.isFinite(code) || code <= 0 || code > 0xffff) return "";
      return String.fromCharCode(code);
    });
}

/**
 * Convert HTML email bodies to plain text while keeping structure
 * (paragraphs, line breaks, list items) — never flatten to one paragraph.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  let text = String(html)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Drop noisy blocks entirely
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Block / break tags → newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|h[1-6]|section|article|header|footer|blockquote)>/gi, "\n")
    .replace(/<(p|div|tr|h[1-6]|section|article|header|footer|blockquote)(\s[^>]*)?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<(ul|ol)[^>]*>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    // Remaining tags
    .replace(/<[^>]+>/g, "");

  text = decodeBasicHtmlEntities(text);
  return normalizeOutboundEmailText(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Read labeled signature / footer identity from an inbound email body.
 * Prefer explicit `Contact:` / `Company:` lines over the From display name
 * (mailbox names are often the company trade name, not the person).
 */
export function extractCustomerIdentityFromEmail(
  body: string,
  fromName = "",
  fromEmail = ""
): { customerName: string; customerCompany: string } {
  const text = String(body || "");

  const labeledValue = (labels: string[]): string => {
    const pattern = new RegExp(
      `(?:^|[\\n\\r]|\\s)(?:${labels.join("|")})\\s*[:=]\\s*([^\\n\\r]+)`,
      "i"
    );
    const match = text.match(pattern);
    if (!match?.[1]) return "";
    return match[1]
      .trim()
      // Stop before a following labeled field jammed on the same line
      .replace(
        /\s+(?:Company(?:\s*Name)?|Organisation|Organization|Org|Contact(?:\s*(?:Person|Name))?|Email|E-?mail|Phone|Mobile|Tel|Website|Web)\s*[:=].*$/i,
        ""
      )
      .replace(/[|,;]+$/g, "")
      .trim();
  };

  const company = labeledValue([
    "Company\\s*Name",
    "Company",
    "Organisation",
    "Organization",
    "Org",
  ]);

  // Prefer Contact* labels; bare "Name:" is too ambiguous in RFQ bodies.
  const contact = labeledValue([
    "Contact\\s*Person",
    "Contact\\s*Name",
    "Contact",
  ]);

  return {
    customerName: contact || fromName.trim() || fromEmail.trim(),
    customerCompany: company,
  };
}

/** Prefer plain text; fall back to structured HTML→text (keeps line breaks). */
export function emailBodyFromParts(
  text?: string | false | null,
  html?: string | false | null
): string {
  // mailparser types text/html as `string | false`
  const plain = String(text || "").trim();
  if (plain) {
    // Legacy IMAP/HTML strip often left &nbsp; / &quot; in "plain" text.
    return structureEmailBodyForDisplay(plain);
  }
  return htmlToPlainText(String(html || ""));
}

/**
 * Decode entities + restore line structure for Thread/raw display.
 * Handles legacy bodies flattened to one paragraph with literal &nbsp;.
 */
export function structureEmailBodyForDisplay(value: string): string {
  let text = decodeBasicHtmlEntities(String(value || ""));
  text = normalizeOutboundEmailText(text)
    .replace(/\u00A0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
  if (!text) return "";

  // Already multi-line — just tidy (still run light list fixes below).
  const hadNewlines = text.includes("\n");

  // Bullets mid-paragraph
  text = text.replace(/\s+[•●◦▪▫]\s+/g, "\n• ");

  // Numbered RFQ lines: "1) Item" / "2. Item" — not decimals like 0.00
  text = text.replace(/(?:^|\s+)(\d{1,2})[.)](?!\d)\s*/g, "\n$1. ");

  // Quote-table leftovers jammed on one line: Qty : 1 Rate : 0.00
  text = text.replace(/\s*Qty\s*:\s*/gi, "\n  Qty: ");
  text = text.replace(/\s*Rate\s*:\s*/gi, "  Rate: ");

  // Signature identity labels often arrive flattened in HTML→text
  text = text.replace(
    /\s+(?=(?:Company(?:\s*Name)?|Organisation|Organization|Org|Contact(?:\s*(?:Person|Name)?))\s*[:=])/gi,
    "\n"
  );

  if (!hadNewlines) {
    text = text.replace(
      /\s+(?=(?:Dear\b|Hi\b|Hello\b|Respected\b|Good\s+(?:morning|afternoon|evening)\b|Regards\b|Thanks\b|Thank you\b|Best regards\b|Warm regards\b|Sincerely\b|Subject:|From:|Sent:|To:))/gi,
      "\n\n"
    );
  }

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain-text body as simple UTF-8 HTML so Graph/Outlook render it cleanly. */
export function plainTextToEmailHtml(text: string): string {
  const normalized = normalizeOutboundEmailText(text);
  const escaped = normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">${escaped.replace(/\n/g, "<br/>")}</div>`;
}
