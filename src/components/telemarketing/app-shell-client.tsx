"use client";

import type { ReactNode } from "react";
import { QuoteAgentFab } from "@/components/quote-agent-fab";
import { TelemarketingChromeProvider } from "@/components/telemarketing/telemarketing-chrome";

export function AppShellClient({ children }: { children: ReactNode }) {
  return (
    <TelemarketingChromeProvider>
      {children}
      <QuoteAgentFab />
    </TelemarketingChromeProvider>
  );
}