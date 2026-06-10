export default function NewOrganizationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">New organization</h1>
      </header>
      <div className="grid gap-5 rounded-md border border-slate-200 p-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="name" className="block text-sm font-medium text-slate-800">
            Organization name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="slug" className="block text-sm font-medium text-slate-800">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="allowedEmailDomains" className="block text-sm font-medium text-slate-800">
            Allowed domains
          </label>
          <input
            id="allowedEmailDomains"
            name="allowedEmailDomains"
            placeholder="acme.test, acme.com"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="logoUrl" className="block text-sm font-medium text-slate-800">
            Logo URL
          </label>
          <input
            id="logoUrl"
            name="logoUrl"
            type="url"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="primaryColor" className="block text-sm font-medium text-slate-800">
            Primary color
          </label>
          <input
            id="primaryColor"
            name="primaryColor"
            type="color"
            defaultValue="#2563eb"
            className="h-10 w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="accentColor" className="block text-sm font-medium text-slate-800">
            Accent color
          </label>
          <input
            id="accentColor"
            name="accentColor"
            type="color"
            defaultValue="#14b8a6"
            className="h-10 w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="enrollmentPolicy" className="block text-sm font-medium text-slate-800">
            Enrollment policy
          </label>
          <select
            id="enrollmentPolicy"
            name="enrollmentPolicy"
            defaultValue="ASSIGNMENT_ONLY"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
          >
            <option value="ASSIGNMENT_ONLY">Assignment only</option>
            <option value="ASSIGNMENT_AND_SELF_ENROLLMENT">Assignment and self-enrollment</option>
          </select>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-800 md:col-span-2">
          <input
            name="globalLibraryEnabled"
            type="checkbox"
            value="true"
            className="h-4 w-4 rounded border-slate-300"
          />
          Global library enabled
        </label>
        <div className="md:col-span-2">
          <button type="button" disabled className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500">
            Organization creation coming soon
          </button>
        </div>
      </div>
    </main>
  );
}
