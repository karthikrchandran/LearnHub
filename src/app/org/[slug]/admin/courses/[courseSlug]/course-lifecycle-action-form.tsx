"use client";

import { useActionState, type ReactNode } from "react";

import type { CatalogActionResult } from "@/modules/catalog/server-actions";

const initialState: CatalogActionResult = {
  status: "success",
  message: "",
};

export function CourseLifecycleActionForm({
  action,
  children,
}: {
  action: (previousState: CatalogActionResult, formData: FormData) => Promise<CatalogActionResult>;
  children: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="flex flex-wrap gap-3">{children}</div>
      {state.message ? (
        <p
          role="status"
          className={state.status === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-700"}
        >
          {state.message}
        </p>
      ) : null}
      {isPending ? <p className="text-sm text-slate-500">Updating lifecycle...</p> : null}
    </form>
  );
}
