import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const products = await prisma.product.count({ where: { sourceProductId: { not: null } } });
  const parties = await prisma.party.count({ where: { sourceClientId: { not: null } } });
  const addresses = await prisma.address.count();
  const sampleP = await prisma.product.findFirst({
    where: { sourceProductId: { not: null } },
    select: {
      code: true,
      name: true,
      category: true,
      hsnCode: true,
      sourceProductId: true,
    },
  });
  const sampleC = await prisma.party.findFirst({
    where: { sourceClientId: { not: null }, gstin: { not: null } },
    include: { addresses: { take: 1 } },
  });
  console.log(
    JSON.stringify(
      {
        products,
        parties,
        addresses,
        sampleP,
        sampleC: sampleC
          ? {
              code: sampleC.code,
              legalName: sampleC.legalName,
              gstin: sampleC.gstin,
              sourceClientId: sampleC.sourceClientId,
              ledgerGroup: sampleC.ledgerGroup,
              city: sampleC.addresses[0]?.city,
            }
          : null,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
