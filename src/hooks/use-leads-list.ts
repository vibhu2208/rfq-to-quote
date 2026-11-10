"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchLeadsList,
  leadsKeys,
  type LeadsListFilters,
} from "@/lib/leads/query";

export function useLeadsList(filters: LeadsListFilters, enabled = true) {
  return useQuery({
    queryKey: leadsKeys.list(filters),
    queryFn: () => fetchLeadsList(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}
