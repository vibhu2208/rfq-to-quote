import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { AppShellClient } from "@/components/telemarketing/app-shell-client";
import { ToastProvider } from "@/components/app-toast";
import {
  NavigationProgress,
  RouteTransitionOverlay,
  RouteTransitionProvider,
} from "@/components/navigation-progress";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <RouteTransitionProvider>
        <AppShellClient>
          <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
            <NavigationProgress />
            <AppNav email={session.user?.email ?? ""} />
            <main className="relative mx-auto flex min-h-0 w-full max-w-[110rem] flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-4 lg:px-5">
              {children}
              <RouteTransitionOverlay />
            </main>
          </div>
        </AppShellClient>
      </RouteTransitionProvider>
    </ToastProvider>
  );
}
