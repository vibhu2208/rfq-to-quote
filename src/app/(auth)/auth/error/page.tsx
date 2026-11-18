import Link from "next/link";
import { authErrorMessage } from "@/lib/auth-error";

type Props = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = params.error;
  const code = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-light-green/25 bg-white/80 p-8 shadow-[0_20px_50px_-24px_rgba(11,43,38,0.35)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mid-green">
          QuoteFlow
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-dark-primary">
          Sign-in didn’t finish
        </h1>
        <p role="alert" className="mt-3 text-sm leading-relaxed text-dark-primary">
          {authErrorMessage(code)}
        </p>
        {code ? (
          <p className="mt-2 text-xs text-mid-green">Error code: {code}</p>
        ) : null}
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-lg bg-mid-green px-4 py-2.5 text-sm font-semibold text-background hover:bg-dark-secondary"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
