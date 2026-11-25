import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-2xl border border-light-green/25 bg-white/80 px-6 py-16 text-center shadow-[0_8px_30px_rgba(11,43,38,0.06)]">
      <p className="text-sm font-semibold text-dark-primary">Page not found</p>
      <p className="mt-2 text-sm text-mid-green">
        This route is not part of QuoteFlow yet, or the link may be outdated.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-mid-green px-4 text-sm font-medium text-background hover:bg-dark-secondary"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}