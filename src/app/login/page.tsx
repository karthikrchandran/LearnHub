import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">LearnHub</p>
        <h1 className="text-3xl font-semibold text-slate-950">Sign in</h1>
        <p className="text-sm text-slate-600">Use the email and password from your organization invitation.</p>
      </header>
      <LoginForm />
    </main>
  );
}
