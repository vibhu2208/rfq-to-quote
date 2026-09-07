import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRfqWithMessage } from "@/lib/rfq";

const schema = z.object({
  company: z.string().optional().default(""),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.union([z.string().email(), z.literal("")]).optional().default(""),
  phone: z.string().optional().default(""),
  productNeeded: z.string().min(1, "Please describe what you need"),
  quantity: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, unknown>;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      body = {
        company: String(form.get("company") || ""),
        contactName: String(form.get("contactName") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        productNeeded: String(form.get("productNeeded") || ""),
        quantity: String(form.get("quantity") || ""),
        notes: String(form.get("notes") || ""),
      };
    } else {
      body = await req.json();
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const rawText = [
      `Product / service needed: ${d.productNeeded}`,
      d.quantity ? `Quantity: ${d.quantity}` : null,
      d.notes ? `Notes: ${d.notes}` : null,
      `Contact: ${d.contactName}`,
      d.company ? `Company: ${d.company}` : null,
      d.email ? `Email: ${d.email}` : null,
      d.phone ? `Phone: ${d.phone}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const rfq = await createRfqWithMessage({
      channel: "WEB_FORM",
      sourceRef: `web-${Date.now()}`,
      subject: `Web RFQ: ${d.productNeeded.slice(0, 80)}`,
      rawText,
      customerName: d.contactName,
      customerEmail: d.email || "",
      customerPhone: d.phone || "",
      customerCompany: d.company || "",
    });

    return NextResponse.json(
      { id: rfq.id, status: rfq.status, message: "Request received. We will get back to you shortly." },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to submit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
