export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">LearnHub</p>
        <h1 className="text-3xl font-semibold text-slate-950">Sign in</h1>
        <p className="text-sm text-slate-600">Use the email and password from your organization invitation.</p>
      </header>
      <form action="/api/auth/callback/credentials" method="post" className="space-y-4 rounded-md border border-slate-200 p-5">
        <input type="hidden" name="callbackUrl" value="/platform" />
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-slate-800">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-slate-800">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <button type="submit" className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
          Sign in
        </button>
      </form>
    </main>
  );
}
