import { BrandMark } from "../ui/learnhub-components";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_30rem]">
      <section className="hidden bg-[var(--learnhub-ink)] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-xl font-black">
          <BrandMark />
          LearnHub
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-teal-200">Acme Learning</p>
          <h1 className="mt-3 text-5xl font-black leading-tight">
            Return to your courses, assessments, and certificates.
          </h1>
          <p className="mt-5 max-w-xl text-base text-slate-300">
            Your school workspace keeps assigned courses, progress, and credentials in one place.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <header className="mb-6">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">
              Welcome back to LearnHub
            </p>
            <h1 className="mt-2 text-3xl font-black text-[var(--learnhub-ink)]">Sign in</h1>
            <p className="mt-2 text-sm text-[var(--learnhub-muted)]">
              Use your organization credentials to continue learning.
            </p>
          </header>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
