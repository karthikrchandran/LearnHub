import { activateInvitationFormAction } from "./actions";
import { InviteActivationForm } from "./invite-activation-form";

type InviteActivationPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InviteActivationPage({ params }: InviteActivationPageProps) {
  const { token } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Invitation</p>
        <h1 className="text-3xl font-semibold text-slate-950">Activate account</h1>
        <p className="text-sm text-slate-600">Create a password to finish setting up your invited account.</p>
      </header>
      <InviteActivationForm token={token} action={activateInvitationFormAction} />
    </main>
  );
}
