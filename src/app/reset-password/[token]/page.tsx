type ResetPasswordPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Password reset</p>
        <h1 className="text-3xl font-semibold text-slate-950">Choose new password</h1>
        <p className="text-sm text-slate-600">Set a new password for your LearnHub account.</p>
      </header>
      <form method="post" className="space-y-4 rounded-md border border-slate-200 p-5">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-slate-800">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <button type="submit" className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
          Reset password
        </button>
      </form>
    </main>
  );
}
