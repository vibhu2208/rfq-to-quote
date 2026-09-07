export type QuoteSendChannel = "EMAIL" | "WHATSAPP";

export type RfqInboundChannel =
  | "WHATSAPP"
  | "EMAIL"
  | "WEB_FORM"
  | "MARKETPLACE"
  | "MANUAL";

export type QuoteSendDefaults = {
  /** Suggested outbound channel based on how the RFQ arrived. */
  suggestedChannel: QuoteSendChannel;
  /** Suggested destination (email or phone) — user can override. */
  suggestedTo: string;
  /** Origin channel on the linked RFQ, if any. */
  rfqChannel: RfqInboundChannel | null;
  /** Whether destination/channel should be treated as required to confirm (manual / blank). */
  requiresChoice: boolean;
  hint: string;
};

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

/** Map inbound RFQ channel → default outbound send channel + destination. */
export function resolveQuoteSendDefaults(input: {
  rfqChannel: RfqInboundChannel | null;
  buyerEmail: string;
  buyerPhone: string;
  customerEmail?: string;
  customerPhone?: string;
}): QuoteSendDefaults {
  const email = firstNonEmpty(input.buyerEmail, input.customerEmail);
  const phone = firstNonEmpty(input.buyerPhone, input.customerPhone);
  const channel = input.rfqChannel;

  if (channel === "WHATSAPP") {
    return {
      suggestedChannel: "WHATSAPP",
      suggestedTo: phone || email,
      rfqChannel: channel,
      requiresChoice: !phone && !email,
      hint: phone
        ? "This RFQ came via WhatsApp — send the quote back on WhatsApp by default."
        : "This RFQ came via WhatsApp, but no phone is on file. Enter a number or switch to email.",
    };
  }

  if (channel === "EMAIL" || channel === "WEB_FORM" || channel === "MARKETPLACE") {
    const label =
      channel === "WEB_FORM"
        ? "web form"
        : channel === "MARKETPLACE"
          ? "marketplace email"
          : "email";
    return {
      suggestedChannel: "EMAIL",
      suggestedTo: email || phone,
      rfqChannel: channel,
      requiresChoice: !email,
      hint: email
        ? `This RFQ came via ${label} — reply to ${email} by default.`
        : `This RFQ came via ${label}, but no email is on file. Enter an address or switch channel.`,
    };
  }

  // MANUAL or no linked RFQ — ask whom / how
  return {
    suggestedChannel: email ? "EMAIL" : phone ? "WHATSAPP" : "EMAIL",
    suggestedTo: email || phone,
    rfqChannel: channel,
    requiresChoice: true,
    hint:
      channel === "MANUAL"
        ? "Manual RFQ — choose who to send to and by which channel."
        : "No inbound channel linked — choose who to send to and by which channel.",
  };
}
