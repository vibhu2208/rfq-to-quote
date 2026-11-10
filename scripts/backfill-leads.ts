import { PrismaClient, type LeadStage } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.rfq.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      parsedCategory: true,
      category: true,
      leadNumber: true,
      leadStage: true,
      disqualifyReason: true,
      _count: { select: { quotes: true } },
    },
  });

  let i = 1;
  const year = new Date().getFullYear();

  for (const r of rows) {
    const leadNumber =
      r.leadNumber || `L-${year}-${String(i).padStart(5, "0")}`;
    i += 1;

    let leadStage: LeadStage = r.leadStage;
    let disqualifyReason = r.disqualifyReason || "";

    if (r.status === "QUOTED") leadStage = "QUOTE_SENT";
    else if (r.status === "CLOSED" && r._count.quotes > 0) leadStage = "QUOTE_SENT";
    else if (r.status === "CLOSED") {
      leadStage = "DISQUALIFIED";
      disqualifyReason = disqualifyReason || "Migrated from closed RFQ";
    } else if (r.status === "PARSED" || r.status === "NEEDS_REVIEW") {
      leadStage = "QUALIFIED";
    } else {
      leadStage = "NEW_LEAD";
    }

    await prisma.rfq.update({
      where: { id: r.id },
      data: {
        leadNumber,
        leadStage,
        disqualifyReason,
        category: r.category || r.parsedCategory || "",
      },
    });

    const hist = await prisma.leadStageHistory.count({ where: { rfqId: r.id } });
    if (!hist) {
      await prisma.leadStageHistory.create({
        data: {
          rfqId: r.id,
          fromStage: null,
          toStage: leadStage,
          reason: "Initial migration",
        },
      });
    }

    const act = await prisma.leadActivity.count({
      where: { rfqId: r.id, type: "LEAD_CREATED" },
    });
    if (!act) {
      await prisma.leadActivity.create({
        data: {
          rfqId: r.id,
          type: "LEAD_CREATED",
          title: "Lead migrated",
          body: leadNumber,
        },
      });
    }
  }

  console.log(`Backfilled ${rows.length} leads`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
