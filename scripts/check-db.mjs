import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const r = await p.$queryRawUnsafe("SELECT 1 as ok");
  console.log("CONNECTED", r);
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
