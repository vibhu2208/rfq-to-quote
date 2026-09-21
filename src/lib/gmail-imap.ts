import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { createRfqWithMessage, resolveEmailChannel } from "@/lib/rfq";
import { handleVendorReplyEmail } from "@/lib/vendor-outreach";
import { handleQuoteReplyEmail } from "@/lib/quote-thread";

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
  quoteReplies: number;
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
  let quoteReplies = 0;
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
        return {
          fetched,
          created,
          skipped,
          vendorReplies,
          quoteReplies,
          initialized,
          lastSeenUid,
          rfqs,
        };
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

        const quoteReply = await handleQuoteReplyEmail(parsed);
        if (quoteReply.handled) {
          quoteReplies += 1;
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

  return { fetched, created, skipped, vendorReplies, quoteReplies, initialized, lastSeenUid, rfqs };
}

function normalizeMsgId(id?: string | null): string {
  return (id || "").replace(/[<>]/g, "").trim();
}

/**
 * Skip only true outbound copies of our own sends.
 * Do NOT skip self-replies (same Gmail account used for testing / same-address buyers)
 * — those still have Re:/In-Reply-To and must be captured.
 */
function isOwnOutboundCopy(input: {
  fromEmail: string;
  gmailUser: string;
  subject: string;
  messageId: string;
  inReplyTo: string;
  outboundMsgId: string;
  knownOutboundIds: Set<string>;
}): boolean {
  const msgId = normalizeMsgId(input.messageId);
  if (msgId && (msgId === input.outboundMsgId || input.knownOutboundIds.has(msgId))) {
    return true;
  }

  const from = input.fromEmail.trim().toLowerCase();
  const user = input.gmailUser.trim().toLowerCase();
  if (!from || !user || from !== user) return false;

  const isReply =
    Boolean(normalizeMsgId(input.inReplyTo)) || /^re\s*:/i.test(input.subject || "");
  // Self-replies keep going; original outbound without reply headers is skipped.
  return !isReply;
}

/** Quote a Gmail search phrase so hyphens in Q-2026-0001 are not treated as NOT. */
function gmailPhrase(value: string): string {
  return `"${value.replace(/"/g, "").trim()}"`;
}

async function lockThreadMailbox(client: ImapFlow) {
  // Prefer All Mail so archived / labeled replies are still found.
  for (const path of ["[Gmail]/All Mail", "[Google Mail]/All Mail", "INBOX"]) {
    try {
      const lock = await client.getMailboxLock(path);
      return { lock, path };
    } catch {
      // try next
    }
  }
  const lock = await client.getMailboxLock("INBOX");
  return { lock, path: "INBOX" };
}

/**
 * Search Gmail for messages related to one quote's buyer / QREF / quote number
 * and process only that thread (does not create RFQs or advance the global UID cursor).
 */
export async function checkQuoteEmailThread(quoteId: string): Promise<{
  scanned: number;
  matched: number;
  newReplies: number;
  alreadyCaptured: number;
  buyerEmail: string;
  quoteNumber: string;
  results: Array<{
    subject: string;
    fromEmail: string;
    intent?: string;
    needsAssistance?: boolean;
    autoReplied?: boolean;
    alreadyCaptured?: boolean;
  }>;
}> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      messages: {
        select: { direction: true, toEmail: true, messageId: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!quote) throw new Error("Quote not found.");
  if (quote.status === "DRAFT" && !quote.sentAt) {
    throw new Error("Send the quote first before checking its email thread.");
  }

  const candidateEmails = new Set<string>();
  const buyerEmail = quote.buyerEmail.trim().toLowerCase();
  if (buyerEmail) candidateEmails.add(buyerEmail);
  const knownOutboundIds = new Set<string>();
  if (quote.outboundMsgId) knownOutboundIds.add(normalizeMsgId(quote.outboundMsgId));
  for (const m of quote.messages) {
    if (m.direction === "OUT") {
      const to = m.toEmail.trim().toLowerCase();
      if (to.includes("@")) candidateEmails.add(to);
      const mid = normalizeMsgId(m.messageId);
      if (mid) knownOutboundIds.add(mid);
    }
  }

  const threadRef = quote.threadRef || `QREF-${quote.quoteNumber}`;
  const since = quote.sentAt
    ? new Date(quote.sentAt.getTime() - 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const after = formatGmailAfter(since);

  const config = requireGmailConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  const results: Array<{
    subject: string;
    fromEmail: string;
    intent?: string;
    needsAssistance?: boolean;
    autoReplied?: boolean;
    alreadyCaptured?: boolean;
  }> = [];
  let scanned = 0;
  let matched = 0;
  let newReplies = 0;
  let alreadyCaptured = 0;

  await client.connect();
  try {
    const { lock, path: mailbox } = await lockThreadMailbox(client);
    try {
      const uidSet = new Set<number>();

      const gmailQueries: string[] = [
        // Must quote Q-####-#### — unquoted hyphens mean NOT in Gmail search.
        `(${gmailPhrase(quote.quoteNumber)} OR ${gmailPhrase(threadRef)} OR subject:${gmailPhrase(quote.quoteNumber)}) after:${after}`,
      ];
      for (const email of candidateEmails) {
        gmailQueries.push(`from:${email} after:${after}`);
      }

      for (const q of gmailQueries) {
        try {
          const found = await client.search({ gmailraw: q }, { uid: true });
          for (const uid of found || []) uidSet.add(uid);
        } catch {
          // gmailraw may be unavailable on non-Gmail hosts
        }
      }

      // Always also run IMAP criteria (merge) — do not rely on gmailraw alone.
      for (const email of candidateEmails) {
        try {
          const fromHits = await client.search({ from: email, since }, { uid: true });
          for (const uid of fromHits || []) uidSet.add(uid);
        } catch {
          // ignore
        }
      }
      for (const subject of [quote.quoteNumber, threadRef]) {
        try {
          const subjectHits = await client.search({ subject, since }, { uid: true });
          for (const uid of subjectHits || []) uidSet.add(uid);
        } catch {
          // ignore
        }
      }

      const uids = [...uidSet].sort((a, b) => a - b).slice(-40);

      for (const uid of uids) {
        const downloaded = await client.download(uid, undefined, { uid: true });
        if (!downloaded?.content) continue;

        const parsed = await simpleParser(downloaded.content);
        scanned += 1;

        const fromRaw =
          parsed.from?.text || parsed.from?.value?.[0]?.address || "";
        const { email: fromEmail } = parseAddress(
          typeof fromRaw === "string" ? fromRaw : String(fromRaw)
        );

        const messageId = normalizeMsgId(parsed.messageId);
        const inReplyTo = normalizeMsgId(
          typeof parsed.inReplyTo === "string"
            ? parsed.inReplyTo
            : Array.isArray(parsed.inReplyTo)
              ? parsed.inReplyTo[0]
              : ""
        );

        // Skip our sent copies only — keep self-replies (same mailbox as GMAIL_USER).
        if (
          isOwnOutboundCopy({
            fromEmail,
            gmailUser: config.user,
            subject: parsed.subject || "",
            messageId,
            inReplyTo,
            outboundMsgId: quote.outboundMsgId,
            knownOutboundIds,
          })
        ) {
          continue;
        }

        const reply = await handleQuoteReplyEmail(parsed, {
          expectedQuoteId: quoteId,
        });
        if (!reply.handled) continue;

        matched += 1;
        if (reply.alreadyCaptured) {
          alreadyCaptured += 1;
        } else {
          newReplies += 1;
          if (config.markSeen && mailbox === "INBOX") {
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          }
        }

        results.push({
          subject: parsed.subject || "(no subject)",
          fromEmail,
          intent: reply.intent,
          needsAssistance: reply.needsAssistance,
          autoReplied: reply.autoReplied,
          alreadyCaptured: reply.alreadyCaptured,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return {
    scanned,
    matched,
    newReplies,
    alreadyCaptured,
    buyerEmail: buyerEmail || [...candidateEmails][0] || "",
    quoteNumber: quote.quoteNumber,
    results,
  };
}

function formatGmailAfter(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/**
 * Search Gmail for vendor Recore replies for one RFQ (All Mail + INBOX).
 * Does not create RFQs or advance the global inbox UID cursor.
 */
export async function checkVendorOutreachThread(rfqId: string): Promise<{
  scanned: number;
  matched: number;
  newReplies: number;
  alreadyCaptured: number;
  results: Array<{
    vendorId: string;
    vendorName: string;
    subject: string;
    fromEmail: string;
    quotedPrice: number | null;
    lineCount: number;
    alreadyCaptured?: boolean;
  }>;
}> {
  const outreaches = await prisma.vendorOutreach.findMany({
    where: {
      rfqId,
      status: { in: ["SENT", "REPLIED", "PENDING", "FAILED", "NEGOTIATING", "DECLINED"] },
    },
    include: {
      vendor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  if (outreaches.length === 0) {
    return {
      scanned: 0,
      matched: 0,
      newReplies: 0,
      alreadyCaptured: 0,
      results: [],
    };
  }

  const earliest = outreaches.reduce<Date | null>((min, row) => {
    const t = row.sentAt || row.createdAt;
    if (!min || t < min) return t;
    return min;
  }, null);
  const since = earliest
    ? new Date(earliest.getTime() - 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const after = formatGmailAfter(since);

  const config = requireGmailConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  const results: Array<{
    vendorId: string;
    vendorName: string;
    subject: string;
    fromEmail: string;
    quotedPrice: number | null;
    lineCount: number;
    alreadyCaptured?: boolean;
  }> = [];
  let scanned = 0;
  let matched = 0;
  let newReplies = 0;
  let alreadyCaptured = 0;

  await client.connect();
  try {
    const { lock, path: mailbox } = await lockThreadMailbox(client);
    try {
      const uidSet = new Set<number>();

      for (const outreach of outreaches) {
        const queries: string[] = [
          `${gmailPhrase(outreach.threadRef)} after:${after}`,
          `subject:${gmailPhrase(outreach.threadRef)} after:${after}`,
        ];
        const vendorEmail = outreach.vendor.email?.trim().toLowerCase();
        if (vendorEmail) {
          queries.push(`from:${vendorEmail} after:${after}`);
        }

        for (const q of queries) {
          try {
            const found = await client.search({ gmailraw: q }, { uid: true });
            for (const uid of found || []) uidSet.add(uid);
          } catch {
            // gmailraw may be unavailable
          }
        }

        if (vendorEmail) {
          try {
            const fromHits = await client.search(
              { from: vendorEmail, since },
              { uid: true }
            );
            for (const uid of fromHits || []) uidSet.add(uid);
          } catch {
            // ignore
          }
        }

        try {
          const subjectHits = await client.search(
            { subject: outreach.threadRef, since },
            { uid: true }
          );
          for (const uid of subjectHits || []) uidSet.add(uid);
        } catch {
          // ignore
        }
      }

      const uids = [...uidSet].sort((a, b) => a - b).slice(-60);

      for (const uid of uids) {
        const downloaded = await client.download(uid, undefined, { uid: true });
        if (!downloaded?.content) continue;

        const parsed = await simpleParser(downloaded.content);
        scanned += 1;

        const fromRaw =
          parsed.from?.text || parsed.from?.value?.[0]?.address || "";
        const { email: fromEmail } = parseAddress(
          typeof fromRaw === "string" ? fromRaw : String(fromRaw)
        );

        // Skip our own outbound Recore copies (not replies).
        const subject = parsed.subject || "";
        const isOutboundRecore =
          /^Quote request —/i.test(subject) &&
          !/^re\s*:/i.test(subject) &&
          fromEmail === config.user.trim().toLowerCase();
        if (isOutboundRecore) continue;

        const before = await prisma.vendorOutreach.findFirst({
          where: {
            rfqId,
            replyMsgId: normalizeMsgId(parsed.messageId).slice(0, 240) || "__none__",
          },
          select: { id: true },
        });

        const reply = await handleVendorReplyEmail(parsed);
        if (!reply.handled || reply.rfqId !== rfqId) continue;

        matched += 1;
        const wasAlready = Boolean(before);
        if (wasAlready) {
          alreadyCaptured += 1;
        } else {
          newReplies += 1;
          if (config.markSeen && mailbox === "INBOX") {
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          }
        }

        const vendor =
          outreaches.find((o) => o.vendorId === reply.vendorId)?.vendor ||
          null;

        results.push({
          vendorId: reply.vendorId,
          vendorName: vendor?.name || reply.vendorId,
          subject,
          fromEmail,
          quotedPrice: reply.quotedPrice,
          lineCount: reply.quotedLineItems.length,
          alreadyCaptured: wasAlready,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return {
    scanned,
    matched,
    newReplies,
    alreadyCaptured,
    results,
  };
}
