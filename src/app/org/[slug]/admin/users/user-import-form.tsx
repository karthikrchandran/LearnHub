"use client";

import { useActionState } from "react";

import type { UserImportActionResult } from "@/modules/users/server-actions";

const initialState: UserImportActionResult = {
  status: "success",
  message: "",
};

export function UserImportForm({
  validateAction,
  importAction,
}: {
  validateAction: (previousState: UserImportActionResult, formData: FormData) => Promise<UserImportActionResult>;
  importAction: (previousState: UserImportActionResult, formData: FormData) => Promise<UserImportActionResult>;
}) {
  const [validationState, validateFormAction, isValidating] = useActionState(validateAction, initialState);
  const [importState, importFormAction, isImporting] = useActionState(importAction, initialState);
  const latestState = importState.message ? importState : validationState;
  const expectedColumns = "email,firstName,lastName,role,managerEmail,employeeId,department,title,status";

  return (
    <form className="space-y-4 rounded-md border border-slate-200 p-5">
      <div className="space-y-2">
        <label htmlFor="userCsv" className="block text-sm font-medium text-slate-800">
          CSV import
        </label>
        <textarea
          id="userCsv"
          name="userCsv"
          rows={12}
          spellCheck={false}
          aria-describedby="expected-columns"
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-950"
        />
      </div>
      <p id="expected-columns" className="text-sm text-slate-600">
        Expected columns: <code className="font-mono text-slate-800">{expectedColumns}</code>
      </p>
      {latestState.message ? (
        <p role="status" className={latestState.status === "error" ? "text-sm font-medium text-red-700" : "text-sm font-medium text-emerald-700"}>
          {latestState.message}
        </p>
      ) : null}
      {latestState.plan?.errors.length ? (
        <ul className="space-y-1 text-sm text-red-700">
          {latestState.plan.errors.map((error) => (
            <li key={`${error.rowNumber}-${error.field}-${error.message}`}>
              Row {error.rowNumber}, {error.field}: {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          formAction={validateFormAction}
          disabled={isValidating}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:text-slate-400"
        >
          {isValidating ? "Validating..." : "Validate CSV"}
        </button>
        <button
          type="submit"
          formAction={importFormAction}
          disabled={isImporting}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
        >
          {isImporting ? "Importing..." : "Import users"}
        </button>
      </div>
    </form>
  );
}
