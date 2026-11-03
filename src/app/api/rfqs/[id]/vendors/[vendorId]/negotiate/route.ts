import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { sendVendorNegotiation } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string; vendorId: string }> };

const bodySchema = z
  .object({
    mode: z.enum(["ai", "manual"]).optional().default("ai"),
    plainNote: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "manual") {
      if (!value.subject?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["subject"],
          message: "Subject is required for manual send",
        });
      }
      if (!value.body?.trim() || value.body.trim().length < 10) {
        ctx.addIssue({
          code: "custom",
          path: ["body"],
          message: "Write the full email body before sending",
        });
      }
      return;
    }
    if (!value.plainNote?.trim() || value.plainNote.trim().length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["plainNote"],
        message: "Write a short negotiation note",
      });
    }
  });

/** AI-format or manually send a negotiation email on the same Recore thread. */
export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, vendorId } = await params;
  const json = await request.json().catch(() => null);
  if (json == null || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const outreach = await sendVendorNegotiation({
      rfqId: id,
      vendorId,
      mode: parsed.data.mode,
      plainNote: parsed.data.plainNote,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });

    return NextResponse.json({
      id: outreach.id,
      status: outreach.status,
      threadRef: outreach.threadRef,
      negotiatedAt: outreach.negotiatedAt?.toISOString() || null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Negotiation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
