import Link from "next/link";
import type { ReactNode } from "react";

import { courseToneForCategory, type CourseTone } from "./learnhub-tokens";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export function BrandMark({ label = "L" }: { label?: string }) {
  return <span className="lh-mark">{label.slice(0, 1).toUpperCase()}</span>;
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
  const className = `lh-button lh-button-${variant}`;

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
    { label: "Profile", href: `/org/${slug}`, active: false },
  ];

  return (
    <main>
      <div className="lh-learner-shell">
        <aside className="lh-side">
          <div className="lh-brand">
            <BrandMark label={organizationName} />
            <span className="lh-brand-name">{organizationName}</span>
          </div>
          <nav className="lh-side-nav">
            {navItems.map((item) => (
              <Link
                aria-current={item.active ? "page" : undefined}
                key={item.href}
                className={item.active ? "active" : undefined}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="lh-main">{children}</section>
      </div>
    </main>
  );
}

export function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: CourseTone }) {
  return <span className={`lh-tag lh-tag-${tone}`}>{children}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className="lh-progress-line"
      role="progressbar"
    >
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export function CourseCover({
  title,
  categorySlug,
  label,
}: {
  title: string;
  categorySlug?: string | null;
  label?: string;
}) {
  const tone = courseToneForCategory(categorySlug);

  return (
    <div className={`lh-course-cover lh-tone-${tone}`}>
      {label ? <span className="lh-course-cover-label">{label}</span> : null}
      <h3>{title}</h3>
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
  label,
}: {
  title: string;
  description: string;
  categorySlug?: string | null;
  meta: string[];
  progressPercent?: number;
  action: ReactNode;
  label?: string;
}) {
  return (
    <article className="lh-learn-card">
      <CourseCover title={title} categorySlug={categorySlug} label={label} />
      <div className="lh-learn-card-body">
        <div className="min-w-0">
          <h3 className="lh-card-title">{title}</h3>
          <p className="lh-card-copy">{description}</p>
        </div>
        <div className="lh-meta">
          {meta.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
        {typeof progressPercent === "number" ? <ProgressBar value={progressPercent} /> : null}
        <div style={{ marginTop: "auto" }}>{action}</div>
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
    <section className="lh-empty-state">
      <h3 className="lh-card-title">{title}</h3>
      <p className="lh-card-copy">{body}</p>
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
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
    <article className="lh-certificate">
      <div className="lh-cert-badge">{locked ? "LOCKED" : "CERT"}</div>
      <div className="min-w-0">
        <h3 className="lh-card-title">{title}</h3>
        <p className="lh-card-copy">{body}</p>
      </div>
      <div>{action}</div>
    </article>
  );
}
