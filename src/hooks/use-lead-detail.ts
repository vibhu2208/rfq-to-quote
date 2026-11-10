"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLeadDetail, leadsKeys } from "@/lib/leads/query";

export function useLeadDetail(
  leadId: string | null,
  opts?: { view?: "drawer" | "full"; enabled?: boolean }
) {
  const view = opts?.view ?? "drawer";
  const enabled = Boolean(leadId) && (opts?.enabled ?? true);

  return useQuery({
    queryKey: leadsKeys.detail(leadId || "__none__", view),
    queryFn: () => fetchLeadDetail(leadId as string, view),
    enabled,
  });
}
