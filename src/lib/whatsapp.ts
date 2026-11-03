export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiBase: string;
};

export type WhatsAppInboundMessage = {
  messageId: string;
  from: string;
  name: string;
  text: string;
  timestamp: string;
};

export type WhatsAppSendResult = {
  messageId: string;
  to: string;
};

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

const DEFAULT_API_BASE = "https://graph.facebook.com/v21.0";
const DOCUMENT_CAPTION_LIMIT = 1024;

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.WHATSAPP_TOKEN?.trim() ||
    "";
  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.WHATSAPP_PHONE_ID?.trim() ||
    "";
  const apiBase = (
    process.env.WHATSAPP_API_BASE?.trim() || DEFAULT_API_BASE
  ).replace(/\/+$/, "");
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId, apiBase };
}

export function requireWhatsAppConfig(): WhatsAppConfig {
  const config = getWhatsAppConfig();
  if (!config) {
    throw new Error(
      "WhatsApp is not fully configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID (from the iDiary / Meta WhatsApp dashboard)."
    );
  }
  return config;
}

export function normalizeWhatsAppNumber(
  raw: string,
  defaultCountry = process.env.WHATSAPP_DEFAULT_COUNTRY?.trim() || "91"
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Enter a valid WhatsApp number with country code, e.g. +919876543210.");
  }

  let digits = trimmed.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Local Indian numbers are often typed as 0XXXXXXXXXX.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && defaultCountry) {
    digits = `${defaultCountry}${digits}`;
  }
  if (digits.length < 11 || digits.length > 15) {
    throw new Error(
      "Enter a valid WhatsApp number with country code, e.g. +919876543210."
    );
  }
  return digits;
}

export function whatsappQuoteCaption(input: {
  quoteNumber: string;
  grandTotalLabel: string;
  threadRef: string;
  extra?: string;
}): string {
  const parts = [
    `Please find quotation ${input.quoteNumber}.`,
    `Grand total: ${input.grandTotalLabel}.`,
    `Reference: [${input.threadRef}]`,
  ];
  if (input.extra?.trim()) parts.push(input.extra.trim());
  const text = parts.join(" ");
  return text.length <= DOCUMENT_CAPTION_LIMIT
    ? text
    : `${text.slice(0, DOCUMENT_CAPTION_LIMIT - 1)}…`;
}

export function extractWhatsAppInboundMessages(
  payload: unknown
): WhatsAppInboundMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<Record<string, unknown>>;
        };
      }>;
    }>;
  };
  if (root.object && root.object !== "whatsapp_business_account") return [];

  const out: WhatsAppInboundMessage[] = [];
  for (const entry of root.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const names = new Map<string, string>();
      for (const contact of value.contacts || []) {
        if (contact.wa_id) {
          names.set(contact.wa_id, contact.profile?.name?.trim() || "");
        }
      }
      for (const message of value.messages) {
        const inbound = normalizeInboundMessage(message, names);
        if (inbound) out.push(inbound);
      }
    }
  }
  return out;
}

function normalizeInboundMessage(
  message: Record<string, unknown>,
  names: Map<string, string>
): WhatsAppInboundMessage | null {
  const type = String(message.type || "");
  if (!type || type === "system" || type === "reaction") return null;
  const from = String(message.from || "").replace(/[^\d]/g, "");
  const messageId = String(message.id || "").trim();
  if (!from || !messageId) return null;

  const text = inboundText(type, message);
  if (!text) return null;

  return {
    messageId,
    from,
    name: names.get(from) || "",
    text,
    timestamp: String(message.timestamp || ""),
  };
}

function inboundText(type: string, message: Record<string, unknown>): string {
  if (type === "text") {
    const text = message.text as { body?: string } | undefined;
    return (text?.body || "").trim();
  }
  if (type === "image" || type === "document" || type === "video") {
    const media = message[type] as { caption?: string } | undefined;
    return (media?.caption || `[WhatsApp ${type} received]`).trim();
  }
  if (type === "button") {
    const button = message.button as { text?: string } | undefined;
    return (button?.text || "").trim();
  }
  if (type === "interactive") {
    const interactive = message.interactive as {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    } | undefined;
    return (
      interactive?.button_reply?.title ||
      interactive?.list_reply?.title ||
      ""
    ).trim();
  }
  return "";
}

function graphError(payload: GraphErrorBody | null, status: number): string {
  const code = payload?.error?.code;
  const message = payload?.error?.message || "";
  if (code === 190 || /expired|session has expired/i.test(message)) {
    return "WhatsApp access token expired. Open https://whatsapp.idiary.in, generate a new access token, and update WHATSAPP_ACCESS_TOKEN.";
  }
  if (status === 401 || status === 403) {
    return (
      message ||
      "WhatsApp API denied the request. Check WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID."
    );
  }
  return message || `WhatsApp API request failed (${status}).`;
}

async function whatsappJson<T>(
  config: WhatsAppConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith("http") ? path : `${config.apiBase}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${config.accessToken}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });
  const json = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;
  if (!res.ok) {
    throw new Error(graphError(json, res.status));
  }
  if (!json) {
    throw new Error(`WhatsApp API returned an empty response (${res.status}).`);
  }
  return json;
}

async function uploadWhatsAppMedia(input: {
  filename: string;
  content: Buffer;
  contentType: string;
}): Promise<string> {
  const config = requireWhatsAppConfig();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", input.contentType);
  form.append(
    "file",
    new Blob([new Uint8Array(input.content)], { type: input.contentType }),
    input.filename
  );

  const json = await whatsappJson<{ id?: string }>(
    config,
    `/${config.phoneNumberId}/media`,
    { method: "POST", body: form }
  );
  if (!json.id) {
    throw new Error("WhatsApp accepted the file but did not return a media id.");
  }
  return json.id;
}

export async function sendWhatsAppText(input: {
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  const config = requireWhatsAppConfig();
  const to = normalizeWhatsAppNumber(input.to);
  const json = await whatsappJson<{ messages?: Array<{ id?: string }> }>(
    config,
    `/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: input.body.slice(0, 4096) },
      }),
    }
  );
  const messageId = json.messages?.[0]?.id || "";
  if (!messageId) {
    throw new Error("WhatsApp send succeeded but no message id was returned.");
  }
  return { messageId, to };
}

export async function sendWhatsAppDocument(input: {
  to: string;
  filename: string;
  content: Buffer;
  contentType?: string;
  caption?: string;
}): Promise<WhatsAppSendResult> {
  const config = requireWhatsAppConfig();
  const to = normalizeWhatsAppNumber(input.to);
  const mediaId = await uploadWhatsAppMedia({
    filename: input.filename,
    content: input.content,
    contentType: input.contentType || "application/pdf",
  });
  const caption = (input.caption || "").slice(0, DOCUMENT_CAPTION_LIMIT);
  const json = await whatsappJson<{ messages?: Array<{ id?: string }> }>(
    config,
    `/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "document",
        document: {
          id: mediaId,
          filename: input.filename,
          ...(caption ? { caption } : {}),
        },
      }),
    }
  );
  const messageId = json.messages?.[0]?.id || "";
  if (!messageId) {
    throw new Error("WhatsApp send succeeded but no message id was returned.");
  }
  return { messageId, to };
}
