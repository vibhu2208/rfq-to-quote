/** Shared mailbox identity — Outlook (Graph) first, then legacy Gmail env vars. */

export function getMailboxUser(): string {
  return (
    process.env.MAILBOX_USER?.trim() ||
    process.env.OUTLOOK_USER?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    ""
  );
}

export type MicrosoftGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
};

export function getMicrosoftGraphConfig(): MicrosoftGraphConfig | null {
  const tenantId =
    process.env.MS_TENANT_ID?.trim() || process.env.AZURE_TENANT_ID?.trim() || "";
  const clientId =
    process.env.MS_CLIENT_ID?.trim() || process.env.AZURE_CLIENT_ID?.trim() || "";
  const clientSecret =
    process.env.MS_CLIENT_SECRET?.trim() ||
    process.env.AZURE_CLIENT_SECRET?.trim() ||
    "";
  const mailbox = getMailboxUser();
  if (!tenantId || !clientId || !clientSecret || !mailbox) return null;
  return { tenantId, clientId, clientSecret, mailbox };
}

export function shouldMarkMailSeen(): boolean {
  return (process.env.MAIL_MARK_SEEN ?? process.env.GMAIL_MARK_SEEN) !== "false";
}
