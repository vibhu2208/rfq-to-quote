import { NextRequest } from "next/server";

/** @deprecated Prefer /api/cron/inbox-poll — kept as an alias. */
export async function POST(req: NextRequest) {
  const { POST: poll } = await import("@/app/api/cron/inbox-poll/route");
  return poll(req);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
