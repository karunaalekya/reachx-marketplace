# Roadmap — Gaps Identified in Product-Completeness Review

This tracks gaps found by asking "does everything a real multi-vendor marketplace needs exist?"
— as opposed to earlier reviews, which asked "does the existing code work correctly?" Both
matter; this file is about the former. Update status as items are built.

## 🔴 Critical — blocks real launch or violates law

| Gap | Status |
|---|---|
| No vendor payout/bank details capture or payout batch job | ✅ Built (this pass) |
| No GST invoice generation | ✅ Built (this pass) |
| No shipping cost or tax in order total | ✅ Built (this pass) |
| No order-creation idempotency key | ✅ Built (this pass) |
| No product images / file upload | ✅ Built (this pass) |
| Abandoned `PENDING_PAYMENT` orders never expire, hold stock forever | ✅ Built (this pass) |
| `SUSPENDED` vendor status exists but has no admin endpoint | ✅ Built (this pass) |
| No TCS (Sec 52) collection or TDS (Sec 194-O) deduction on vendor payouts — legally required for any e-commerce operator, not yet in `CommissionService`/`PayoutService` | ✅ Built (this pass) |

## 🟠 High — real trust/ops gaps

| Gap | Status |
|---|---|
| No order/vendor notifications (email/SMS on order events) | ⬜ Not started |
| No reviews/ratings | ⬜ Not started |
| No customer accounts / order history | ⬜ Not started |
| No category management CRUD | ⬜ Not started |
| No bulk product upload | ⬜ Not started |
| No API documentation (OpenAPI/Swagger) | ⬜ Not started |
| No admin user management (create additional admins) | ⬜ Not started |
| No audit trail (createdBy/updatedBy) | ⬜ Not started |
| No product moderation (admin can't take down one product) | ⬜ Not started |
| No DPDPA consent capture / data deletion endpoint | ⬜ Not started |
| No admin reporting/dashboard endpoints | ⬜ Not started |
| No webhook replay/retry tooling for admins | ⬜ Not started |

## 🟡 Medium — matters at scale

| Gap | Status |
|---|---|
| No optimistic locking (`@Version`) on entities | ⬜ Not started |
| Search is basic SQL `LIKE`, no relevance ranking | ⬜ Not started |
| No coupon/discount system | ⬜ Not started |
| No COD (cash on delivery) payment option | ⬜ Not started |
| No return/RTO workflow | ⬜ Not started |
| No persistent server-side cart | ⬜ Not started |

## 🟢 Lower priority

Wishlist, product variants, vendor storefront branding, analytics dashboards, distributed
tracing/correlation IDs, integration/E2E test suite, CI/CD pipeline, environment profile split
(dev/staging/prod).

## Why this wasn't caught earlier

Earlier review passes checked code-correctness (does what exists work) against the original
7-line stack spec, not product-completeness (does everything a real marketplace needs exist).
Both lenses matter. This file exists so the completeness lens has a permanent home instead of
living only in chat history.

## Build approach

Given how many of the earlier bugs this session came from doing too much per pass, gaps are
being closed a few at a time, each verified (compile check, import check, constructor
cross-check against tests) before moving to the next — not all at once.
