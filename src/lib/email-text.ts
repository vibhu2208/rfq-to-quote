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

/** Plain-text body as simple UTF-8 HTML so Graph/Outlook render it cleanly. */
export function plainTextToEmailHtml(text: string): string {
  const normalized = normalizeOutboundEmailText(text);
  const escaped = normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">${escaped.replace(/\n/g, "<br/>")}</div>`;
}
