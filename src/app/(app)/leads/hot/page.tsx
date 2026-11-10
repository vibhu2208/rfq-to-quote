"use client";

import { LeadsWorkbench } from "@/components/leads/leads-workbench";

export default function HotLeadsPage() {
  return (
    <LeadsWorkbench title="Hot / Urgent Leads" presetQuery={{ hotOnly: "1" }} />
  );
}
