# Reporting And Analytics Completion Implementation Plan

## Scope
- Complete organization reporting modules for course completion, scoring, timing, popularity, satisfaction, quiz difficulty, and certificate/credential status.
- Add platform aggregate analytics that are only surfaced through platform-owner routes.
- Add CSV exports that use the same report repository and visibility scope as on-screen reports.

## Implementation
1. Add pure report aggregation modules and tests.
2. Extend the Prisma reporting repository with report-specific list methods.
3. Add organization report page sections and CSV export routes.
4. Add platform aggregate summary to the platform dashboard.
5. Keep PDF report export out of scope.

## Verification
Run the focused Task 7 tests, then the standard gates:

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```
