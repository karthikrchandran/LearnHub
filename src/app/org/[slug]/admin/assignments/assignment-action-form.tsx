"use client";

import { useActionState, type ReactNode } from "react";

import type { AssignmentActionResult } from "@/modules/assignments/server-actions";

const initialState: AssignmentActionResult = {
  status: "success",
  message: "",
};

export function AssignmentActionForm({
  action,
  children,
  className,
  pendingLabel,
  submitLabel,
}: {
  action: (previousState: AssignmentActionResult, formData: FormData) => Promise<AssignmentActionResult>;
  children: ReactNode;
  className?: string;
  pendingLabel: string;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.message ? (
        <p
          role="status"
          className={state.status === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-700"}
        >
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={isPending} className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400">
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
