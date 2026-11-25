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
    placeholderData: (previousData, previousQuery) => {
      const prevFilters = previousQuery?.queryKey?.[2] as LeadsListFilters | undefined;
      if (
        prevFilters &&
        (prevFilters.sort !== filters.sort || prevFilters.dir !== filters.dir)
      ) {
        return undefined;
      }
      return keepPreviousData(previousData);
    },
    enabled,
  });
}
