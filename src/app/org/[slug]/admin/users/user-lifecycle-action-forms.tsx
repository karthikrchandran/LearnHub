"use client";

import { useActionState, type ReactNode } from "react";

import type { UserLifecycleActionResult } from "@/modules/users/server-actions";

const initialState: UserLifecycleActionResult = {
  status: "success",
  message: "",
};

function ActionStatus({ state }: { state: UserLifecycleActionResult }) {
  return state.message ? (
    <p
      role="status"
      className={state.status === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-700"}
    >
      {state.message}
    </p>
  ) : null;
}

export function UserLifecycleActionForm({
  action,
  children,
  className,
  disabled = false,
  pendingLabel,
  submitLabel,
}: {
  action: (previousState: UserLifecycleActionResult, formData: FormData) => Promise<UserLifecycleActionResult>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pendingLabel: string;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={className}>
      {children}
      <ActionStatus state={state} />
      <div className="flex items-end">
        <button
          type="submit"
          disabled={disabled || isPending}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function UserInlineActionForm({
  action,
  children,
  className,
}: {
  action: (previousState: UserLifecycleActionResult, formData: FormData) => Promise<UserLifecycleActionResult>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className={className}>
      {children}
      <ActionStatus state={state} />
    </form>
  );
}
