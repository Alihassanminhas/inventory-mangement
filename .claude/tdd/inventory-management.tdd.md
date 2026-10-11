# TDD Evidence — Inventory Management System

## Source plan

- [Delivery plan](../../../.claude/plans/inventory-management.plan.md) (maintained in the workspace parent)
- [Detailed TDD workflow](../../../.claude/plans/inventory-management.tdd-workflow.md)

## Environment

- Project: `inventory-management/` React/Vite + Express/Prisma starter
- Test runner: Vitest 2.1.9, API workspace, single-thread pool
- Database: not configured; no database-backed integration tests run
- Git: project directory is not a Git repository; no checkpoint commits

## RED/GREEN evidence

| Plan task | Test | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|---|
| Product request validation | `api/src/validation.test.ts` | `npm -w api test -- --reporter=verbose` failed because `./validation.js` did not exist; stock tests still passed | `npm -w api test` — 5 tests passed | Product defaults and trimming work; invalid/overprecision amounts and reorder levels are rejected; pagination defaults and bounds are enforced. |
| Order validation and monetary totals | `api/src/order-validation.test.ts` | `npm -w api test -- --reporter=verbose` failed because `./order-validation.js` did not exist; other suites passed | `npm -w api test` — 11 tests passed | Orders require a warehouse and lines; quantities are whole units; duplicate products, invalid prices, and empty orders are rejected; totals use decimal arithmetic. |
| Atomic stock mutation helper | `api/src/stock.test.ts` | No valid runtime RED captured before helper implementation; initial Node runner attempts were blocked by `spawn EPERM`. | `npm -w api test` — 5 tests passed, including two stock tests | Deduction filters only by product/warehouse and available quantity; movement before/after and actor/reference are recorded; insufficient stock does not append a movement. |
| HTTP boundary | `api/src/api.test.ts` | No RED run captured before adding the app export and error paths. | `npm -w api test` — 11 tests passed | Health endpoint emits security headers; unknown routes use JSON 404; malformed JSON is rejected with a safe 400 response. |

## Verification

- `npm -w api exec prisma -- validate --schema prisma/schema.prisma` — schema valid.
- `npm -w api test` — PASS, 4 test files, 11 tests.
- `npm run build` — PASS after the order screens and again after the React error boundary; Prisma client generation, API TypeScript build, web typecheck, and Vite production build completed with exit code 0.
- API startup smoke check — PASS using Node `--env-file=.env.example`; `GET http://127.0.0.1:4000/api/health` returned `{"ok":true}`. The database placeholder was not used for a DB request.
- Combined development startup — PASS with a temporary copy of the example env file; API health returned `ok: true` and the Vite page returned HTTP 200. Temporary env file was removed after the smoke check.
- `npm audit` — 0 vulnerabilities in the nested application workspace at the time checked.
- Coverage — not configured/measured yet.

## Known gaps

- No live PostgreSQL URL was provided, so migrations, endpoint persistence, transaction rollback, and concurrent sale behavior are not verified against a real database.
- No API route integration tests or browser E2E tests yet.
- Product images, order cancellation/returns/partial fulfillment, reports, transfers, and deployment configuration remain unimplemented.
- Stock tests mock Prisma calls; they do not prove PostgreSQL transaction/isolation behavior.
