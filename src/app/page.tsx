import { BrandMark, CourseCard, PrimaryButton } from "./ui/learnhub-components";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3 text-xl font-black text-[var(--learnhub-ink)]">
          <BrandMark />
          LearnHub
        </div>
        <nav className="hidden items-center gap-6 text-sm font-bold text-[var(--learnhub-muted-strong)] md:flex">
          <span>Courses</span>
          <span>For teams</span>
          <span>Certificates</span>
          <PrimaryButton href="/login" variant="light">
            Sign in
          </PrimaryButton>
        </nav>
      </header>
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">
            Team learning that feels like a course business
          </p>
          <h1 className="mt-3 max-w-4xl text-5xl font-black leading-tight text-[var(--learnhub-ink)]">
            Launch branded learning programs without handing learners a spreadsheet.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--learnhub-muted-strong)]">
            LearnHub gives each organization a polished course site, structured lessons, assessments,
            progress, and certificates while admins keep control of assignments and reporting.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <PrimaryButton href="/login">Sign in to your school</PrimaryButton>
            <PrimaryButton href="/org/acme/learn" variant="light">
              Preview Acme demo
            </PrimaryButton>
          </div>
        </div>
        <CourseCard
          action={
            <PrimaryButton href="/login" variant="blue">
              Continue lesson
            </PrimaryButton>
          }
          categorySlug="security"
          description="Assigned learning with lessons, a required assessment, and certificate eligibility."
          meta={["5 lessons", "45 min", "Certificate"]}
          progressPercent={58}
          title="Workplace Security Basics"
        />
      </section>
    </main>
  );
}
