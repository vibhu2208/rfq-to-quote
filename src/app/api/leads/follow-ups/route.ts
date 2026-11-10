import { NextRequest, NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { requireSession } from "@/lib/api";
import { listFollowUps, refreshOverdueFollowUps } from "@/lib/leads/follow-ups";

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  await refreshOverdueFollowUps();

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "all";
  const mine = searchParams.get("mine") === "1";
  const now = new Date();

  let dueAfter: Date | undefined;
  let dueBefore: Date | undefined;
  let status: ("PENDING" | "OVERDUE" | "DONE" | "CANCELLED")[] | undefined;

  if (scope === "today") {
    dueAfter = startOfDay(now);
    dueBefore = endOfDay(now);
    status = ["PENDING", "OVERDUE"];
  } else if (scope === "overdue") {
    status = ["OVERDUE"];
  } else if (scope === "pending") {
    status = ["PENDING", "OVERDUE"];
  }

  const items = await listFollowUps({
    assignedToId: mine && session?.user?.id ? session.user.id : undefined,
    status,
    dueAfter,
    dueBefore,
    take: 200,
  });

  return NextResponse.json({ items });
}
