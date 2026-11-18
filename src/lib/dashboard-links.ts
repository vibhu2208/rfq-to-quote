import { format, startOfMonth } from "date-fns";
import {
  PIPELINE_QUOTE_STATUSES,
  quoteListQuery,
  WON_QUOTE_STATUSES,
} from "@/lib/quote-list";

/** Deep links for dashboard tiles. Counts and destinations share these filters. */
export function dashboardDrilldowns(now = new Date()) {
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  return {
    openRfqs: "/leads?openRfq=1",
    pipeline: quoteListQuery({ status: PIPELINE_QUOTE_STATUSES.join(",") }),
    needAssistance: "/quotes?assist=1",
    wonThisMonth: quoteListQuery({
      status: WON_QUOTE_STATUSES.join(","),
      updatedFrom: monthStart,
    }),
    totalLeads: "/leads?intakeKind=REQUIREMENT",
    newLeads: "/leads?intakeKind=REQUIREMENT&stage=NEW_LEAD",
    hotLeads: "/leads/hot",
    wonLeads: "/leads/won",
    lostLeads: "/leads/lost",
    followUps: "/leads/follow-ups",
  };
}
