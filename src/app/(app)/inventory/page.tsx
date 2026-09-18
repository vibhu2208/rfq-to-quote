import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";
import { InventoryAdjustForm } from "@/components/inventory-adjust-form";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { syncGoodsProductsToWarehouse } from "@/lib/accounting/inventory";

export default async function InventoryPage() {
  const ctx = await getDefaultOrgContext();
  const sync = await syncGoodsProductsToWarehouse(prisma, {
    warehouseId: ctx.warehouseId,
    organisationId: ctx.organisationId,
  });

  const [balances, movements, products, warehouses] = await Promise.all([
    prisma.stockBalance.findMany({
      where: {
        warehouseId: ctx.warehouseId,
        product: { active: true, productType: "GOODS" },
      },
      include: {
        product: { select: { code: true, name: true, unit: true } },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: { product: { code: "asc" } },
      take: 200,
    }),
    prisma.stockMovement.findMany({
      include: {
        product: { select: { code: true, name: true } },
        warehouse: { select: { code: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
    prisma.product.findMany({
      where: { active: true, productType: "GOODS" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
      take: 200,
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-mid-green">
          Product catalog synced to warehouse stock · weighted-average · negative stock blocked
          {sync.created > 0 ? ` · linked ${sync.created} new product(s)` : null}
        </p>
      </div>

      <InventoryAdjustForm products={products} warehouses={warehouses} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Balances</h2>
        <div className="overflow-hidden rounded-xl bg-white/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-secondary/5 text-mid-green">
              <tr>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">Avg cost</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-mid-green">
                    No goods products yet. Add products on the Products page — they appear here
                    automatically. Use the form above to post opening stock.
                  </td>
                </tr>
              ) : (
                balances.map((b) => (
                  <tr key={b.id} className="border-t border-light-green/20">
                    <td className="px-4 py-2">{b.warehouse.code}</td>
                    <td className="px-4 py-2">
                      {b.product.code} — {b.product.name}
                    </td>
                    <td className="px-4 py-2 text-right">{decimalToNumber(b.quantityOnHand)}</td>
                    <td className="px-4 py-2 text-right">
                      <Money value={decimalToNumber(b.averageCost)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money value={decimalToNumber(b.inventoryValue)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent movements</h2>
        <div className="overflow-hidden rounded-xl bg-white/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-secondary/5 text-mid-green">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-mid-green">
                    No movements yet. Post an opening adjustment to stock goods for invoicing.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="border-t border-light-green/20">
                    <td className="px-4 py-2 text-mid-green">
                      {format(m.occurredAt, "dd MMM HH:mm")}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={m.type} />
                    </td>
                    <td className="px-4 py-2">{m.product.code}</td>
                    <td className="px-4 py-2 text-right">{decimalToNumber(m.quantity)}</td>
                    <td className="px-4 py-2 text-right">
                      <Money value={decimalToNumber(m.value)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
