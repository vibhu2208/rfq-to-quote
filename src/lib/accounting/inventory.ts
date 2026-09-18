import type { Prisma, PrismaClient, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { round2, round4, toNumber } from "@/lib/accounting/money";

type DbClient = Prisma.TransactionClient | PrismaClient;

function isInbound(type: StockMovementType): boolean {
  return (
    type === "OPENING" ||
    type === "PURCHASE" ||
    type === "SALE_RETURN" ||
    type === "ADJUSTMENT_IN" ||
    type === "TRANSFER_IN"
  );
}

function signedQty(type: StockMovementType, quantity: number): number {
  return isInbound(type) ? Math.abs(quantity) : -Math.abs(quantity);
}

/**
 * Append-only stock movement with weighted-average valuation.
 * Negative stock is blocked unless warehouse policy allows it.
 */
export async function recordStockMovement(
  tx: Prisma.TransactionClient,
  input: {
    gstRegistrationId: string;
    warehouseId: string;
    productId: string;
    invoiceId?: string | null;
    type: StockMovementType;
    occurredAt?: Date;
    quantity: number;
    unitCost?: number;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }
) {
  const existing = await tx.stockMovement.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  const warehouse = await tx.warehouse.findUniqueOrThrow({
    where: { id: input.warehouseId },
  });
  const policy = (warehouse.policyMetadata ?? {}) as { negativeStockAllowed?: boolean };
  const negativeAllowed = policy.negativeStockAllowed === true;

  let balance = await tx.stockBalance.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });

  if (!balance) {
    balance = await tx.stockBalance.create({
      data: {
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantityOnHand: 0,
        quantityReserved: 0,
        averageCost: 0,
        inventoryValue: 0,
      },
    });
  }

  const qtyOnHand = toNumber(balance.quantityOnHand);
  const reserved = toNumber(balance.quantityReserved);
  const avgCost = toNumber(balance.averageCost);
  const delta = signedQty(input.type, input.quantity);
  const nextQty = round4(qtyOnHand + delta);

  if (!negativeAllowed && nextQty < -0.0000001) {
    throw new Error(
      `Insufficient stock for product ${input.productId}: on hand ${qtyOnHand}, reserved ${reserved}, requested ${Math.abs(delta)}`
    );
  }
  if (!negativeAllowed && nextQty + 0.0000001 < reserved) {
    throw new Error(`Stock movement would breach reserved quantity (${reserved})`);
  }

  let unitCost = input.unitCost != null ? round4(input.unitCost) : avgCost;
  let nextAvg = avgCost;
  let nextValue = toNumber(balance.inventoryValue);

  if (isInbound(input.type)) {
    const inboundQty = Math.abs(delta);
    const inboundValue = round2(inboundQty * unitCost);
    const newValue = round2(nextValue + inboundValue);
    nextAvg = nextQty > 0 ? round4(newValue / nextQty) : 0;
    nextValue = nextQty > 0 ? newValue : 0;
  } else {
    unitCost = avgCost;
    const outboundValue = round2(Math.abs(delta) * unitCost);
    nextValue = round2(Math.max(0, nextValue - outboundValue));
    nextAvg = nextQty > 0 ? round4(nextValue / nextQty) : 0;
  }

  const movement = await tx.stockMovement.create({
    data: {
      gstRegistrationId: input.gstRegistrationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      invoiceId: input.invoiceId ?? null,
      type: input.type,
      occurredAt: input.occurredAt ?? new Date(),
      quantity: Math.abs(delta),
      unitCost,
      value: round2(Math.abs(delta) * unitCost),
      runningQuantity: nextQty,
      runningAverageCost: nextAvg,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  await tx.stockBalance.update({
    where: { id: balance.id },
    data: {
      quantityOnHand: nextQty,
      averageCost: nextAvg,
      inventoryValue: nextValue,
      version: { increment: 1 },
    },
  });

  await tx.inventoryValuationLayer.create({
    data: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      asOf: input.occurredAt ?? new Date(),
      movementId: movement.id,
      quantity: nextQty,
      averageCost: nextAvg,
      inventoryValue: nextValue,
      policy: "WEIGHTED_AVERAGE",
      policyMetadata: { negativeStockAllowed: negativeAllowed },
    },
  });

  return movement;
}

/**
 * Ensure a zero StockBalance exists for a GOODS product in a warehouse.
 * SERVICES are skipped — they are not inventoried.
 */
export async function ensureProductStockBalance(
  tx: DbClient,
  input: { productId: string; warehouseId: string; productType?: string }
) {
  if (input.productType === "SERVICE") return null;

  const product =
    input.productType != null
      ? { productType: input.productType }
      : await tx.product.findUnique({
          where: { id: input.productId },
          select: { productType: true },
        });

  if (!product || product.productType === "SERVICE") return null;

  return tx.stockBalance.upsert({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
    update: {},
    create: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantityOnHand: 0,
      quantityReserved: 0,
      averageCost: 0,
      inventoryValue: 0,
    },
  });
}

/**
 * Backfill StockBalance rows for every active GOODS product in the given warehouse.
 * Returns how many balances were created.
 */
export async function syncGoodsProductsToWarehouse(
  tx: DbClient,
  input: { warehouseId: string; organisationId?: string | null }
): Promise<{ created: number; totalGoods: number }> {
  const products = await tx.product.findMany({
    where: {
      active: true,
      productType: "GOODS",
      ...(input.organisationId
        ? {
            OR: [{ organisationId: input.organisationId }, { organisationId: null }],
          }
        : {}),
    },
    select: { id: true },
  });

  let created = 0;
  for (const product of products) {
    const existing = await tx.stockBalance.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: input.warehouseId,
          productId: product.id,
        },
      },
      select: { id: true },
    });
    if (existing) continue;
    await tx.stockBalance.create({
      data: {
        warehouseId: input.warehouseId,
        productId: product.id,
        quantityOnHand: 0,
        quantityReserved: 0,
        averageCost: 0,
        inventoryValue: 0,
      },
    });
    created += 1;
  }

  return { created, totalGoods: products.length };
}

/**
 * Sync product into default org warehouse; optionally post opening stock.
 */
export async function syncProductToInventory(input: {
  productId: string;
  productType?: string;
  openingQty?: number;
  unitCost?: number;
  gstRegistrationId?: string;
  warehouseId?: string;
}) {
  const { getDefaultOrgContext } = await import("@/lib/accounting/context");
  const ctx = await getDefaultOrgContext();
  const warehouseId = input.warehouseId ?? ctx.warehouseId;
  const gstRegistrationId = input.gstRegistrationId ?? ctx.gstRegistrationId;

  await ensureProductStockBalance(prisma, {
    productId: input.productId,
    warehouseId,
    productType: input.productType,
  });

  const openingQty = input.openingQty ?? 0;
  if (openingQty > 0 && input.productType !== "SERVICE") {
    await prisma.$transaction((tx) =>
      recordStockMovement(tx, {
        gstRegistrationId,
        warehouseId,
        productId: input.productId,
        type: "OPENING",
        quantity: openingQty,
        unitCost: input.unitCost ?? 0,
        sourceType: "PRODUCT_OPENING",
        sourceId: input.productId,
        idempotencyKey: `opening-${warehouseId}-${input.productId}`,
        metadata: { reason: "Opening stock on product sync" },
      })
    );
  }
}
