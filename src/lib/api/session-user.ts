import type { Session } from "next-auth";
import { NextResponse } from "next/server";

export function requireUserId(session: Session | null) {
  const userId = session?.user?.id;
  if (!userId) {
    return {
      userId: null as null,
      error: NextResponse.json({ error: "User id missing from session" }, { status: 401 }),
    };
  }
  return { userId, error: null as null };
}
