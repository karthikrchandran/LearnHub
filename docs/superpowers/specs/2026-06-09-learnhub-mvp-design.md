# LearnHub MVP Design

Date: 2026-06-09

## Purpose

LearnHub is a commercial, multi-tenant learning management system for customer organizations. It supports tenant-specific learning catalogs, organization-scoped users, course assignment, video and SCORM learning experiences, progress tracking, certificates, credential issuing, reminders, escalations, and reporting.

The MVP is designed as a production-shaped modular monolith. Billing, custom domains, SSO, SCORM 2004, cmi5, full xAPI package support, and advanced recommendation engines are deferred.

## Product Scope

Each customer company is represented as an `Organization`. An organization owns its users, branding, courses, catalog taxonomy, assignments, progress, reports, certificates, and credentials.

The platform supports two organization enrollment policies:

- Assignment only.
- Assignment plus learner self-enrollment.

Organization access uses routes like `/org/{slug}`. Custom organization subdomains are future scope.

## Roles

### Platform Owner

The Platform Owner manages the commercial platform across all organizations. The Platform Owner can:

- Create and edit organizations.
- Configure organization name, logo, primary color, and accent color.
- Configure organization enrollment policy.
- Enable or disable access to the global course library.
- Import users for any organization.
- Create tenant-specific catalogs and courses during tenant provisioning.
- View aggregate platform usage.
- View lightweight audit logs across organizations.

### Organization Admin

The Organization Admin manages one organization. The Organization Admin can:

- Import and manage users inside the organization.
- Manage organization branding if allowed.
- Create and edit categories, tags, courses, assignments, reports, and certificates.
- Assign courses to any learner in the organization.
- View organization-wide progress and reports.
- View organization audit logs.

### Manager

The Manager can:

- View progress only for directly assigned employees.
- Assign courses only to direct reports.
- View direct-report completion, score, timing, certificates, and overdue status.
- Receive escalation emails for overdue direct reports.

Managers do not see organization-wide users or reports unless they also have an admin role.

### Learner

The Learner can:

- View assigned courses.
- Self-enroll in available courses when the organization allows it.
- Complete native video and SCORM courses.
- Resume learning.
- View progress and certificates.
- Print, download, verify, and share certificates.
- See related course recommendations.

## Tenant Catalogs And Global Library

Tenant-specific catalogs are the default model. Each organization owns its own categories, tags, courses, assignments, and learning records.

The platform can also maintain a global course library. When global library access is enabled for an organization, global courses can be copied into that organization's catalog. The copied course becomes tenant-owned and can be customized without affecting the global version.

Global library courses may carry suggested categories and tags. Once copied, those categories and tags are tenant-specific.

Related course recommendations are generated from tenant-specific category and tag overlap. The MVP recommendation rule favors shared categories first, then shared tags, and excludes already completed courses unless retake behavior is later added.

## Course Lifecycle

Courses use this lifecycle:

```text
Draft -> Published -> Deprecated -> Retired
```

- `Draft`: editable, hidden from learners, and not assignable.
- `Published`: visible, assignable, and enrollable based on organization policy.
- `Deprecated`: existing learners can continue. New assignment or enrollment is blocked unless explicitly overridden by an admin.
- `Retired`: no new launch, assignment, or enrollment. Historical progress, reports, and certificates remain available.

Published courses can be edited directly. Version history, approval workflows, and draft copies for published edits are out of scope for MVP.

## Course Types

LearnHub supports two MVP course types:

- Native video course.
- SCORM 1.2 course.

### Native Video Course

A native video course can be either:

- A single video course with chapters.
- A module-based course containing multiple video lessons.

Each video lesson supports:

- Mux-backed video upload, processing, streaming, and playback.
- Uploaded WebVTT (`.vtt`) transcript.
- Admin-defined chapters or segments.
- Pause and resume.
- Synced transcript while the video plays.
- Click transcript line to seek to that timestamp.
- Keyword search over transcript text.
- Timestamped search results that jump into the video.
- Embedded knowledge checks.

LearnHub stores video metadata and player state, while Mux stores and streams the video asset.

### SCORM 1.2 Course

A SCORM course is represented by one uploaded SCORM 1.2 package. The package can represent an entire course with its own internal modules and navigation.

SCORM MVP behavior:

- Admin uploads a SCORM 1.2 `.zip`.
- LearnHub stores the package in Cloudflare R2.
- LearnHub validates package type, `imsmanifest.xml`, and launch file presence.
- LearnHub extracts package files to tenant-scoped storage.
- Learners launch the package in a SCORM player.
- LearnHub records raw SCORM runtime events and normalized progress fields.
- LearnHub supports suspend/resume using SCORM runtime data.

SCORM reporting is course-level for MVP:

- Status.
- Completion.
- Pass/fail.
- Score.
- Total time.
- Last location.
- Suspend/resume data.

LearnHub shows estimated SCORM progress percentage to learners, managers, admins, and platform owners. Estimated progress uses available SCORM signals and the course's expected duration. It is capped at 95 percent until SCORM reports `completed` or `passed`; actual completion sets progress to 100 percent.

Module-level SCORM reporting is out of scope unless a package reports it cleanly.

SCORM 2004, cmi5, and full xAPI package support are future scope.

## Knowledge Checks

Knowledge checks are embedded in native video learning flows. They are not a separate MVP lesson type.

Supported MVP question types:

- Multiple choice, single answer.
- Multiple choice, multiple answer.
- True/false.

Each question or answer can optionally include feedback:

- Explanation for correct answers.
- Justification for wrong answers.
- Additional learning context.

Feedback is optional. Admins may leave it blank.

Retry behavior is modeled for configurability, but MVP behavior is unlimited retries. Attempt history is stored for analytics.

Knowledge-check results feed scoring reports and quiz difficulty reports.

## Assignments And Due Dates

Admins can assign courses to any learner in their organization. Managers can assign courses only to direct reports. Learners can self-enroll only when the organization policy allows self-enrollment.

Assignments have a start date. Courses define `estimatedCompletionBusinessDays`. LearnHub calculates due dates as:

```text
dueDate = startDate + estimatedCompletionBusinessDays
```

Business days are Monday through Friday. Weekends are skipped. Public holidays and tenant-specific holiday calendars are future scope.

## Progress And Completion

Native video course progress is exact. Required videos, modules, lessons, chapters, and knowledge checks drive completion.

Native module completion requires 100 percent completion of required lesson and check items. Native course completion requires 100 percent completion of required modules or lessons.

SCORM course progress is estimated until the SCORM package reports completion or pass status. SCORM progress reaches 100 percent only when the package reports `completed` or `passed`.

Course completion automatically triggers certificate generation and optional credential issuing.

## Certificates And Credentials

When a learner completes a course:

- LearnHub generates a certificate.
- The learner can print and download the certificate.
- LearnHub creates a public certificate verification URL.
- The learner can share the certificate socially.
- If the course has Credly configured, LearnHub automatically issues the Credly badge.

Credly issuance is provider-backed and tracked separately from course completion. If Credly issuing fails, course completion remains valid and admins can inspect or retry the failed issuance.

The credential integration model should allow other credential providers to be added later.

## Users And Authentication

MVP user access is invitation/import only. There is no public self-signup.

User provisioning:

- Platform Owner can import users for any organization.
- Organization Admin can import users inside one organization.
- CSV import is the MVP provisioning path.
- CSV import validates rows before creating or updating users.
- Row-level errors are shown before final import.
- Manager relationships are created using `managerEmail`.

Recommended CSV columns:

```text
email, firstName, lastName, role, managerEmail, employeeId, department, title, status
```

Authentication:

- Email/password login.
- Invitation activation flow.
- Password reset.
- Organizational email required.
- Login only works for users already invited or imported.

Social login, public self-signup, SSO, and directory sync are future scope.

Roles are organization-scoped except for Platform Owner. Users may hold role combinations when needed, such as admin plus manager.

## Email Provider

Email delivery uses a provider abstraction:

```text
EmailProvider = console | smtp | api-provider
```

MVP behavior:

- Local development can log invite and reset links to console.
- Demo or production can use SMTP.
- Other API-based transactional email providers can be added later without changing auth or notification logic.

## Notifications

Notifications are in MVP:

- Invitation emails.
- Password reset emails.
- Course assignment emails.
- Course completion and certificate emails.
- Learner reminder emails.
- Manager escalation emails.

Reminder and escalation timing is fixed for MVP.

Notification behavior:

- Assignment email sends when a course is assigned.
- Learner reminder sends before due date.
- Overdue reminder sends after due date if incomplete.
- Manager escalation sends after the overdue threshold if incomplete.
- Notification jobs are stored so failures can be inspected and retried.

Notification jobs should be idempotent where possible to avoid duplicate sends.

## Reporting And Analytics

Reports support dashboard views and CSV export. PDF report export is out of scope for MVP.

Reports include:

- Learner progress report.
- Manager direct-report progress view.
- Course completion report.
- Scoring report with average score.
- Timing report with average time.
- Popularity report with most viewed, most enrolled, most completed, and highest-rated courses.
- Satisfaction report using learner star ratings and feedback.
- Quiz difficulty report with harder questions, attempts, pass/fail rates, and commonly missed answers.
- Certificate and credential report, including Credly issue status.
- Platform owner aggregate dashboard across organizations.

Visibility rules:

- Learners see their own progress and certificates.
- Managers see direct reports only.
- Organization admins see their organization only.
- Platform owners see all organizations.

## Branding

MVP branding is intentionally simple:

- Organization name.
- Logo upload.
- Primary color.
- Accent color.

Branding is applied to the organization workspace shell. A full theme builder is future scope.

## Audit Logs

LearnHub includes lightweight audit logs for important platform and admin actions.

Audit log records include:

- Actor.
- Organization.
- Action type.
- Target type.
- Target id.
- Timestamp.
- Small metadata payload.

Tracked actions include organization changes, user imports, role changes, course lifecycle changes, assignments, certificate and credential issuance, SCORM package uploads, and important notification events.

This is not a full compliance-grade event-sourcing system.

## Architecture

LearnHub is a production modular monolith.

Core stack:

- Next.js.
- TypeScript.
- PostgreSQL.
- Prisma.
- Auth.js-style authentication flow.

Internal modules:

- Tenant.
- Users and auth.
- Catalog.
- Courses.
- Video.
- SCORM.
- Progress.
- Assignments.
- Knowledge checks.
- Reports.
- Certificates.
- Credentials.
- Notifications.
- Audit logs.

Provider abstractions:

- Video provider.
- Object storage provider.
- Email provider.
- Credential provider.

The architecture should keep module boundaries clear enough to split video, SCORM, reports, or credentialing into services later if customer scale requires it.

## Demo And Early Deployment

The demo and early production stack is:

```text
App: Vercel
Database: Neon Postgres
Video: Mux Free
File storage: Cloudflare R2
Queue/cache/jobs: Upstash
```

Storage split:

- Mux stores and streams uploaded videos.
- Cloudflare R2 stores SCORM packages, extracted SCORM files, logos, transcripts, certificates, CSV uploads, and CSV exports.

Background and scheduled work:

- SCORM package extraction and validation.
- Certificate generation.
- Credly badge issuing.
- Notification reminders and escalations.
- CSV export preparation when needed.

## Error Handling

The MVP should handle these failure modes explicitly:

- Tenant isolation must be enforced on every organization-scoped query.
- CSV imports validate before commit and show row-level errors.
- SCORM uploads validate manifest and launch file before publishing.
- Raw SCORM events are stored alongside normalized progress fields.
- Mux, R2, Credly, and email failures are stored with retry status.
- Notification jobs are idempotent where possible.
- Certificate and badge issuance failures do not remove course completion.
- Retired courses preserve historical progress and certificates but block new launch, enrollment, and assignment.

## Testing Strategy

Unit tests:

- Business-day due-date calculation.
- Permission checks.
- Tenant isolation helpers.
- Course completion rules.
- SCORM progress estimation.
- Quiz scoring.
- Related-course matching.
- Notification scheduling.

Integration tests:

- Auth and invitation flow.
- Password reset flow.
- CSV import.
- Course assignment.
- Progress updates.
- Certificate generation.
- Provider adapters.

End-to-end smoke tests:

- Platform owner provisions an organization.
- Organization admin imports users.
- Organization admin creates a native video course.
- Organization admin uploads a SCORM course.
- Learner completes a course.
- Manager reviews direct-report progress.
- Admin exports a report CSV.

Demo data:

- Platform owner.
- Sample organization.
- Organization admin.
- Manager with direct reports.
- Learners.
- Native video course.
- SCORM sample course.
- Sample reports and certificates.

## MVP Non-Goals

The MVP does not include:

- Billing or subscriptions.
- Custom domains or subdomains.
- SSO or directory sync.
- Public self-signup.
- Social login.
- SCORM 2004.
- cmi5.
- Full xAPI package support.
- Course version history.
- Approval workflows.
- Full theme builder.
- Holiday or tenant-specific business calendars.
- PDF report export.
- Advanced AI recommendations.

