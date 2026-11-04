import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { QuoteAgentFab } from "@/components/quote-agent-fab";
import { ToastProvider } from "@/components/app-toast";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <AppNav email={session.user?.email ?? ""} />
        <main className="mx-auto flex min-h-0 w-full max-w-[110rem] flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-4 lg:px-5">
          {children}
        </main>
        <QuoteAgentFab />
      </div>
    </ToastProvider>
  );
}
