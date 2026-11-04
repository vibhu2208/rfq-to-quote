import { PrismaClient } from "@prisma/client";

/** Bump when schema relations change so dev HMR drops a stale PrismaClient. */
const PRISMA_CLIENT_VERSION = "admin-subcategory-v1";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaVersion?: string;
};

if (
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prisma &&
  globalForPrisma.prismaVersion !== PRISMA_CLIENT_VERSION
) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaVersion = PRISMA_CLIENT_VERSION;
}
