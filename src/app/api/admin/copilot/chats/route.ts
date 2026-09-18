import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { canUseAdminCopilot } from "@/lib/ai/admin-copilot";
import { listCopilotChats } from "@/lib/ai/copilot-chats";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId } = requireUserId(session);

  const allowed = await canUseAdminCopilot(userId ?? undefined);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chats = await listCopilotChats(userId ?? undefined);
  return NextResponse.json(
    chats.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      messageCount: c._count.messages,
    }))
  );
}
