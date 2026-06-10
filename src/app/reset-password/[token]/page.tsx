import { completePasswordResetFormAction } from "../actions";
import { ResetPasswordCompletionForm } from "../reset-password-forms";

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
      <ResetPasswordCompletionForm token={token} action={completePasswordResetFormAction} />
    </main>
  );
}
