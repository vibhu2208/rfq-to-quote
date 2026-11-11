import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { syncGoodsProductsToWarehouse } from "@/lib/accounting/inventory";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const warehouseIdParam = url.searchParams.get("warehouseId");
  const productId = url.searchParams.get("productId");
  const sync = url.searchParams.get("sync") !== "false";
  const mapOnly = url.searchParams.get("map") === "1";

  const ctx = await getDefaultOrgContext();
  const warehouseId = warehouseIdParam || ctx.warehouseId;

  let syncResult = { created: 0, totalGoods: 0 };
  if (sync && !productId) {
    syncResult = await syncGoodsProductsToWarehouse(prisma, {
      warehouseId,
      organisationId: ctx.organisationId,
    });
  }

  // Compact payload for RFQ stock badges — skip joins / decimal-heavy rows.
  if (mapOnly && !productId) {
    const balances = await prisma.stockBalance.findMany({
      where: {
        warehouseId,
        product: { active: true, productType: "GOODS" },
      },
      select: { productId: true, quantityOnHand: true },
    });
    const map: Record<string, number> = {};
    for (const row of balances) {
      map[row.productId] = decimalToNumber(row.quantityOnHand);
    }
    return NextResponse.json({ synced: syncResult, map });
  }

  const balances = await prisma.stockBalance.findMany({
    where: {
      warehouseId,
      ...(productId ? { productId } : {}),
      product: { active: true, productType: "GOODS" },
    },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true, unit: true, productType: true } },
    },
    orderBy: [{ product: { code: "asc" } }],
  });

  return NextResponse.json({
    synced: syncResult,
    balances: balances.map((b) => ({
      ...b,
      quantityOnHand: decimalToNumber(b.quantityOnHand),
      quantityReserved: decimalToNumber(b.quantityReserved),
      averageCost: decimalToNumber(b.averageCost),
      inventoryValue: decimalToNumber(b.inventoryValue),
    })),
  });
}
