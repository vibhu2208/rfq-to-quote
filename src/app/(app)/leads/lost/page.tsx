"use client";

import { LeadsWorkbench } from "@/components/leads/leads-workbench";

export default function LostLeadsPage() {
  return (
    <LeadsWorkbench
      title="Lost / Disqualified Leads"
      presetQuery={{ lostOnly: "1" }}
    />
  );
}
