import nodemailer from "nodemailer";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult = {
  messageId: string;
};

function toAngleAddr(id: string): string {
  const bare = id.replace(/[<>]/g, "").trim();
  return bare ? `<${bare}>` : "";
}

function toReferencesHeader(refs: string): string {
  return refs
    .split(/\s+/)
    .map((r) => toAngleAddr(r))
    .filter(Boolean)
    .join(" ");
}

function requireSmtpConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD are required to send emails."
    );
  }
  return {
    user,
    pass,
    host: process.env.GMAIL_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.GMAIL_SMTP_PORT || 587),
  };
}

/** Send outbound email via Gmail SMTP (same App Password as IMAP). */
export async function sendGmailEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const config = requireSmtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  const info = await transport.sendMail({
    from: `"${process.env.COMPANY_NAME || "QuoteFlow"}" <${config.user}>`,
    to: input.to,
    replyTo: input.replyTo || config.user,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
    // RFC 5322 Message-IDs must use angle brackets or many clients drop threading.
    headers: {
      ...(input.inReplyTo
        ? { "In-Reply-To": toAngleAddr(input.inReplyTo) }
        : {}),
      ...(input.references
        ? { References: toReferencesHeader(input.references) }
        : {}),
    },
  });

  const messageId = (info.messageId || "").replace(/[<>]/g, "");
  if (!messageId) {
    throw new Error("Email sent but no Message-ID was returned.");
  }
  return { messageId };
}
