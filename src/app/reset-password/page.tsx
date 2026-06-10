export default function ResetPasswordRequestPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Password reset</p>
        <h1 className="text-3xl font-semibold text-slate-950">Request reset link</h1>
        <p className="text-sm text-slate-600">Enter the email address for your LearnHub account.</p>
      </header>
      <form method="post" className="space-y-4 rounded-md border border-slate-200 p-5">
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
        <button type="submit" className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
          Send reset link
        </button>
      </form>
    </main>
  );
}
