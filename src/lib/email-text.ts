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

function labeledEmailIdentityValue(text: string, labels: string[]): string {
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
}

const COMPANY_LINE_RE =
  /\b(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|LLP|LLC|Inc\.?|Corp\.?|Corporation|Technologies|Solutions|Logistics|Enterprises|Industries|Hospital|School|University|College|Cafe|Café|Restaurant)\b/i;

const JOB_TITLE_RE =
  /\b(?:IT\s+)?(?:Procurement|Purchase|Operations|Sales|Marketing|Accounts|Finance|Admin(?:istration)?|HR|Human\s+Resources)?\s*(?:Lead|Manager|Head|Director|Officer|Executive|Engineer|Coordinator|Assistant|Specialist|Consultant|Owner|Founder|CEO|CTO|CFO|COO|MD|VP)\b|\b(?:Team\s+Lead|Project\s+Manager)\b/i;

const PHONE_VALUE_RE =
  /(?:\+?\d[\d\s\-()]{7,}\d)/;

const EMAIL_VALUE_RE =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function looksLikePersonName(line: string): boolean {
  const cleaned = line.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 60) return false;
  if (COMPANY_LINE_RE.test(cleaned) || JOB_TITLE_RE.test(cleaned)) return false;
  if (PHONE_VALUE_RE.test(cleaned) || EMAIL_VALUE_RE.test(cleaned)) return false;
  if (/[@/:#]/.test(cleaned)) return false;
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[A-Z][a-zA-Z'’-]*$/.test(p) || /^[A-Z]\.?$/.test(p));
}

function looksLikeCompanyLine(line: string): boolean {
  const cleaned = line.trim();
  if (!cleaned || cleaned.length > 120) return false;
  if (PHONE_VALUE_RE.test(cleaned) || EMAIL_VALUE_RE.test(cleaned)) return false;
  if (JOB_TITLE_RE.test(cleaned) && !COMPANY_LINE_RE.test(cleaned)) return false;
  return COMPANY_LINE_RE.test(cleaned);
}

function normalizePhoneCandidate(value: string): string {
  const match = value.match(PHONE_VALUE_RE);
  if (!match) return "";
  return match[0].replace(/\s+/g, " ").trim();
}

/** Freeform block after Regards/Thanks: name, title, company, phone/email. */
export function extractFreeformSignatureIdentity(body: string): {
  contact: string;
  company: string;
  phone: string;
  email: string;
} {
  const text = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const signOff = text.match(
    /(?:^|\n)\s*(?:Regards|Thanks|Thank you|Best regards|Warm regards|Sincerely|With regards|Yours (?:truly|sincerely)|Best)\s*[,!]?\s*(?:\n+|$)/i
  );
  if (!signOff || signOff.index == null) {
    return { contact: "", company: "", phone: "", email: "" };
  }

  const after = text.slice(signOff.index + signOff[0].length);
  const lines = after
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  let contact = "";
  let company = "";
  let phone = "";
  let email = "";

  for (const line of lines) {
    if (!phone) {
      const phoneHit = normalizePhoneCandidate(line);
      if (phoneHit && phoneHit.replace(/\D/g, "").length >= 10) {
        phone = phoneHit;
        // Pure phone line — skip other roles
        if (/^[\d+\s\-()]+$/.test(line.replace(/\s+/g, " ").trim())) continue;
      }
    }
    if (!email) {
      const emailHit = line.match(EMAIL_VALUE_RE)?.[0];
      if (emailHit) {
        email = emailHit;
        if (line.trim() === emailHit) continue;
      }
    }
    if (!contact && looksLikePersonName(line)) {
      contact = line.replace(/\s+/g, " ").trim();
      continue;
    }
    if (!company && looksLikeCompanyLine(line)) {
      company = line.replace(/\s+/g, " ").trim();
      continue;
    }
  }

  // Trailing phone/email anywhere in signature if not on own line yet
  if (!phone) {
    const anywhere = after.match(PHONE_VALUE_RE);
    if (anywhere && anywhere[0].replace(/\D/g, "").length >= 10) {
      phone = anywhere[0].replace(/\s+/g, " ").trim();
    }
  }
  if (!email) {
    const anywhere = after.match(EMAIL_VALUE_RE);
    if (anywhere) email = anywhere[0];
  }

  return { contact, company, phone, email };
}

/** Signature identity from labeled fields and/or freeform closing block. */
export function extractLabeledCustomerIdentity(body: string): {
  contact: string;
  company: string;
  phone: string;
  email: string;
} {
  const text = String(body || "");
  const labeled = {
    company: labeledEmailIdentityValue(text, [
      "Company\\s*Name",
      "Company",
      "Organisation",
      "Organization",
      "Org",
    ]),
    // Prefer Contact* labels; bare "Name:" is too ambiguous in RFQ bodies.
    contact: labeledEmailIdentityValue(text, [
      "Contact\\s*Person",
      "Contact\\s*Name",
      "Contact",
    ]),
    phone: normalizePhoneCandidate(
      labeledEmailIdentityValue(text, ["Phone", "Mobile", "Tel(?:ephone)?", "Cell"])
    ),
    email: (
      labeledEmailIdentityValue(text, ["E-?mail", "Email\\s*Id", "Email\\s*ID", "Mail"]).match(
        EMAIL_VALUE_RE
      ) || [""]
    )[0],
  };

  const freeform = extractFreeformSignatureIdentity(text);
  return {
    contact: labeled.contact || freeform.contact,
    company: labeled.company || freeform.company,
    phone: labeled.phone || freeform.phone,
    email: labeled.email || freeform.email,
  };
}

export type CustomerIdentityFromEmail = {
  customerName: string;
  customerCompany: string;
  customerPhone: string;
  customerEmail: string;
};

/**
 * Read labeled / freeform signature identity from an inbound email body.
 * Prefer explicit Contact/Company (or Regards block) over the From display name
 * (mailbox names are often the company trade name, not the person).
 */
export function extractCustomerIdentityFromEmail(
  body: string,
  fromName = "",
  fromEmail = ""
): CustomerIdentityFromEmail {
  const labeled = extractLabeledCustomerIdentity(body);
  return {
    customerName: labeled.contact || fromName.trim() || fromEmail.trim(),
    customerCompany: labeled.company,
    customerPhone: labeled.phone,
    customerEmail: labeled.email || fromEmail.trim(),
  };
}

/**
 * Repair leads ingested before signature parsing: fill blank company/phone/email
 * and replace mailbox-display contact when the body has a clearer identity.
 */
export function normalizeStoredCustomerIdentity(input: {
  rawText?: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}): {
  customerName: string;
  customerCompany: string;
  customerPhone: string;
  customerEmail: string;
  changed: boolean;
} {
  const currentName = String(input.customerName || "").trim();
  const currentCompany = String(input.customerCompany || "").trim();
  const currentPhone = String(input.customerPhone || "").trim();
  const currentEmail = String(input.customerEmail || "").trim();
  const labeled = extractLabeledCustomerIdentity(input.rawText || "");

  let customerName = currentName;
  let customerCompany = currentCompany;
  let customerPhone = currentPhone;
  let customerEmail = currentEmail;
  let changed = false;

  if (labeled.company && !currentCompany) {
    customerCompany = labeled.company;
    changed = true;
  }

  // Classic bug: contact = From display name, company blank, signature has both.
  if (labeled.contact && (!currentName || !currentCompany || customerName.toLowerCase() === currentCompany.toLowerCase())) {
    if (customerName.toLowerCase() !== labeled.contact.toLowerCase()) {
      customerName = labeled.contact;
      changed = true;
    }
  } else if (
    labeled.contact &&
    currentName &&
    !looksLikePersonName(currentName) &&
    looksLikePersonName(labeled.contact)
  ) {
    customerName = labeled.contact;
    changed = true;
  }

  if (labeled.phone && !currentPhone) {
    customerPhone = labeled.phone;
    changed = true;
  }

  if (labeled.email && !currentEmail) {
    customerEmail = labeled.email;
    changed = true;
  }

  return {
    customerName,
    customerCompany,
    customerPhone,
    customerEmail,
    changed,
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
