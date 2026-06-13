"use client";

import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl: "/org",
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    window.location.assign(result?.url ?? "/org");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-[var(--learnhub-line)] bg-white p-5 shadow-[0_16px_40px_rgba(22,34,58,0.08)]">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-bold text-[var(--learnhub-ink)]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-xl border border-[var(--learnhub-line)] px-3 py-2 text-sm text-[var(--learnhub-ink)] outline-none focus:border-[var(--learnhub-blue)] focus:ring-2 focus:ring-[var(--learnhub-blue)]/20"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-bold text-[var(--learnhub-ink)]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-[var(--learnhub-line)] px-3 py-2 text-sm text-[var(--learnhub-ink)] outline-none focus:border-[var(--learnhub-blue)] focus:ring-2 focus:ring-[var(--learnhub-blue)]/20"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[var(--learnhub-ink)] px-4 text-sm font-bold text-white disabled:bg-slate-400"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
