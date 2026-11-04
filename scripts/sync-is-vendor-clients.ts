import {
  deleteDummyVendors,
  syncVendorsFromIsVendorParties,
} from "../src/lib/sync-vendors-from-parties";

async function main() {
  const deleted = await deleteDummyVendors();
  console.log("deleted dummies", deleted);
  const synced = await syncVendorsFromIsVendorParties();
  console.log("sync", synced);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
