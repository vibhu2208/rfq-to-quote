import { prisma } from "@/lib/prisma";
import {
  getCampaignChannel,
  NO_PROVIDER_SKIP_REASON,
} from "@/lib/campaigns/channel";

export async function launchCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: { where: { status: { in: ["PENDING", "QUEUED"] } } },
    },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(campaign.status)) {
    throw new Error(`Cannot launch campaign in status ${campaign.status}`);
  }
  if (!campaign.recipients.length) {
    throw new Error("Campaign has no recipients");
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "RUNNING", launchedAt: new Date() },
  });

  const channel = getCampaignChannel();
  const batch = campaign.recipients.map((r) => ({
    recipientId: r.id,
    phone: r.phone,
    body: r.messageBody || campaign.messageBody,
  }));

  const results = await channel.sendBatch(batch);

  for (const result of results) {
    await prisma.campaignRecipient.update({
      where: { id: result.recipientId },
      data: {
        status: result.status,
        skipReason: result.skipReason || NO_PROVIDER_SKIP_REASON,
      },
    });
  }

  const counts = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });

  const tally = {
    totalRecipients: 0,
    queuedCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    pendingCount: 0,
    replyCount: 0,
  };
  for (const row of counts) {
    const n = row._count._all;
    tally.totalRecipients += n;
    if (row.status === "QUEUED") tally.queuedCount = n;
    if (row.status === "DELIVERED" || row.status === "SENT" || row.status === "READ") {
      tally.deliveredCount += n;
    }
    if (row.status === "FAILED") tally.failedCount = n;
    if (row.status === "PENDING") tally.pendingCount = n;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "COMPLETED",
      ...tally,
    },
  });

  return prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { recipients: true },
  });
}