import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { canUseAdminCopilot, runAdminCopilot } from "@/lib/ai/admin-copilot";
import { appendCopilotTurn } from "@/lib/ai/copilot-chats";

const bodySchema = z.object({
  chatId: z.string().nullish(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(40),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId } = requireUserId(session);

  const allowed = await canUseAdminCopilot(userId ?? undefined);
  if (!allowed) {
    return NextResponse.json({ error: "Copilot is limited to owner/admin reports access." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid copilot request. Send at least one user message." },
      { status: 400 }
    );
  }

  const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const result = await runAdminCopilot(
          parsed.data.messages.map((m) => ({
            role: m.role,
            content: m.content.slice(0, 4000),
          })),
          {
            userId: userId ?? undefined,
            onProgress: (event) => send({ type: "thinking", message: event.message }),
          }
        );

        const saved = await appendCopilotTurn({
          chatId: parsed.data.chatId ?? undefined,
          userId: userId ?? undefined,
          userContent: lastUser.content,
          assistant: result,
        });

        send({ type: "done", ...result, chatId: saved.chatId, title: saved.title });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Copilot failed";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
