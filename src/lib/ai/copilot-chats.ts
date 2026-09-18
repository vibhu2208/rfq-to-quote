import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CopilotResult } from "@/lib/ai/admin-copilot";

function chatTitleFromText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length > 72 ? `${compact.slice(0, 69)}…` : compact;
}

export async function listCopilotChats(userId?: string) {
  if (!userId) return [];
  return prisma.copilotChat.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getCopilotChat(chatId: string, userId?: string) {
  if (!userId) return null;
  const chat = await prisma.copilotChat.findFirst({
    where: {
      id: chatId,
      userId,
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  return chat;
}

export async function deleteCopilotChat(chatId: string, userId?: string) {
  if (!userId) return false;
  const existing = await prisma.copilotChat.findFirst({
    where: {
      id: chatId,
      userId,
    },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.copilotChat.delete({ where: { id: chatId } });
  return true;
}

export async function appendCopilotTurn(input: {
  chatId?: string;
  userId?: string;
  userContent: string;
  assistant: CopilotResult;
}): Promise<{ chatId: string; title: string }> {
  const title = chatTitleFromText(input.userContent);
  if (!input.userId) {
    return { chatId: input.chatId?.trim() || "", title };
  }

  const payload = {
    headline: input.assistant.headline,
    figures: input.assistant.figures,
    sections: input.assistant.sections,
    missing: input.assistant.missing,
    sources: input.assistant.sources,
    answer: input.assistant.answer,
  } satisfies Prisma.InputJsonObject;

  let chatId = input.chatId?.trim() || "";
  if (chatId) {
    const existing = await prisma.copilotChat.findFirst({
      where: { id: chatId, userId: input.userId },
      select: { id: true },
    });
    if (!existing) chatId = "";
  }

  if (!chatId) {
    const created = await prisma.copilotChat.create({
      data: {
        userId: input.userId,
        title,
      },
    });
    chatId = created.id;
  }

  await prisma.$transaction([
    prisma.copilotChatMessage.create({
      data: {
        chatId,
        role: "user",
        content: input.userContent.slice(0, 8000),
      },
    }),
    prisma.copilotChatMessage.create({
      data: {
        chatId,
        role: "assistant",
        content: input.assistant.answer.slice(0, 12000),
        payload,
      },
    }),
    prisma.copilotChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    }),
  ]);

  const chat = await prisma.copilotChat.findUnique({
    where: { id: chatId },
    select: { title: true },
  });
  return { chatId, title: chat?.title || title };
}

export function messagePayloadToTurn(payload: unknown): {
  headline?: string;
  figures?: CopilotResult["figures"];
  sections?: CopilotResult["sections"];
  missing?: string[];
  sources?: string[];
} {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as Record<string, unknown>;
  const figures = Array.isArray(p.figures)
    ? p.figures.filter(
        (f): f is CopilotResult["figures"][number] =>
          Boolean(f) &&
          typeof f === "object" &&
          typeof (f as { label?: unknown }).label === "string" &&
          typeof (f as { value?: unknown }).value === "string"
      )
    : undefined;
  const sections = Array.isArray(p.sections)
    ? p.sections.filter(
        (s): s is CopilotResult["sections"][number] =>
          Boolean(s) &&
          typeof s === "object" &&
          typeof (s as { title?: unknown }).title === "string" &&
          Array.isArray((s as { bullets?: unknown }).bullets)
      )
    : undefined;
  return {
    headline: typeof p.headline === "string" ? p.headline : undefined,
    figures,
    sections,
    missing: Array.isArray(p.missing)
      ? p.missing.filter((v): v is string => typeof v === "string")
      : undefined,
    sources: Array.isArray(p.sources)
      ? p.sources.filter((v): v is string => typeof v === "string")
      : undefined,
  };
}
