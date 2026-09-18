import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-background">
      <AppNav />
      <main className="mx-auto flex w-full max-w-[110rem] min-h-0 flex-1 flex-col px-3 py-6 sm:px-4 lg:px-5 xl:px-6">
        {children}
      </main>
    </div>
  );
}
