import { getMembershipForUser, userHasPermission } from "@/lib/accounting/context";
import { ADMIN_TOOL_DEFINITIONS, executeAdminTool } from "@/lib/ai/admin-tools";

export type CopilotMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CopilotFigure = {
  label: string;
  value: string;
};

export type CopilotSection = {
  title: string;
  bullets: string[];
};

export type CopilotResult = {
  answer: string;
  headline: string;
  figures: CopilotFigure[];
  sections: CopilotSection[];
  missing: string[];
  sources: string[];
};

export type CopilotProgress = {
  message: string;
};

const TOOL_THINKING: Record<string, string> = {
  assistance_queue: "Checking quotes that need a human reply",
  quote_lookup: "Looking up quote details",
  invoice_lookup: "Looking up invoice details",
  quote_stats: "Counting quotes by status",
  quote_list: "Listing matching quotes",
  trial_balance: "Pulling the trial balance",
  ar_ageing: "Checking receivables ageing",
  stock_balances: "Checking stock balances",
  gst_summary: "Summarising GST from the books",
  draft_quote_email: "Drafting a follow-up email",
  send_quote_email: "Sending the follow-up email",
};

function toolThinkingLabel(name: string): string {
  return TOOL_THINKING[name] || `Looking up ${name.replace(/_/g, " ")}`;
}

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

const SYSTEM = `You are QuoteFlow Admin Copilot. You answer the company owner/admin using ONLY live tool results.

Rules:
- Never invent figures, counts, dates, GST, stock, or invoice balances.
- If a tool returns found:false, empty rows, or an error, put that in "missing" — do not guess.
- Money is INR. Use Indian grouping, e.g. ₹1,584. Repeat exact numbers from tools.
- You may call multiple tools first. After tools return, you MUST answer as JSON only (no markdown).
- Do not post invoices or change accounting records.

Email (allowed, with care):
- "Write/draft an email" → call draft_quote_email. Show the suggested body. Do NOT send.
- "Send the email" / "email the buyer" / "send this" → call send_quote_email with confirm=true and the full body.
- Never call send_quote_email unless the admin clearly asked to send.
- Only quote follow-ups to the quote's buyerEmail. Do not invent recipients.

Quote data (critical — this caused wrong answers before):
- quote_stats returns COUNTS only (e.g. UNDER_NEGOTIATION: 2). It is not a list.
- quote_list returns the actual quotes (number, buyer, total, status). Use it for "list / details / which quotes".
- assistance_queue is ONLY needsAssistance=true (human must reply). It is NOT the same as status UNDER_NEGOTIATION.
- If quote_stats shows a status count > 0, you MUST call quote_list with that status before saying there are none.
- "Under negotiation" means status UNDER_NEGOTIATION. Call quote_list with status "UNDER_NEGOTIATION".

Final answer JSON shape:
{
  "headline": "one sentence that answers the question",
  "figures": [{ "label": "short label", "value": "₹1,584" }],
  "sections": [{ "title": "Q-2026-0017", "bullets": ["Status: SENT", "Buyer: Acme"] }],
  "missing": ["optional gaps if data is not in the books"],
  "answer": "plain-text fallback of the same content, short paragraphs + bullets"
}

Formatting:
- headline: the takeaway, not a preamble.
- figures: 2–6 KPI tiles for the numbers that matter (omit if none).
- sections: one section per quote when listing (title = quote number). Max 8 sections, max 6 bullets each.
- missing: only when a requested fact is absent.
- Prefer tables-as-bullets: "Label: value".`;

const FORMAT_HINT = `Return ONLY the JSON object described in the system prompt. No markdown fences.`;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseStructuredAnswer(text: string, sources: string[]): CopilotResult {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const answer = text.trim() || "I could not produce an answer from the books.";
    return {
      answer,
      headline: "",
      figures: [],
      sections: [],
      missing: [],
      sources,
    };
  }
  const headline =
    typeof parsed?.headline === "string" && parsed.headline.trim()
      ? parsed.headline.trim()
      : "";
  const figures: CopilotFigure[] = [];
  if (Array.isArray(parsed?.figures)) {
    for (const row of parsed.figures) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const label = typeof r.label === "string" ? r.label.trim() : "";
      const value = typeof r.value === "string" ? r.value.trim() : "";
      if (label && value) figures.push({ label, value });
    }
  }
  const sections: CopilotSection[] = [];
  if (Array.isArray(parsed?.sections)) {
    for (const row of parsed.sections) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title.trim() : "";
      const bullets = asStringArray(r.bullets).slice(0, 8);
      if (title && bullets.length) sections.push({ title, bullets });
    }
  }
  const missing = asStringArray(parsed?.missing).slice(0, 6);
  const answer =
    (typeof parsed?.answer === "string" && parsed.answer.trim()) ||
    headline ||
    text.trim() ||
    "I could not produce an answer from the books.";

  return {
    answer,
    headline: headline || answer.split("\n")[0]?.slice(0, 180) || "Result",
    figures: figures.slice(0, 8),
    sections: sections.slice(0, 8),
    missing,
    sources,
  };
}

export async function canUseAdminCopilot(userId?: string): Promise<boolean> {
  if (!userId) return true;
  const membership = await getMembershipForUser(userId);
  if (!membership) return true;
  return userHasPermission(userId, "reports.read");
}

export async function runAdminCopilot(
  messages: CopilotMessage[],
  options?: { userId?: string; onProgress?: (event: CopilotProgress) => void }
): Promise<CopilotResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copilot cannot look up live numbers without it."
    );
  }

  const notify = (message: string) => options?.onProgress?.({ message });
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const sources = new Set<string>();
  const conversation: OpenAiMessage[] = [
    { role: "system", content: SYSTEM },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  notify("Reading your question");

  const maxRounds = 3;
  for (let round = 0; round < maxRounds; round += 1) {
    notify(round === 0 ? "Planning lookups from the books" : "Checking more records");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "QuoteFlow Admin Copilot",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        tools: ADMIN_TOOL_DEFINITIONS,
        messages: conversation,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: OpenAiMessage }>;
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("Copilot returned an empty response.");

    const toolCalls = message.tool_calls ?? [];
    if (!toolCalls.length) {
      notify("Writing the answer");
      return parseStructuredAnswer(message.content || "", [...sources]);
    }

    conversation.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      notify(toolThinkingLabel(call.function.name));
      const result = await executeAdminTool(call.function.name, call.function.arguments || "{}", {
        userId: options?.userId,
      });
      if (result.source) sources.add(result.source);
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    notify("Reading what came back from the books");
  }

  notify("Writing the answer");
  const fallback = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "QuoteFlow Admin Copilot",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [...conversation, { role: "user", content: FORMAT_HINT }],
    }),
  });

  if (!fallback.ok) {
    return {
      answer: "Looked up the books but could not format a final answer. Try asking again.",
      headline: "Could not format the answer",
      figures: [],
      sections: [],
      missing: ["The model returned an incomplete response after looking up the books."],
      sources: [...sources],
    };
  }
  const finalData = (await fallback.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseStructuredAnswer(finalData.choices?.[0]?.message?.content || "", [...sources]);
}
