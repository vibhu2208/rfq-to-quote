import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import type { ParsedMail } from "mailparser";
import {
  normalizeOutboundEmailText,
  plainTextToEmailHtml,
} from "@/lib/email-text";
import {
  getMicrosoftGraphConfig,
  type MicrosoftGraphConfig,
} from "@/lib/mailbox";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

type TokenCache = { key: string; accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export type OutlookMessage = {
  id: string;
  internetMessageId?: string | null;
  subject?: string | null;
  from?: { emailAddress?: { name?: string | null; address?: string | null } | null } | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  receivedDateTime?: string | null;
  isRead?: boolean | null;
  isDraft?: boolean | null;
  hasAttachments?: boolean | null;
  internetMessageHeaders?: Array<{ name?: string | null; value?: string | null }> | null;
};

export type OutlookSendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
};

function requireGraphConfig(): MicrosoftGraphConfig {
  const config = getMicrosoftGraphConfig();
  if (!config) {
    throw new Error(
      "Outlook Graph is not configured. Set MAILBOX_USER, MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET."
    );
  }
  return config;
}

function graphErrorMessage(payload: unknown, status: number): string {
  if (status === 403) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: { message?: string } }).error?.message
        : "";
    return (
      "Outlook mailbox access is denied. In Azure Portal open this app → API permissions → add Microsoft Graph application permissions Mail.ReadWrite and Mail.Send, then click Grant admin consent." +
      (detail ? ` Microsoft said: ${detail}` : "")
    );
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as { error?: { code?: string; message?: string } }).error;
    const code = err?.code ? `${err.code}: ` : "";
    const message = err?.message || JSON.stringify(payload);
    return `Microsoft Graph ${status} ${code}${message}`;
  }
  return `Microsoft Graph request failed (${status})`;
}

async function getAccessToken(config: MicrosoftGraphConfig): Promise<string> {
  const cacheKey = `${config.tenantId}|${config.clientId}|${config.mailbox}`;
  if (
    tokenCache &&
    tokenCache.key === cacheKey &&
    tokenCache.expiresAt > Date.now() + 30_000
  ) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(TOKEN_URL(config.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Microsoft login failed (${res.status}). Check MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET.`
    );
  }

  tokenCache = {
    key: cacheKey,
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in || 3600)) * 1000,
  };
  return tokenCache.accessToken;
}

async function graphFetch(
  config: MicrosoftGraphConfig,
  path: string,
  init?: RequestInit & { rawBody?: BodyInit | null }
): Promise<Response> {
  const token = await getAccessToken(config);
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const { rawBody, headers: initHeaders, body, ...rest } = init || {};
  const headers = new Headers(initHeaders);
  headers.set("Authorization", `Bearer ${token}`);
  const requestBody = rawBody !== undefined ? rawBody : body;
  if (!headers.has("Content-Type") && requestBody && rawBody === undefined) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...rest,
    headers,
    body: requestBody,
  });
}

async function graphJson<T>(
  config: MicrosoftGraphConfig,
  path: string,
  init?: RequestInit & { rawBody?: BodyInit | null }
): Promise<T> {
  const res = await graphFetch(config, path, init);
  if (res.status === 202 || res.status === 204) {
    return undefined as T;
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new Error(graphErrorMessage(json, res.status));
  }
  return json as T;
}

function mailboxPath(mailbox: string, suffix: string): string {
  return `/users/${encodeURIComponent(mailbox)}${suffix}`;
}

const MESSAGE_SELECT = [
  "id",
  "internetMessageId",
  "subject",
  "from",
  "body",
  "receivedDateTime",
  "isRead",
  "isDraft",
  "hasAttachments",
  "internetMessageHeaders",
].join(",");

function headerValue(msg: OutlookMessage, name: string): string {
  const needle = name.toLowerCase();
  for (const header of msg.internetMessageHeaders || []) {
    if ((header.name || "").toLowerCase() === needle) {
      return (header.value || "").trim();
    }
  }
  return "";
}

export function outlookMessageToParsedMail(msg: OutlookMessage): ParsedMail {
  const address = msg.from?.emailAddress?.address?.trim() || "";
  const name = msg.from?.emailAddress?.name?.trim() || "";
  const fromText = name && address ? `"${name}" <${address}>` : address || name;
  const content = msg.body?.content || "";
  const isHtml = (msg.body?.contentType || "").toLowerCase() === "html";
  const inReplyTo = headerValue(msg, "In-Reply-To");
  const referencesRaw = headerValue(msg, "References");
  const references = referencesRaw
    ? referencesRaw.split(/\s+/).filter(Boolean)
    : [];

  // Preserve bulk/promo headers so inbox ingest can skip non-RFQ mail.
  const headers = new Map<string, string>();
  for (const header of msg.internetMessageHeaders || []) {
    const key = (header.name || "").trim().toLowerCase();
    const value = (header.value || "").trim();
    if (!key || !value) continue;
    if (
      key === "list-unsubscribe" ||
      key === "precedence" ||
      key === "auto-submitted" ||
      key === "x-campaign" ||
      key === "x-campaign-id" ||
      key === "x-mailgun-campaign-id" ||
      key === "x-sg-eid" ||
      key === "in-reply-to" ||
      key === "references"
    ) {
      headers.set(key, value);
    }
  }

  return {
    messageId: (msg.internetMessageId || msg.id || "").trim(),
    subject: msg.subject || "",
    from: {
      text: fromText,
      value: address ? [{ name, address }] : [],
    },
    inReplyTo: inReplyTo || undefined,
    references,
    text: isHtml ? "" : content,
    html: isHtml ? content : "",
    attachments: [],
    headers,
    headerLines: [],
  } as unknown as ParsedMail;
}

export async function listOutlookInboxMessages(input?: {
  unreadOnly?: boolean;
  since?: Date | null;
  top?: number;
}): Promise<OutlookMessage[]> {
  const config = requireGraphConfig();
  const top = Math.min(Math.max(input?.top ?? 20, 1), 50);
  const filters: string[] = ["isDraft eq false"];
  if (input?.unreadOnly !== false) filters.push("isRead eq false");
  if (input?.since) {
    filters.push(`receivedDateTime gt ${input.since.toISOString()}`);
  }

  const tryList = async (filter: string, orderby?: string) => {
    const params = new URLSearchParams({
      $filter: filter,
      $top: String(top),
      $select: MESSAGE_SELECT,
    });
    if (orderby) params.set("$orderby", orderby);
    return graphJson<{ value?: OutlookMessage[] }>(
      config,
      mailboxPath(config.mailbox, `/mailFolders/inbox/messages?${params}`)
    );
  };

  const primary = filters.join(" and ");
  let data: { value?: OutlookMessage[] };
  try {
    data = await tryList(primary, "receivedDateTime asc");
  } catch {
    data = await tryList(primary);
  }
  const rows = (data.value || []).filter((msg) => !msg.isDraft);
  rows.sort((a, b) =>
    String(a.receivedDateTime || "").localeCompare(String(b.receivedDateTime || ""))
  );
  return rows;
}

export async function getLatestInboxReceivedAt(): Promise<Date | null> {
  const config = requireGraphConfig();
  const params = new URLSearchParams({
    $orderby: "receivedDateTime desc",
    $top: "1",
    $select: "id,receivedDateTime",
  });
  const data = await graphJson<{ value?: OutlookMessage[] }>(
    config,
    mailboxPath(config.mailbox, `/mailFolders/inbox/messages?${params}`)
  );
  const iso = data.value?.[0]?.receivedDateTime;
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function searchOutlookMessages(queries: string[]): Promise<OutlookMessage[]> {
  const config = requireGraphConfig();
  const byId = new Map<string, OutlookMessage>();

  for (const raw of queries) {
    const query = raw.replace(/"/g, "").trim();
    if (!query) continue;
    const params = new URLSearchParams({
      $search: `"${query}"`,
      $top: "40",
      $select: MESSAGE_SELECT,
    });
    try {
      const data = await graphJson<{ value?: OutlookMessage[] }>(config, mailboxPath(
        config.mailbox,
        `/messages?${params}`
      ), {
        headers: { ConsistencyLevel: "eventual" },
      });
      for (const msg of data.value || []) {
        if (msg.id && !msg.isDraft) byId.set(msg.id, msg);
      }
    } catch {
      // One query failing (syntax / no hits) should not abort the rest.
    }
  }

  return [...byId.values()];
}

export async function markOutlookMessageRead(id: string): Promise<void> {
  if (!id) return;
  const config = requireGraphConfig();
  await graphJson(
    config,
    mailboxPath(config.mailbox, `/messages/${encodeURIComponent(id)}`),
    {
      method: "PATCH",
      body: JSON.stringify({ isRead: true }),
    }
  );
}

export async function listOutlookAttachmentNames(
  messageId: string
): Promise<Array<{ name: string; contentType?: string }>> {
  if (!messageId) return [];
  const config = requireGraphConfig();
  try {
    const data = await graphJson<{
      value?: Array<{ name?: string; contentType?: string }>;
    }>(
      config,
      mailboxPath(
        config.mailbox,
        `/messages/${encodeURIComponent(messageId)}/attachments?$select=name,contentType`
      )
    );
    return (data.value || []).map((attachment) => ({
      name: attachment.name || "attachment",
      contentType: attachment.contentType,
    }));
  } catch {
    return [];
  }
}

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

function prepareOutlookContent(input: OutlookSendInput) {
  const text = normalizeOutboundEmailText(input.text);
  const html = input.html
    ? normalizeOutboundEmailText(input.html)
    : plainTextToEmailHtml(text);
  const subject = normalizeOutboundEmailText(input.subject);
  return { text, html, subject };
}

/** Send via Graph using a MIME payload so Message-ID / In-Reply-To stay intact. */
export async function sendOutlookEmail(
  input: OutlookSendInput
): Promise<{ messageId: string }> {
  const config = requireGraphConfig();
  const domain = config.mailbox.split("@")[1] || "tinfotech.com";
  const messageId = `<${randomUUID()}@${domain}>`;
  const company = process.env.COMPANY_NAME?.trim() || "QuoteFlow";
  const prepared = prepareOutlookContent(input);
  const needsMimeThreading = Boolean(input.inReplyTo || input.references);

  // New outbound mail: JSON HTML path avoids quoted-printable MIME glitches.
  if (!needsMimeThreading && !(input.attachments && input.attachments.length > 0)) {
    try {
      return await sendOutlookEmailJson(config, {
        ...input,
        ...prepared,
      }, messageId);
    } catch {
      // Fall through to MIME if JSON send is blocked on the tenant.
    }
  }

  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });

  const compiled = await transport.sendMail({
    from: `"${company}" <${config.mailbox}>`,
    to: input.to,
    replyTo: input.replyTo || config.mailbox,
    subject: prepared.subject,
    text: prepared.text,
    html: prepared.html,
    textEncoding: "base64",
    messageId,
    inReplyTo: input.inReplyTo ? toAngleAddr(input.inReplyTo) : undefined,
    references: input.references
      ? toReferencesHeader(input.references)
      : undefined,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  const raw = compiled.message;
  if (!Buffer.isBuffer(raw) && typeof raw !== "string") {
    throw new Error("Failed to build Outlook MIME message.");
  }
  const mime = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

  const res = await graphFetch(
    config,
    mailboxPath(config.mailbox, "/sendMail"),
    {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      rawBody: mime.toString("base64"),
    }
  );

  if (!res.ok && res.status !== 202) {
    const json = await res.json().catch(() => null);
    // Fallback: JSON draft + send if MIME upload is blocked on the tenant.
    if (res.status === 400 || res.status === 415) {
      return sendOutlookEmailJson(
        config,
        { ...input, ...prepared },
        messageId
      );
    }
    throw new Error(graphErrorMessage(json, res.status));
  }

  return { messageId: messageId.replace(/[<>]/g, "") };
}

async function sendOutlookEmailJson(
  config: MicrosoftGraphConfig,
  input: OutlookSendInput,
  preferredMessageId: string
): Promise<{ messageId: string }> {
  const prepared = prepareOutlookContent(input);
  await graphJson(
    config,
    mailboxPath(config.mailbox, "/sendMail"),
    {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: prepared.subject,
          body: {
            contentType: "HTML",
            content: prepared.html,
          },
          toRecipients: input.to
            .split(/[,;]/)
            .map((address) => address.trim())
            .filter(Boolean)
            .map((address) => ({ emailAddress: { address } })),
          replyTo: [
            { emailAddress: { address: input.replyTo || config.mailbox } },
          ],
          attachments: input.attachments?.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.contentType || "application/octet-stream",
            contentBytes: a.content.toString("base64"),
          })),
        },
        saveToSentItems: true,
      }),
    }
  );

  return { messageId: preferredMessageId.replace(/[<>]/g, "") };
}
