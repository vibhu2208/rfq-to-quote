import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { recordStockMovement } from "@/lib/accounting/inventory";
import { isAccountingError } from "@/lib/accounting/errors";

const adjustmentSchema = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  direction: z.enum(["in", "out"]),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional(),
  reason: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const warehouseId = url.searchParams.get("warehouseId");
  const productId = url.searchParams.get("productId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { productId } : {}),
    },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  return NextResponse.json(
    movements.map((m) => ({
      ...m,
      quantity: decimalToNumber(m.quantity),
      unitCost: decimalToNumber(m.unitCost),
      value: decimalToNumber(m.value),
      runningQuantity: m.runningQuantity ? decimalToNumber(m.runningQuantity) : null,
      runningAverageCost: m.runningAverageCost ? decimalToNumber(m.runningAverageCost) : null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = adjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ctx = await getDefaultOrgContext();
    const data = parsed.data;
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.productType === "SERVICE") {
      return NextResponse.json(
        { error: "Services are not inventoried. Stock adjustments apply to goods only." },
        { status: 400 }
      );
    }

    const reason = (data.reason ?? "").toLowerCase();
    const type =
      data.direction === "out"
        ? "ADJUSTMENT_OUT"
        : reason.includes("opening")
          ? "OPENING"
          : "ADJUSTMENT_IN";
    const idempotencyKey =
      data.idempotencyKey ?? `adjustment-${data.warehouseId}-${data.productId}-${Date.now()}`;

    const movement = await prisma.$transaction((tx) =>
      recordStockMovement(tx, {
        gstRegistrationId: ctx.gstRegistrationId,
        warehouseId: data.warehouseId,
        productId: data.productId,
        type,
        quantity: data.quantity,
        unitCost: data.direction === "in" ? data.unitCost ?? 0 : undefined,
        sourceType: "INVENTORY_ADJUSTMENT",
        sourceId: idempotencyKey,
        idempotencyKey,
        metadata: { reason: data.reason ?? "" },
      })
    );

    return NextResponse.json(
      {
        ...movement,
        quantity: decimalToNumber(movement.quantity),
        unitCost: decimalToNumber(movement.unitCost),
        value: decimalToNumber(movement.value),
      },
      { status: 201 }
    );
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
}
