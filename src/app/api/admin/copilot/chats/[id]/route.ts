import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { canUseAdminCopilot } from "@/lib/ai/admin-copilot";
import { deleteCopilotChat, getCopilotChat, messagePayloadToTurn } from "@/lib/ai/copilot-chats";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId } = requireUserId(session);

  const allowed = await canUseAdminCopilot(userId ?? undefined);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const chat = await getCopilotChat(id, userId ?? undefined);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt.toISOString(),
    messages: chat.messages.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      ...(m.role === "assistant" ? messagePayloadToTurn(m.payload) : {}),
    })),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId } = requireUserId(session);

  const allowed = await canUseAdminCopilot(userId ?? undefined);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const ok = await deleteCopilotChat(id, userId ?? undefined);
  if (!ok) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
