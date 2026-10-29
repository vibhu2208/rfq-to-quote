import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

async function auth(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  return handler(req, context);
}

export { auth as GET, auth as POST };
