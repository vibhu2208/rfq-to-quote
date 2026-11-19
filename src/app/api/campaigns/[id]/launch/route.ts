import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { launchCampaign } from "@/lib/campaigns/launch";
import { NO_PROVIDER_SKIP_REASON } from "@/lib/campaigns/channel";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  try {
    const campaign = await launchCampaign(id);
    return NextResponse.json({
      campaign,
      providerConnected: false,
      notice: NO_PROVIDER_SKIP_REASON,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Launch failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}