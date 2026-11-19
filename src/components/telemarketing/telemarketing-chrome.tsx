"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type ChromeState = {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const TelemarketingChromeContext = createContext<ChromeState | null>(null);

export function TelemarketingChromeProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const value = useMemo(() => ({ drawerOpen, setDrawerOpen }), [drawerOpen]);
  return (
    <TelemarketingChromeContext.Provider value={value}>
      {children}
    </TelemarketingChromeContext.Provider>
  );
}

export function useTelemarketingChrome() {
  const ctx = useContext(TelemarketingChromeContext);
  return ctx ?? { drawerOpen: false, setDrawerOpen: () => {} };
}