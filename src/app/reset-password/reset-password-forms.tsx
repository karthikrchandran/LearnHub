"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/modules/auth/server-actions";

const initialState: ActionResult = {
  status: "success",
  message: "",
};

function ActionMessage({ state }: { state: ActionResult }) {
  if (!state.message) {
    return null;
  }

  return (
    <p role="status" className={state.status === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-700"}>
      {state.message}
    </p>
  );
}

export function ResetPasswordRequestForm({
  action,
}: {
  action: (previousState: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-md border border-slate-200 p-5">
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
      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
      >
        {isPending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordCompletionForm({
  token,
  action,
}: {
  token: string;
  action: (previousState: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-md border border-slate-200 p-5">
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
      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
      >
        {isPending ? "Resetting..." : "Reset password"}
      </button>
    </form>
  );
}
