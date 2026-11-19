"use client";

import { TelemarketingWorkbench } from "@/components/telemarketing/telemarketing-workbench";
import { TelemarketingChromeProvider } from "@/components/telemarketing/telemarketing-chrome";

export default function TelemarketingPage() {
  return (
    <TelemarketingChromeProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <TelemarketingWorkbench />
      </div>
    </TelemarketingChromeProvider>
  );
}