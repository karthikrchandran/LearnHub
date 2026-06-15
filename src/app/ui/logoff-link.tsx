"use client";

import { signOut } from "next-auth/react";

export function LogoffLink() {
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Log off
    </button>
  );
}
