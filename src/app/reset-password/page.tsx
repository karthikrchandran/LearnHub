import { requestPasswordResetFormAction } from "./actions";
import { ResetPasswordRequestForm } from "./reset-password-forms";

export default function ResetPasswordRequestPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Password reset</p>
        <h1 className="text-3xl font-semibold text-slate-950">Request reset link</h1>
        <p className="text-sm text-slate-600">Enter the email address for your LearnHub account.</p>
      </header>
      <ResetPasswordRequestForm action={requestPasswordResetFormAction} />
    </main>
  );
}
