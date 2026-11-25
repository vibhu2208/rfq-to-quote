import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { computeLeadKpis } from "@/lib/leads/kpis";
import { LEAD_STAGE_LABELS } from "@/lib/leads/constants";
import { dashboardDrilldowns } from "@/lib/dashboard-links";
import { getDefaultOrganisationId } from "@/lib/accounting/context";
import {
  PIPELINE_QUOTE_STATUSES,
  WON_QUOTE_STATUSES,
} from "@/lib/quote-list";
import { format, startOfMonth, subDays } from "date-fns";
import { formatQuoteInstant } from "@/lib/quote-format";
import {
  ArrowUpRight,
  CircleAlert,
  ClipboardList,
  FileText,
  Package,
  Target,
  TrendingUp,
} from "lucide-react";

const PIPELINE_STATUSES = PIPELINE_QUOTE_STATUSES;
const WON_STATUSES = WON_QUOTE_STATUSES;

function formatLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekAgo = subDays(now, 7);
  const links = dashboardDrilldowns(now);

  const [
    productCount,
    quoteCount,
    rfqCount,
    assistCount,
    draftCount,
    pipelineCount,
    wonThisMonth,
    quotesThisMonth,
    clientCount,
    vendorCount,
    invoiceOpenCount,
    recentQuotes,
    assistQuotes,
    pipelineQuotes,
    statusGroups,
    pipelineAgg,
    wonAgg,
    newThisWeek,
    leadKpis,
  ] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.quote.count(),
    prisma.rfq.count({
      where: {
        archivedAt: null,
        status: { in: ["NEW", "NEEDS_REVIEW", "PARSED"] },
      },
    }),
    prisma.quote.count({ where: { needsAssistance: true } }),
    prisma.quote.count({ where: { status: "DRAFT" } }),
    prisma.quote.count({ where: { status: { in: [...PIPELINE_STATUSES] } } }),
    prisma.quote.count({
      where: { status: { in: [...WON_STATUSES] }, updatedAt: { gte: monthStart } },
    }),
    prisma.quote.count({ where: { createdAt: { gte: monthStart } } }),
    getDefaultOrganisationId().then((organisationId) =>
      prisma.party.count({
        where: { organisationId, active: true, type: { not: "OTHER" } },
      })
    ),
    prisma.vendor.count({ where: { active: true } }),
    prisma.invoice.count({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, balanceDue: { gt: 0 } },
    }),
    prisma.quote.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.quote.findMany({
      where: { needsAssistance: true },
      orderBy: { lastBuyerReplyAt: "desc" },
      take: 6,
    }),
    prisma.quote.findMany({
      where: { status: { in: [...PIPELINE_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.quote.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.quote.aggregate({
      where: { status: { in: [...PIPELINE_STATUSES] } },
      _sum: { grandTotal: true },
    }),
    prisma.quote.aggregate({
      where: { status: { in: [...WON_STATUSES] }, updatedAt: { gte: monthStart } },
      _sum: { grandTotal: true },
    }),
    prisma.quote.count({ where: { createdAt: { gte: weekAgo } } }),
    computeLeadKpis({}, { profile: "dashboard" }),
  ]);
  const pipelineValue = decimalToNumber(pipelineAgg._sum.grandTotal);
  const wonValue = decimalToNumber(wonAgg._sum.grandTotal);
  const winRate =
    quotesThisMonth > 0 ? Math.round((wonThisMonth / quotesThisMonth) * 100) : null;
  const leadStageMax = Math.max(
    ...leadKpis.stageDistribution.map((s) => s.count),
    1
  );

  const statusCount = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all])
  ) as Record<string, number>;

  const pipelineSteps = [
    { key: "DRAFT", label: "Draft", count: statusCount.DRAFT ?? 0 },
    { key: "SENT", label: "Sent", count: (statusCount.SENT ?? 0) + (statusCount.VIEWED ?? 0) },
    {
      key: "UNDER_NEGOTIATION",
      label: "Negotiating",
      count: (statusCount.UNDER_NEGOTIATION ?? 0) + (statusCount.REVISED ?? 0),
    },
    {
      key: "ACCEPTED",
      label: "Won",
      count: WON_STATUSES.reduce((sum, status) => sum + (statusCount[status] ?? 0), 0),
    },
  ];
  const pipelineMax = Math.max(...pipelineSteps.map((s) => s.count), 1);

  const kpis = [
    {
      label: "Open RFQs",
      value: rfqCount,
      hint: "New, needs review, or parsed",
      href: links.openRfqs,
      title: "Open the leads list filtered to unprocessed RFQs",
      icon: Target,
    },
    {
      label: "Pipeline value",
      valueNode: <Money value={pipelineValue} />,
      hint: `${pipelineCount} active quotes`,
      href: links.pipeline,
      title: "Quotes that are sent, viewed, negotiating, or revised",
      icon: TrendingUp,
    },
    {
      label: "Need assistance",
      value: assistCount,
      hint: assistCount > 0 ? "Buyer replies waiting" : "All clear",
      href: links.needAssistance,
      title: "Quotes with needs assistance checked",
      icon: CircleAlert,
      alert: assistCount > 0,
    },
    {
      label: "Won this month",
      valueNode: <Money value={wonValue} />,
      hint: winRate != null ? `${winRate}% of ${quotesThisMonth} quotes` : "No quotes yet",
      href: links.wonThisMonth,
      title: "Won quotes updated since the start of this month",
      icon: FileText,
    },
  ];

  const quickActions = [
    { href: "/quotes/new", label: "New quote", desc: "Build and send a quotation", icon: FileText },
    { href: links.totalLeads, label: "Leads", desc: `${leadKpis.totalLeads} requirements`, icon: Target },
    { href: links.openRfqs, label: "Open RFQs", desc: `${rfqCount} unprocessed RFQs`, icon: Target },
    { href: "/products", label: "Catalog", desc: `${productCount} active products`, icon: Package },
    { href: "/request", label: "Public RFQ", desc: "Share the intake form", icon: ClipboardList },
  ];

  return (
    <div className="space-y-7 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-mid-green">Overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            Sales dashboard
          </h1>
          <p className="mt-1 text-sm text-mid-green">
            {newThisWeek} new quotes in the last 7 days · {draftCount} drafts still open
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 rounded-lg border border-dark-primary/10 bg-white/60 px-3 py-2 text-sm font-medium text-dark-primary hover:bg-white"
          >
            <Target className="h-3.5 w-3.5" strokeWidth={1.7} />
            Leads
          </Link>
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            New quote
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link
              key={kpi.label}
              href={kpi.href}
              title={"title" in kpi ? kpi.title : undefined}
              className={`group rounded-2xl border p-4 transition hover:border-mid-green/30 hover:bg-white/80 ${
                kpi.alert
                  ? "border-dark-primary/15 bg-dark-primary/[0.04]"
                  : "border-dark-primary/8 bg-white/55"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-mid-green">{kpi.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                    {"valueNode" in kpi && kpi.valueNode != null ? kpi.valueNode : kpi.value}
                  </p>
                  <p className="mt-1 text-xs text-mid-green/90">{kpi.hint}</p>
                </div>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    kpi.alert ? "bg-dark-primary text-background" : "bg-mid-green/15 text-mid-green"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="rounded-2xl border border-dark-primary/8 bg-white/55 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Leads</h2>
            <p className="mt-0.5 text-xs text-mid-green">
              Requirements only
              {leadKpis.excludedIntake > 0
                ? ` · ${leadKpis.excludedIntake} junk/skipped not included`
                : ""}
              {" · "}conversion {Math.round(leadKpis.conversionRate * 1000) / 10}% ·
              quote-to-win {Math.round(leadKpis.quotationToWinRatio * 1000) / 10}%
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={links.followUps}
              className="text-xs font-medium text-mid-green hover:underline"
            >
              Follow-ups
              {leadKpis.overdueFollowUps > 0
                ? ` (${leadKpis.overdueFollowUps} overdue)`
                : ""}
            </Link>
            <Link
              href={links.totalLeads}
              className="text-xs font-medium text-mid-green hover:underline"
            >
              All requirements
            </Link>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "Total",
              value: leadKpis.totalLeads,
              href: links.totalLeads,
              title: "Requirements only — junk and skipped mail are excluded",
            },
            {
              label: "New",
              value: leadKpis.newLeads,
              href: links.newLeads,
              title: "Requirements in the New Lead stage",
            },
            {
              label: "Hot / Urgent",
              value: leadKpis.hotUrgent,
              href: links.hotLeads,
              title: "Hot and high priority requirements",
            },
            {
              label: "Won",
              value: leadKpis.leadsWon,
              href: links.wonLeads,
              title: "Requirements closed won",
            },
            {
              label: "Pending follow-ups",
              value: leadKpis.pendingFollowUps,
              href: links.followUps,
              title: "Pending and overdue follow-ups",
            },
          ].map((card) => (
            <Link
              key={card.label}
              href={card.href}
              title={card.title}
              className="rounded-xl bg-dark-primary/[0.03] px-3 py-2.5 hover:bg-dark-primary/[0.06]"
            >
              <p className="text-[11px] text-mid-green">{card.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{card.value}</p>
            </Link>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-mid-green">
              Stage distribution
            </p>
            <div className="space-y-2">
              {leadKpis.stageDistribution.map((row) => (
                <Link
                  key={row.stage}
                  href={`/leads?intakeKind=REQUIREMENT&stage=${row.stage}`}
                  title={`${LEAD_STAGE_LABELS[row.stage]} requirements`}
                  className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 rounded-md hover:bg-dark-primary/[0.04]"
                >
                  <span className="truncate text-xs text-mid-green">
                    {LEAD_STAGE_LABELS[row.stage]}
                  </span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-dark-primary/8">
                    <div
                      className="h-full rounded-full bg-dark-primary/70"
                      style={{
                        width: `${Math.max(
                          (row.count / leadStageMax) * 100,
                          row.count ? 4 : 0
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-right text-xs font-semibold tabular-nums">
                    {row.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-mid-green">
              Also in pipeline
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-dark-primary/8 px-3 py-2.5">
                <p className="text-[11px] text-mid-green">Contacted</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {leadKpis.contacted}
                </p>
              </div>
              <div className="rounded-xl border border-dark-primary/8 px-3 py-2.5">
                <p className="text-[11px] text-mid-green">Qualified</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {leadKpis.qualified}
                </p>
              </div>
              <div className="rounded-xl border border-dark-primary/8 px-3 py-2.5">
                <p className="text-[11px] text-mid-green">Quotes sent</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {leadKpis.quotationsSent}
                </p>
              </div>
              <Link
                href={links.lostLeads}
                title="Lost and disqualified requirements"
                className="rounded-xl border border-dark-primary/8 px-3 py-2.5 hover:bg-dark-primary/[0.04]"
              >
                <p className="text-[11px] text-mid-green">Lost / DQ</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {leadKpis.dealsLost + leadKpis.disqualified}
                </p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-dark-primary/8 bg-white/55 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Quote pipeline</h2>
              <p className="mt-0.5 text-xs text-mid-green">Where live quotes sit today</p>
            </div>
            <Link href="/quotes" className="text-xs font-medium text-mid-green hover:underline">
              All quotes
            </Link>
          </div>
          <div className="space-y-3">
            {pipelineSteps.map((step) => (
              <div key={step.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3">
                <span className="text-sm text-mid-green">{step.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-dark-primary/8">
                  <div
                    className="h-full rounded-full bg-mid-green transition-all"
                    style={{ width: `${Math.max((step.count / pipelineMax) * 100, step.count ? 6 : 0)}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold tabular-nums">{step.count}</span>
              </div>
            ))}
          </div>

          {pipelineQuotes.length > 0 ? (
            <div className="mt-5 border-t border-dark-primary/8 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-mid-green">
                Active deals
              </p>
              <ul className="space-y-2">
                {pipelineQuotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/quotes/${q.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-light-green/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{q.quoteNumber}</p>
                        <p className="truncate text-xs text-mid-green">
                          {q.buyerCompany || q.buyerName || "—"} · {formatLabel(q.status)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        <Money value={decimalToNumber(q.grandTotal)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-dark-primary/8 bg-white/55 p-5">
          <h2 className="text-base font-semibold tracking-tight">Quick actions</h2>
          <p className="mt-0.5 text-xs text-mid-green">Jump into the next task</p>
          <div className="mt-4 space-y-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 hover:border-dark-primary/8 hover:bg-light-green/15"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mid-green/15 text-mid-green">
                    <Icon className="h-4 w-4" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{action.label}</span>
                    <span className="block truncate text-xs text-mid-green">{action.desc}</span>
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-mid-green" strokeWidth={1.8} />
                </Link>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-dark-primary/8 pt-4">
            <Link
              href="/clients"
              title="Active parties in the clients directory, excluding inactive and other"
              className="rounded-xl bg-dark-primary/[0.03] px-3 py-2.5 hover:bg-dark-primary/[0.06]"
            >
              <p className="text-[11px] text-mid-green">Clients</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{clientCount}</p>
              <p className="text-[10px] text-mid-green/80">Active directory</p>
            </Link>
            <div className="rounded-xl bg-dark-primary/[0.03] px-3 py-2.5">
              <p className="text-[11px] text-mid-green">Vendors</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{vendorCount}</p>
            </div>
            <div className="rounded-xl bg-dark-primary/[0.03] px-3 py-2.5">
              <p className="text-[11px] text-mid-green">Products</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{productCount}</p>
            </div>
            <div className="rounded-xl bg-dark-primary/[0.03] px-3 py-2.5">
              <p className="text-[11px] text-mid-green">Open invoices</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{invoiceOpenCount}</p>
            </div>
          </div>
        </div>
      </section>

      {assistQuotes.length > 0 ? (
        <section className="rounded-2xl border border-dark-primary/10 bg-white/60 p-1 shadow-[0_4px_20px_rgba(11,43,38,0.04)]">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Needs assistance</h2>
              <p className="text-xs text-mid-green">Buyer replies that need a human touch</p>
            </div>
            <Link
              href={links.needAssistance}
              className="text-xs font-medium text-mid-green hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-mid-green">
                <tr className="border-y border-dark-primary/6">
                  <th className="px-4 py-2.5 font-medium">Quote</th>
                  <th className="px-4 py-2.5 font-medium">Intent</th>
                  <th className="px-4 py-2.5 font-medium">Why</th>
                  <th className="px-4 py-2.5 font-medium">Reply</th>
                </tr>
              </thead>
              <tbody>
                {assistQuotes.map((q) => (
                  <tr key={q.id} className="border-t border-dark-primary/5 hover:bg-light-green/10">
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${q.id}`} className="font-medium hover:text-mid-green">
                        {q.quoteNumber}
                      </Link>
                      <p className="text-xs text-mid-green">
                        {q.buyerCompany || q.buyerName || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={q.status} />
                      {q.lastReplyIntent ? (
                        <p className="mt-1 text-xs text-dark-primary">
                          {formatLabel(q.lastReplyIntent)}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-mid-green">
                      {q.assistanceReason || q.lastAnalysisSummary || "—"}
                    </td>
                    <td className="px-4 py-3 text-mid-green">
                      {q.lastBuyerReplyAt
                        ? format(q.lastBuyerReplyAt, "dd MMM HH:mm")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dark-primary/8 bg-white/55 p-1">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Recent quotes</h2>
            <p className="text-xs text-mid-green">{quoteCount} total in the system</p>
          </div>
          <Link href="/quotes" className="text-xs font-medium text-mid-green hover:underline">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-mid-green">
              <tr className="border-y border-dark-primary/6">
                <th className="px-4 py-2.5 font-medium">Quote</th>
                <th className="px-4 py-2.5 font-medium">Buyer</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-mid-green">
                    No quotes yet.{" "}
                    <Link href="/quotes/new" className="font-medium underline">
                      Create your first quote
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                recentQuotes.map((q) => (
                  <tr key={q.id} className="border-t border-dark-primary/5 hover:bg-light-green/10">
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${q.id}`} className="font-medium hover:text-mid-green">
                        {q.quoteNumber}
                      </Link>
                      {q.needsAssistance ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-dark-primary">
                          Assist
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{q.buyerCompany || q.buyerName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={q.status} />
                    </td>
                    <td className="px-4 py-3 text-mid-green">
                      {formatQuoteInstant(q.updatedAt, "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money value={decimalToNumber(q.grandTotal)} />
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
