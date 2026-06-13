import Link from "next/link";
import type { ReactNode } from "react";

import { courseGradientForCategory } from "./learnhub-tokens";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export function BrandMark({ label = "L" }: { label?: string }) {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--learnhub-blue)] text-sm font-black text-white">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PrimaryButton({
  href,
  children,
  variant = "dark",
}: {
  href: string;
  children: ReactNode;
  variant?: "dark" | "blue" | "light";
}) {
  const className =
    variant === "light"
      ? "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--learnhub-line)] bg-white px-4 text-sm font-bold text-[var(--learnhub-ink)]"
      : variant === "blue"
        ? "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--learnhub-blue)] px-4 text-sm font-bold text-white"
        : "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--learnhub-ink)] px-4 text-sm font-bold text-white";

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

export function LearnerAppShell({
  organizationName,
  slug,
  active,
  children,
}: {
  organizationName: string;
  slug: string;
  active: "courses" | "catalog" | "assessments" | "certificates";
  children: ReactNode;
}) {
  const navItems: NavItem[] = [
    { label: "My Courses", href: `/org/${slug}/learn`, active: active === "courses" },
    { label: "Catalog", href: `/org/${slug}/learn/catalog`, active: active === "catalog" },
    { label: "Assessments", href: `/org/${slug}/learn/assessments`, active: active === "assessments" },
    { label: "Certificates", href: `/org/${slug}/certificates`, active: active === "certificates" },
  ];

  return (
    <main className="min-h-screen bg-[var(--learnhub-app)]">
      <div className="grid min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="bg-[var(--learnhub-ink)] px-4 py-6 text-slate-300">
          <div className="mb-8 flex items-center gap-3 text-lg font-black text-white">
            <BrandMark label={organizationName} />
            {organizationName}
          </div>
          <nav className="grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                className={
                  item.active
                    ? "rounded-xl bg-white px-3 py-3 text-sm font-bold text-[var(--learnhub-ink)]"
                    : "rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/10"
                }
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="px-5 py-6 lg:px-8">{children}</section>
      </div>
    </main>
  );
}

export function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "teal" | "green" | "amber" | "rose" }) {
  const classes = {
    blue: "bg-blue-50 text-blue-800",
    teal: "bg-teal-50 text-teal-800",
    green: "bg-green-50 text-green-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
      <span className="block h-full rounded-full bg-[var(--learnhub-teal)]" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export function CourseCover({ title, categorySlug }: { title: string; categorySlug?: string | null }) {
  return (
    <div className={`flex h-32 items-end bg-gradient-to-br ${courseGradientForCategory(categorySlug)} p-4 text-white`}>
      <h3 className="text-xl font-black leading-tight">{title}</h3>
    </div>
  );
}

export function CourseCard({
  title,
  description,
  categorySlug,
  meta,
  progressPercent,
  action,
}: {
  title: string;
  description: string;
  categorySlug?: string | null;
  meta: string[];
  progressPercent?: number;
  action: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--learnhub-line)] bg-white shadow-[0_16px_40px_rgba(22,34,58,0.08)]">
      <CourseCover title={title} categorySlug={categorySlug} />
      <div className="grid min-h-56 gap-3 p-4">
        <div>
          <h3 className="text-lg font-black text-[var(--learnhub-ink)]">{title}</h3>
          <p className="mt-2 text-sm text-[var(--learnhub-muted)]">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
        {typeof progressPercent === "number" ? <ProgressBar value={progressPercent} /> : null}
        <div className="mt-auto">{action}</div>
      </div>
    </article>
  );
}

export function EmptyActionState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[var(--learnhub-line)] bg-white p-6">
      <h3 className="text-lg font-black text-[var(--learnhub-ink)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--learnhub-muted)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

export function CertificateCard({
  title,
  body,
  action,
  locked = false,
}: {
  title: string;
  body: string;
  action: ReactNode;
  locked?: boolean;
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-[var(--learnhub-line)] bg-white p-4 shadow-[0_14px_36px_rgba(22,34,58,0.07)] md:grid-cols-[6rem_minmax(0,1fr)_auto] md:items-center">
      <div className="grid h-20 place-items-center rounded-2xl bg-gradient-to-br from-[#f5b544] to-[#235bdb] text-sm font-black text-white">
        {locked ? "LOCKED" : "CERT"}
      </div>
      <div>
        <h3 className="text-lg font-black text-[var(--learnhub-ink)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--learnhub-muted)]">{body}</p>
      </div>
      <div>{action}</div>
    </article>
  );
}
