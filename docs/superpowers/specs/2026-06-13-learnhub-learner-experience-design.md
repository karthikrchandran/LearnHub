# LearnHub Learner Experience Design

Date: 2026-06-13
Status: Approved visual direction, pending implementation plan

## Context

The current LearnHub UI is technically functional but reads as an internal scaffold. The public landing page, tenant entry page, learner catalog, course runtime, assessments, and certificates do not yet feel like a polished commercial LMS. The user approved the visual mockup direction shown in the local companion board and added one explicit requirement: colors must stay consistent across pages.

This design replaces the scaffold feel with a learner-first LMS experience inspired by modern course platforms such as Thinkific and Teachable, while preserving LearnHub's commercial multi-tenant model, organization routing, invited users, assignments, assessments, and certificates.

## Goals

- Make the first impression feel like a real course platform, not a blank admin scaffold.
- Separate public, learner, organization admin, and platform owner surfaces.
- Provide complete learner navigation: My Courses, Catalog, Course Page, Lesson Page, Assessments, and Certificates.
- Avoid empty tabs and placeholder pages.
- Use one consistent LearnHub color system across all pages.
- Use real seeded demo data so local launch looks complete.
- Keep implementation aligned with existing Next.js, Prisma, and module boundaries.

## Non-Goals

- Public self-signup.
- Billing, checkout, coupon, tax, or creator revenue workflows.
- SCORM 2004, cmi5, or xAPI.
- Full production media hosting beyond existing provider abstractions.
- Replacing the admin/reporting feature set; admin pages should be visually improved only where needed for navigation consistency.

## Approved Visual Direction

The product should feel learner-first and polished, with a warm but professional learning surface. The design should use course imagery bands, strong progress states, clear calls to action, and distinct learner navigation. Admin and platform pages should remain quieter and operational, but they must still use the same base visual system.

## Shared Color System

All pages must use a shared palette and tokens rather than ad hoc Tailwind color combinations.

Core palette:

- Ink: `#111827` for primary text and dark primary buttons.
- Muted text: `#667085` and `#475467`.
- Page background: warm off-white `#fffaf0` blended into light app gray `#f6f8fb`.
- Surface: `#ffffff`.
- Border: `#d7dce5` or equivalent low-contrast slate border.
- Primary blue: `#235bdb`.
- Accent teal: `#12b8a6`.
- Success green: `#1b8a5a`.
- Warning amber: `#f5b544`.
- Attention rose: `#d94a64`.
- Secondary violet: `#7457d5`.

Rules:

- Landing, learner home, catalog, course overview, lesson, assessments, and certificates must share the same palette.
- Course cover gradients may vary by course category, but they must be built from the approved palette.
- Primary action buttons use Ink or Primary Blue.
- Progress uses Accent Teal, Success Green, and Warning Amber depending on state.
- Avoid blank white full-page layouts; each major page needs a deliberate background, header treatment, or app shell.
- Avoid introducing unrelated purple-heavy, beige-only, or dark-slate-only themes.

## Information Architecture

Public routes:

- `/` - public LearnHub landing page.
- `/login` - branded school login.

Tenant learner routes:

- `/org/[slug]` - role-aware tenant entry page.
- `/org/[slug]/learn` - My Courses learner home.
- `/org/[slug]/learn/catalog` - course catalog.
- `/org/[slug]/learn/courses/[courseSlug]` - course overview.
- `/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]` - lesson player.
- `/org/[slug]/learn/assessments` - assessment center.
- `/org/[slug]/certificates` - certificate wallet.

Existing runtime routes may remain as compatibility redirects during implementation:

- `/org/[slug]/learn/[courseSlug]`
- `/org/[slug]/learn/[courseSlug]/scorm`

Admin/platform routes:

- `/org/[slug]/admin/*` - organization admin console.
- `/platform/*` - platform owner console.

Admin and platform pages must not be presented as the learner default experience.

## Route Behavior

`/`:

- Shows a polished public landing page.
- Contains top navigation, a strong learner/course value proposition, course preview, and clear sign-in action.
- Does not show confusing "Platform" and "Acme workspace" buttons as equivalent choices.
- May offer a demo preview CTA, but it should be clearly labeled as a demo.

`/login`:

- Uses the shared visual system.
- Presents the form as a school sign-in experience.
- Keeps the existing credentials flow.

`/org/[slug]`:

- Learner-only users are sent to `/org/[slug]/learn`.
- Admin or manager users see a tenant workspace page with separated choices:
  - Learner experience.
  - Admin console.
  - Reports.
- Platform owners remain directed to `/platform`.

`/org/[slug]/learn`:

- Becomes My Courses, not a generic catalog.
- Shows a welcome header, continue-learning panel, assigned courses, in-progress courses, completed courses, and recommended available courses.
- Every course card has a clear action: Resume, Start, View Course, Enroll, View Certificate.

`/org/[slug]/learn/catalog`:

- Shows all published courses visible to the learner.
- Includes category filters, certificate-eligible filter, duration/level metadata, search affordance, and enrollment state.
- No blank catalog state in the seeded demo.

`/org/[slug]/learn/courses/[courseSlug]`:

- Shows course description, category, duration, due date, enrollment/assignment state, progress, curriculum, assessment requirements, and certificate eligibility.
- Launches the next lesson or allows enrollment when allowed.

`/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]`:

- Shows lesson outline, video/content area, chapters, transcript summary, next lesson, and knowledge check entry.
- Keeps progress persistence through existing runtime services.

`/org/[slug]/learn/assessments`:

- Shows pending required assessments, available optional checks, and completed attempts.
- Includes scores, pass/fail state, feedback availability, and course association.
- Assessments must not be hidden only below a video player.

`/org/[slug]/certificates`:

- Shows earned certificates plus locked/upcoming certificates.
- Empty state must explain how to earn a certificate and show certificate-eligible courses.
- Earned certificates include verify and download actions.

## No Empty Tabs Or Placeholder Pages

No page in the approved learner path may render as an empty table or shell when demo data exists.

Allowed empty-state behavior:

- Hide a section if it is irrelevant.
- Show seeded demo data locally.
- Show an action-oriented state:
  - "Finish Workplace Security Basics to unlock this certificate."
  - "Enroll in Manager Coaching Basics to unlock this assessment."
  - "No overdue courses. You are on track."

Disallowed behavior:

- "Catalog data appears here when read models are wired."
- Blank white pages with only a heading.
- Empty tables without useful next action.
- Disabled controls presented as product features.

## Demo Seed Requirements

The local seed must create enough product data for visual and workflow validation.

Minimum data:

- One organization: Acme Learning.
- One admin user, one manager, and one learner.
- At least six published courses across Compliance, Leadership, Customer Care, Data Privacy, and Safety.
- At least one assigned in-progress course.
- At least one available self-enrollment course.
- At least one completed course with certificate issued.
- At least one locked certificate path.
- At least three modules across demo courses.
- At least eighteen lessons total.
- At least seven knowledge checks or assessments.
- At least one completed assessment attempt with score and feedback.
- At least one pending assessment required for certificate completion.

Seeded content should use realistic titles and descriptions. It should not read as "foundation record" or "demo placeholder."

## Data And Module Boundaries

The implementation should reuse existing modules where possible:

- Catalog and course data: `src/modules/catalog/*`.
- Assignments: `src/modules/assignments/*`.
- Assessments and scoring: `src/modules/assessments/*`.
- Feedback: `src/modules/feedback/*`.
- Runtime progress: `src/modules/runtime/*`.
- Certificates and credentials: `src/modules/certificates/*` and `src/modules/credentials/*`.
- Reports remain under `src/modules/reports/*`.

New learner-facing read helpers may be added when route code would otherwise become too large. Route files should not accumulate complex query formatting logic.

## Component Model

Add or reuse shared UI primitives for the learner experience:

- App shell with tenant learner navigation.
- Public top navigation.
- Course card.
- Course cover.
- Progress bar/ring.
- Tag/badge.
- Empty action state.
- Curriculum list.
- Assessment card.
- Certificate card.

Components should use the shared color tokens and avoid nested card-heavy layouts. Cards are acceptable for repeated course, assessment, and certificate items.

## Accessibility And Responsiveness

- Text must fit on mobile and desktop.
- All primary actions must be keyboard accessible.
- Buttons and links should have clear semantic roles.
- Course cards must preserve stable dimensions across content length.
- Tables should not be used for learner-facing course/certificate display unless tabular comparison is genuinely needed.
- Mobile layout should collapse side navigation into a top or stacked navigation without hiding critical actions.

## Testing And Verification

Focused tests:

- Role-aware `/org/[slug]` routing.
- Learner My Courses shows assigned, in-progress, completed, and available courses.
- Catalog filters/search affordance render visible published courses.
- Course overview renders curriculum, assessment, progress, and certificate state.
- Lesson page renders lesson outline and runtime entry points.
- Assessment center renders pending and completed checks.
- Certificate wallet renders earned and locked certificates.
- Empty states are action-oriented and do not use placeholder copy.

Manual smoke:

- Launch app locally.
- Login as learner.
- Visit My Courses, Catalog, Course Page, Lesson Page, Assessments, Certificates.
- Login as admin.
- Verify admin can reach admin console and learner experience is not confused with platform console.
- Login as platform owner.
- Verify platform console remains separate.

Repo gates:

- `npm run test`
- `npm run lint`
- `npx prisma validate`
- `npm run prisma:generate`
- `npx tsc --noEmit --incremental false`
- `npm run build`

## Acceptance Criteria

- First launch no longer looks like a blank white scaffold.
- Public, platform, tenant admin, and learner destinations are visually and behaviorally distinct.
- Learner account sees a polished My Courses home by default.
- Catalog, course overview, lesson, assessments, and certificates are navigable and populated in local demo data.
- Colors and component styling are consistent across pages.
- There are no learner-facing placeholder pages or empty tabs in the seeded demo.
- Existing auth, assignment, progress, assessment, and certificate behavior remains intact.

