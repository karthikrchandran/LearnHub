import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">LearnHub</p>
        <h1 className="text-4xl font-semibold text-slate-950">Commercial LMS foundation</h1>
        <p className="max-w-2xl text-base text-slate-600">
          Tenant-first learning platform foundation for platform owners, organization admins,
          managers, and learners.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" href="/platform">
          Platform
        </Link>
        <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800" href="/org/acme">
          Acme workspace
        </Link>
      </div>
    </main>
  );
}
