"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl bg-white/60 p-8 shadow-[0_8px_30px_rgba(11,43,38,0.08)]">
        <h1 className="text-2xl font-semibold text-dark-primary">QuoteFlow</h1>
        <p className="mt-1 text-sm text-mid-green">Sign in to manage products and quotes</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-dark-secondary">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-dark-secondary">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 outline-none focus:border-mid-green"
              required
            />
          </label>
          {error ? <p className="text-sm text-dark-primary">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-mid-green px-4 py-2.5 font-medium text-background transition hover:bg-dark-secondary disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
