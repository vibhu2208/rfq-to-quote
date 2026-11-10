import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.rfq.count();
  const byChannel = await prisma.rfq.groupBy({
    by: ["channel"],
    _count: { _all: true },
  });
  const activeByChannel = await prisma.rfq.groupBy({
    by: ["channel"],
    where: { archivedAt: null },
    _count: { _all: true },
  });
  const missingLeadNumber = await prisma.rfq.count({
    where: { OR: [{ leadNumber: "" }, { leadNumber: { equals: undefined as never } }] },
  });
  const sample = await prisma.rfq.findMany({
    where: { channel: { in: ["EMAIL", "WHATSAPP"] } },
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      leadNumber: true,
      channel: true,
      leadStage: true,
      status: true,
      customerName: true,
      customerEmail: true,
      archivedAt: true,
      createdAt: true,
    },
  });
  console.log(
    JSON.stringify(
      { total, byChannel, activeByChannel, missingLeadNumber, sample },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
