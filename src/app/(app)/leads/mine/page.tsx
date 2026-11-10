"use client";

import { LeadsWorkbench } from "@/components/leads/leads-workbench";

export default function MyLeadsPage() {
  return (
    <LeadsWorkbench
      title="My Leads"
      subtitle="Leads assigned to you"
      presetQuery={{ mine: "1" }}
    />
  );
}
