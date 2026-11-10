"use client";

import { LeadsWorkbench } from "@/components/leads/leads-workbench";

export default function WonLeadsPage() {
  return (
    <LeadsWorkbench
      title="Won Opportunities"
      presetQuery={{ wonOnly: "1" }}
    />
  );
}
