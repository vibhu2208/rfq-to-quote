"use client";

import { TelemarketingWorkbench } from "@/components/telemarketing/telemarketing-workbench";
import { TelemarketingChromeProvider } from "@/components/telemarketing/telemarketing-chrome";

export default function TelemarketingPage() {
  return (
    <TelemarketingChromeProvider>
      <TelemarketingWorkbench />
    </TelemarketingChromeProvider>
  );
}