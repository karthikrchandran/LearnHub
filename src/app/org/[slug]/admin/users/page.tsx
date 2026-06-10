type OrganizationUsersAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const expectedColumns = "email,firstName,lastName,role,managerEmail,employeeId,department,title,status";

export default async function OrganizationUsersAdminPage({ params }: OrganizationUsersAdminPageProps) {
  const { slug } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} users</h1>
      </header>
      <section className="rounded-md border border-slate-200 p-5">
        <form method="post" className="space-y-4">
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
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
              Validate CSV
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
            >
              Import users
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
