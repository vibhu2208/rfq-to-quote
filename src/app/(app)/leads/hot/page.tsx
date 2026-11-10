"use client";

import { LeadsWorkbench } from "@/components/leads/leads-workbench";

export default function HotLeadsPage() {
  return (
    <LeadsWorkbench
      title="Hot / Urgent Leads"
      subtitle="Priority Hot and High"
      presetQuery={{ hotOnly: "1" }}
    />
  );
}
