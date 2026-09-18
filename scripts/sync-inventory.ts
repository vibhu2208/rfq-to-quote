import { prisma } from "../src/lib/prisma";
import { getDefaultOrgContext } from "../src/lib/accounting/context";
import { syncGoodsProductsToWarehouse } from "../src/lib/accounting/inventory";

async function main() {
  await prisma.product.updateMany({
    where: { code: "SVC-INSTALL" },
    data: { productType: "SERVICE" },
  });
  const ctx = await getDefaultOrgContext();
  const result = await syncGoodsProductsToWarehouse(prisma, {
    warehouseId: ctx.warehouseId,
    organisationId: ctx.organisationId,
  });
  console.log(result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
