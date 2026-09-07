const REDUCTO_BASE = "https://platform.reducto.ai";

/** Max upload size for app intake (bytes). */
export const REDUCTO_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".heic",
  ".gif",
  ".bmp",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
]);

export function getReductoApiKey(): string {
  const key = process.env.REDUCTO_API_KEY?.trim();
  if (!key) {
    throw new Error("REDUCTO_API_KEY is not configured");
  }
  return key;
}

export function assertAllowedDocument(filename: string, size: number): void {
  if (size <= 0) throw new Error("File is empty");
  if (size > REDUCTO_MAX_BYTES) {
    throw new Error(`File is too large (max ${REDUCTO_MAX_BYTES / (1024 * 1024)}MB)`);
  }
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      "Unsupported file type. Use PDF, image (PNG/JPG/WEBP/TIFF/HEIC), or DOCX."
    );
  }
}

type ParseChunk = { content?: string };

type ParseResultBody =
  | { type: "full"; chunks?: ParseChunk[] }
  | { type: "url"; url?: string; chunks?: ParseChunk[] }
  | { chunks?: ParseChunk[] };

type ParseResponse = {
  result?: ParseResultBody;
  job_id?: string;
  error?: string;
  message?: string;
};

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Upload a local file buffer to Reducto. Returns a `reducto://…` file_id.
 */
export async function uploadFile(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = getReductoApiKey();
  assertAllowedDocument(filename, buffer.byteLength);

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)]),
    filename || "document.pdf"
  );

  const res = await fetch(`${REDUCTO_BASE}/upload`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Reducto upload failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as { file_id?: string };
  if (!data.file_id) {
    throw new Error("Reducto upload returned no file_id");
  }
  return data.file_id;
}

async function chunksFromParseResult(result: ParseResultBody): Promise<ParseChunk[]> {
  if ("type" in result && result.type === "url" && "url" in result && result.url) {
    const res = await fetch(result.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch Reducto parse URL result (${res.status})`);
    }
    const body = (await res.json()) as { chunks?: ParseChunk[] } | ParseChunk[];
    if (Array.isArray(body)) return body;
    return body.chunks || [];
  }
  return result.chunks || [];
}

/**
 * Parse an uploaded Reducto file (or public URL) into plain text.
 */
export async function parseDocument(input: string): Promise<string> {
  const apiKey = getReductoApiKey();

  const res = await fetch(`${REDUCTO_BASE}/parse`, {
    method: "POST",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Reducto parse failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as ParseResponse;
  if (!data.result) {
    throw new Error(
      data.error || data.message || "Reducto parse returned no result"
    );
  }

  const chunks = await chunksFromParseResult(data.result);
  const text = chunks
    .map((c) => (typeof c.content === "string" ? c.content.trim() : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) {
    throw new Error("No text could be extracted from the document");
  }

  return text;
}

/**
 * Upload + parse a document buffer into OCR/plain text.
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  filename: string
): Promise<{ fileId: string; text: string }> {
  const fileId = await uploadFile(buffer, filename);
  const text = await parseDocument(fileId);
  return { fileId, text };
}

export type QuoteLineExtract = {
  productName: string;
  model: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type QuoteDocExtract = {
  company: string;
  contactName: string;
  productName: string;
  model: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineItems: QuoteLineExtract[];
};

const QUOTE_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    company: {
      type: "string",
      description: "Buyer, customer, or requesting company name",
    },
    contactName: {
      type: "string",
      description: "Contact person name if present",
    },
    productName: {
      type: "string",
      description: "Primary product or item name requested",
    },
    model: {
      type: "string",
      description: "Model number, SKU, or part code if present",
    },
    quantity: {
      type: "number",
      description: "Quantity requested for the primary product",
    },
    unit: {
      type: "string",
      description: "Unit of measure such as pcs, kg, tonne, box",
    },
    unitPrice: {
      type: "number",
      description: "Unit price or rate if shown (numeric, no currency symbol)",
    },
    lineItems: {
      type: "array",
      description: "All line items if the document lists multiple products",
      items: {
        type: "object",
        properties: {
          productName: { type: "string", description: "Product or item name" },
          model: { type: "string", description: "Model / SKU if present" },
          quantity: { type: "number", description: "Quantity" },
          unit: { type: "string", description: "Unit of measure" },
          unitPrice: { type: "number", description: "Unit price if shown" },
        },
      },
    },
  },
} as const;

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v && typeof v === "object" && "value" in v) {
    return asString((v as { value: unknown }).value);
  }
  return "";
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof v === "object" && "value" in v) {
    return asNumber((v as { value: unknown }).value);
  }
  return 0;
}

function normalizeLine(raw: Record<string, unknown>): QuoteLineExtract {
  return {
    productName: asString(raw.productName),
    model: asString(raw.model),
    quantity: asNumber(raw.quantity) || 1,
    unit: asString(raw.unit) || "pcs",
    unitPrice: Math.max(0, asNumber(raw.unitPrice)),
  };
}

function normalizeExtract(raw: Record<string, unknown>): QuoteDocExtract {
  const lineItemsRaw = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  const lineItems = lineItemsRaw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map(normalizeLine)
    .filter((l) => l.productName || l.model || l.unitPrice > 0);

  const productName = asString(raw.productName);
  const model = asString(raw.model);
  const quantity = asNumber(raw.quantity) || 1;
  const unit = asString(raw.unit) || "pcs";
  const unitPrice = Math.max(0, asNumber(raw.unitPrice));

  const lines =
    lineItems.length > 0
      ? lineItems
      : productName || model || unitPrice > 0
        ? [{ productName, model, quantity, unit, unitPrice }]
        : [];

  return {
    company: asString(raw.company),
    contactName: asString(raw.contactName),
    productName: productName || lines[0]?.productName || "",
    model: model || lines[0]?.model || "",
    quantity: lines[0]?.quantity ?? quantity,
    unit: lines[0]?.unit ?? unit,
    unitPrice: lines[0]?.unitPrice ?? unitPrice,
    lineItems: lines,
  };
}

/**
 * Upload a document and extract quote fields (product, model, company, qty, price).
 */
export async function extractQuoteFieldsFromDocument(
  buffer: Buffer,
  filename: string
): Promise<{ fileId: string; fields: QuoteDocExtract }> {
  const apiKey = getReductoApiKey();
  const fileId = await uploadFile(buffer, filename);

  const res = await fetch(`${REDUCTO_BASE}/extract`, {
    method: "POST",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: fileId,
      instructions: {
        schema: QUOTE_EXTRACT_SCHEMA,
        system_prompt:
          "Extract purchase / RFQ / quotation fields from this document or photo. Prefer explicit values; leave fields empty rather than guessing prices.",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Reducto extract failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    result?: unknown;
    error?: string;
    message?: string;
  };

  let raw: Record<string, unknown> = {};
  if (Array.isArray(data.result) && data.result[0] && typeof data.result[0] === "object") {
    raw = data.result[0] as Record<string, unknown>;
  } else if (data.result && typeof data.result === "object" && !Array.isArray(data.result)) {
    raw = data.result as Record<string, unknown>;
  } else if (data.error || data.message) {
    throw new Error(data.error || data.message || "Reducto extract failed");
  }

  const fields = normalizeExtract(raw);
  if (fields.lineItems.length === 0) {
    throw new Error(
      "Could not find product name, model, quantity, or price in the document"
    );
  }

  return { fileId, fields };
}
