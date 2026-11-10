"use client";

import { LeadsWorkbench } from "@/components/leads/leads-workbench";

export default function MyLeadsPage() {
  return (
    <LeadsWorkbench title="My Leads" presetQuery={{ mine: "1" }} />
  );
}
