import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { createRfqWithMessage, resolveEmailChannel } from "@/lib/rfq";
import { handleVendorReplyEmail } from "@/lib/vendor-outreach";

export type PolledEmail = {
  messageId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  attachments: Array<{ name: string; contentType?: string }>;
};

const GMAIL_LAST_UID_KEY = "gmail:last-inbox-uid";

function requireGmailConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD are required. Create a Google App Password and set them in .env"
    );
  }
  return {
    user,
    pass,
    host: process.env.GMAIL_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.GMAIL_IMAP_PORT || 993),
    markSeen: process.env.GMAIL_MARK_SEEN !== "false",
  };
}

function parseAddress(raw?: string | null): { name: string; email: string } {
  if (!raw) return { name: "", email: "" };
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  if (raw.includes("@")) return { name: "", email: raw.trim().toLowerCase() };
  return { name: raw.trim(), email: "" };
}

async function getLastSeenGmailUid(): Promise<number> {
  const state = await prisma.appState.findUnique({
    where: { key: GMAIL_LAST_UID_KEY },
    select: { value: true },
  });
  const parsed = Number(state?.value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function setLastSeenGmailUid(uid: number): Promise<void> {
  if (!Number.isFinite(uid) || uid <= 0) return;

  await prisma.appState.upsert({
    where: { key: GMAIL_LAST_UID_KEY },
    update: { value: String(uid) },
    create: { key: GMAIL_LAST_UID_KEY, value: String(uid) },
  });
}

/**
 * Fetch unread INBOX messages from Gmail via IMAP (App Password).
 * Every message becomes an RFQ after AI parse + vendor matching on the UI.
 * By default, the first poll starts from the newest current email so old unread
 * mail does not flood the RFQ inbox.
 */
export async function pollGmailInbox(options?: {
  limit?: number;
  includeExisting?: boolean;
}): Promise<{
  fetched: number;
  created: number;
  skipped: number;
  vendorReplies: number;
  initialized: boolean;
  lastSeenUid: number;
  rfqs: Array<{ id: string; status: string; subject: string; fromEmail: string }>;
}> {
  const config = requireGmailConfig();
  const limit = Math.min(options?.limit ?? 20, 50);
  const includeExisting = options?.includeExisting ?? false;

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  const rfqs: Array<{ id: string; status: string; subject: string; fromEmail: string }> = [];
  let fetched = 0;
  let created = 0;
  let skipped = 0;
  let vendorReplies = 0;
  let initialized = false;
  let lastSeenUid = await getLastSeenGmailUid();

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      const unreadUids = (uids || []).sort((a, b) => a - b);
      const maxUnreadUid = unreadUids.at(-1) || 0;
      const currentMailboxUid = client.mailbox ? Math.max(0, client.mailbox.uidNext - 1) : 0;
      const currentMaxUid = Math.max(maxUnreadUid, currentMailboxUid);

      if (!includeExisting && lastSeenUid === 0) {
        if (currentMaxUid > 0) {
          await setLastSeenGmailUid(currentMaxUid);
          lastSeenUid = currentMaxUid;
        }

        initialized = true;
        return { fetched, created, skipped, vendorReplies, initialized, lastSeenUid, rfqs };
      }

      const selected = unreadUids.filter((uid) => uid > lastSeenUid).slice(-limit);

      for (const uid of selected) {
        const downloaded = await client.download(uid, undefined, { uid: true });
        if (!downloaded?.content) {
          lastSeenUid = Math.max(lastSeenUid, uid);
          continue;
        }

        const parsed = await simpleParser(downloaded.content);
        fetched += 1;

        const vendorReply = await handleVendorReplyEmail(parsed);
        if (vendorReply.handled) {
          vendorReplies += 1;
          skipped += 1;
          if (config.markSeen) await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          lastSeenUid = Math.max(lastSeenUid, uid);
          continue;
        }

        const fromRaw =
          parsed.from?.text ||
          parsed.from?.value?.[0]?.address ||
          "";
        const { name: fromName, email: fromEmail } = parseAddress(
          typeof fromRaw === "string" ? fromRaw : String(fromRaw)
        );
        const subject = parsed.subject || "(no subject)";
        const text =
          (parsed.text || "").trim() ||
          (parsed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const messageId =
          (parsed.messageId || `gmail-uid-${uid}`).replace(/[<>]/g, "").slice(0, 240);

        if (!text) {
          skipped += 1;
          if (config.markSeen) await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          lastSeenUid = Math.max(lastSeenUid, uid);
          continue;
        }

        const existing = await prisma.rfq.findFirst({
          where: { sourceRef: messageId },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          if (config.markSeen) await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          lastSeenUid = Math.max(lastSeenUid, uid);
          continue;
        }

        const attachments = (parsed.attachments || []).map((attachment) => ({
          name: attachment.filename || "attachment",
          contentType: attachment.contentType,
        }));

        const channel = resolveEmailChannel(fromEmail);
        const rfq = await createRfqWithMessage({
          channel,
          sourceRef: messageId,
          subject,
          rawText: text.slice(0, 20000),
          rawAttachments: attachments,
          customerName: fromName || fromEmail,
          customerEmail: fromEmail,
        });

        created += 1;
        rfqs.push({
          id: rfq.id,
          status: rfq.status,
          subject,
          fromEmail,
        });

        if (config.markSeen) {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        }

        lastSeenUid = Math.max(lastSeenUid, uid);
      }

      await setLastSeenGmailUid(lastSeenUid);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return { fetched, created, skipped, vendorReplies, initialized, lastSeenUid, rfqs };
}
