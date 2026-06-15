import Link from "next/link";
import type { ReactNode } from "react";

import { LogoffLink } from "./logoff-link";
import { courseToneForCategory, type CourseTone } from "./learnhub-tokens";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

type AdminNavKey =
  | "dashboard"
  | "courses"
  | "create-course"
  | "video-content"
  | "scorm-packages"
  | "catalog"
  | "library"
  | "users"
  | "bulk-users"
  | "user-lifecycle"
  | "remove-access"
  | "assignments"
  | "bulk-assignments"
  | "reports"
  | "certificates"
  | "credentials"
  | "notifications"
  | "settings";

type NavGroup = {
  label: string;
  items: NavItem[];
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
          <div className="lh-side-footer">
            <LogoffLink />
          </div>
        </aside>
        <section className="lh-main">{children}</section>
      </div>
    </main>
  );
}

export function ManagerAppShell({
  organizationName,
  slug,
  active,
  children,
}: {
  organizationName: string;
  slug: string;
  active: "team" | "assignments" | "reports";
  children: ReactNode;
}) {
  const navItems: NavItem[] = [
    { label: "Team", href: `/org/${slug}/manager`, active: active === "team" },
    { label: "Assignments", href: `/org/${slug}/manager/assignments`, active: active === "assignments" },
    { label: "Reports", href: `/org/${slug}/manager/reports`, active: active === "reports" },
    { label: "Profile", href: `/org/${slug}`, active: false },
  ];

  return (
    <main>
      <div className="lh-learner-shell lh-manager-shell">
        <aside className="lh-side">
          <div className="lh-brand">
            <BrandMark label={organizationName} />
            <span className="lh-brand-name">{organizationName}</span>
          </div>
          <div className="lh-side-kicker">Manager workspace</div>
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
          <div className="lh-side-footer">
            <LogoffLink />
          </div>
        </aside>
        <section className="lh-main">{children}</section>
      </div>
    </main>
  );
}

export function AdminAppShell({
  organizationName,
  slug,
  active,
  children,
}: {
  organizationName: string;
  slug: string;
  active: AdminNavKey;
  children: ReactNode;
}) {
  const navGroups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { label: "Dashboard", href: `/org/${slug}/admin`, active: active === "dashboard" },
        { label: "Reports", href: `/org/${slug}/admin/reports`, active: active === "reports" },
        { label: "Settings", href: `/org/${slug}/admin/settings`, active: active === "settings" },
      ],
    },
    {
      label: "Courses",
      items: [
        { label: "Courses", href: `/org/${slug}/admin/courses`, active: active === "courses" },
        { label: "Create Course", href: `/org/${slug}/admin/courses/new`, active: active === "create-course" },
        { label: "Video Content", href: `/org/${slug}/admin/courses/video`, active: active === "video-content" },
        { label: "SCORM Packages", href: `/org/${slug}/admin/courses/scorm`, active: active === "scorm-packages" },
        { label: "Catalog Setup", href: `/org/${slug}/admin/catalog`, active: active === "catalog" },
        { label: "Library", href: `/org/${slug}/admin/library`, active: active === "library" },
      ],
    },
    {
      label: "Users",
      items: [
        { label: "Users", href: `/org/${slug}/admin/users`, active: active === "users" },
        { label: "Bulk User Import", href: `/org/${slug}/admin/users/import`, active: active === "bulk-users" },
        { label: "User Lifecycle", href: `/org/${slug}/admin/users/lifecycle`, active: active === "user-lifecycle" },
        { label: "Remove Access", href: `/org/${slug}/admin/users/remove`, active: active === "remove-access" },
      ],
    },
    {
      label: "Assignments",
      items: [
        { label: "Assignments", href: `/org/${slug}/admin/assignments`, active: active === "assignments" },
        { label: "Bulk Assignments", href: `/org/${slug}/admin/assignments/bulk`, active: active === "bulk-assignments" },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Certificates", href: `/org/${slug}/admin/certificates`, active: active === "certificates" },
        { label: "Credentials", href: `/org/${slug}/admin/credentials`, active: active === "credentials" },
        { label: "Notifications", href: `/org/${slug}/admin/notifications`, active: active === "notifications" },
      ],
    },
  ];

  return (
    <main>
      <div className="lh-learner-shell lh-admin-shell">
        <aside className="lh-side">
          <div className="lh-brand">
            <BrandMark label={organizationName} />
            <span className="lh-brand-name">{organizationName}</span>
          </div>
          <div className="lh-side-kicker">Admin workspace</div>
          <nav className="lh-side-nav" aria-label="Admin">
            {navGroups.map((group) => (
              <div className="lh-side-section" key={group.label}>
                <div className="lh-side-section-title">{group.label}</div>
                {group.items.map((item) => (
                  <Link
                    aria-current={item.active ? "page" : undefined}
                    key={item.href + item.label}
                    className={item.active ? "active" : undefined}
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="lh-side-footer">
            <LogoffLink />
          </div>
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
