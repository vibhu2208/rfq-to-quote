"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 10% 20%, rgba(142,182,155,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 80%, rgba(35,83,71,0.12), transparent 50%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(11,43,38,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(11,43,38,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row lg:items-stretch">
        {/* Brand panel */}
        <section className="login-fade-up flex flex-1 flex-col justify-center px-8 py-10 sm:px-12 lg:px-16 lg:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mid-green">
            RFQ to Quote
          </p>
          <h1 className="mt-4 text-[clamp(2.75rem,8vw,4.5rem)] font-semibold leading-[0.95] tracking-tight text-dark-primary">
            QuoteFlow
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-mid-green sm:text-lg">
            Turn inbound requests into accurate quotes — catalog, pricing, and PDFs in one place.
          </p>
        </section>

        {/* Sign-in form */}
        <section className="login-fade-up login-fade-up-delay flex flex-1 items-center justify-center px-6 pb-12 pt-2 sm:px-10 lg:px-12 lg:py-16">
          <div className="w-full max-w-[400px]">
            <div className="rounded-2xl border border-light-green/25 bg-white/70 p-8 shadow-[0_20px_50px_-24px_rgba(11,43,38,0.35)] backdrop-blur-sm sm:p-9">
              <h2 className="text-xl font-semibold tracking-tight text-dark-primary">
                Sign in
              </h2>
              <p className="mt-1.5 text-sm text-mid-green">
                Access your workspace to manage products and quotes.
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-5">
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-dark-secondary">Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-light-green/40 bg-background/80 px-3.5 py-2.5 text-dark-primary outline-none transition placeholder:text-light-green focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-dark-secondary">Password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-light-green/40 bg-background/80 px-3.5 py-2.5 text-dark-primary outline-none transition placeholder:text-light-green focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                    required
                  />
                </label>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200/80 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full rounded-lg bg-mid-green px-4 py-3 text-sm font-semibold text-background shadow-[0_8px_20px_-8px_rgba(35,83,71,0.7)] transition hover:bg-dark-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mid-green disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-mid-green/80">
              Team access only · QuoteFlow
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
