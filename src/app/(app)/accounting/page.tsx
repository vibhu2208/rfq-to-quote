import { Money } from "@/components/ui";
import { getTrialBalance, getArAgeing } from "@/lib/accounting/reports";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";

export default async function AccountingPage() {
  const [trial, ageing, payments, journals] = await Promise.all([
    getTrialBalance().catch(() => ({ rows: [], totalDebit: 0, totalCredit: 0, balanced: true })),
    getArAgeing().catch(() => []),
    prisma.payment.findMany({
      include: { party: true },
      orderBy: { paymentDate: "desc" },
      take: 20,
    }),
    prisma.journalEntry.findMany({
      where: { status: "POSTED" },
      orderBy: { entryDate: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Accounting</h1>
        <p className="mt-1 text-sm text-mid-green">
          Double-entry ledgers, trial balance, and receivables
          {trial.balanced ? "" : " · Trial balance is out of balance"}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Trial balance</h2>
        <div className="overflow-hidden rounded-xl bg-white/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-secondary/5 text-mid-green">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {trial.rows.map((r) => (
                <tr key={r.accountId} className="border-t border-light-green/20">
                  <td className="px-4 py-2">{r.code}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-right">
                    <Money value={r.debit} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Money value={r.credit} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-dark-secondary/20 font-semibold">
                <td className="px-4 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={trial.totalDebit} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={trial.totalCredit} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">AR ageing</h2>
        <div className="overflow-hidden rounded-xl bg-white/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-secondary/5 text-mid-green">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Bucket</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ageing.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-mid-green">
                    No open receivables
                  </td>
                </tr>
              ) : (
                ageing.map((row) => (
                  <tr key={row.invoiceId} className="border-t border-light-green/20">
                    <td className="px-4 py-2">{row.number}</td>
                    <td className="px-4 py-2">{row.partyName}</td>
                    <td className="px-4 py-2">{row.bucket}</td>
                    <td className="px-4 py-2 text-right">
                      <Money value={row.balanceDue} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Recent journals</h2>
          <ul className="space-y-2 rounded-xl bg-white/40 p-4 text-sm">
            {journals.map((j) => (
              <li key={j.id} className="flex justify-between gap-2">
                <span>
                  {j.number} · {j.narration || j.sourceType}
                </span>
                <span className="text-mid-green">{format(j.entryDate, "dd MMM")}</span>
              </li>
            ))}
            {journals.length === 0 ? <li className="text-mid-green">No journals posted</li> : null}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Receipts</h2>
          <ul className="space-y-2 rounded-xl bg-white/40 p-4 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>
                  {p.number} · {p.party?.legalName || "—"}
                </span>
                <Money value={decimalToNumber(p.amount)} />
              </li>
            ))}
            {payments.length === 0 ? <li className="text-mid-green">No receipts yet</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
