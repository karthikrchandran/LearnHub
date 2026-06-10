"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/modules/auth/server-actions";

const initialState: ActionResult = {
  status: "success",
  message: "",
};

export function InviteActivationForm({
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
      {state.message ? (
        <p role="status" className={state.status === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-700"}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
      >
        {isPending ? "Activating..." : "Activate account"}
      </button>
    </form>
  );
}
