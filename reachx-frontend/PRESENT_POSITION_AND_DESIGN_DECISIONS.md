# ReachX Marketplace — Present Position & Design Decisions
*Compiled for cross-checking with other AI tools. Everything below reflects what has actually
been built and decided so far — flagged clearly wherever something is still open or unverified.*

## 1. What this project is
A multi-vendor eCommerce marketplace build (Node/Express-adjacent brief, but backend is actually
Spring Boot — see below) for a client lead (Edithtech ReachX), being built by BJNEXUS AI as a
proof-of-concept / pitch deliverable.

## 2. Backend — Spring Boot
**Stack:** Java, Spring Boot, PostgreSQL, Flyway migrations (18 migrations so far), Kafka for
domain events, S3-compatible object storage (presigned upload pattern).

**Structure:** package-per-module (`vendor`, `catalog`, `invoice`, `order`, `admin`, `common`),
~294 files, ~10,000+ lines of Java.

### Key backend decision this session: KYC moved from single-document to multi-document model
- **Old model (rejected as insufficient):** one `kycDocumentUrl` / one `kycStatus` / one
  `rejectionReason` per vendor — couldn't express "PAN approved but GSTIN rejected."
- **New model (built, not yet compiled/tested with real tooling):**
  - New table `vendor_kyc_documents` — one row per `(vendor_id, doc_type)`.
  - `doc_type` enum: `PAN` (required), `GSTIN` (required), `BANK_CHEQUE` (required),
    `MSME_CERTIFICATE` (optional — reviewable but doesn't gate approval).
  - Required-ness lives **on the enum itself** (`DocType.isRequired()`), not as a hardcoded
    count anywhere — this was a deliberate fix after an earlier draft used a hardcoded
    `approvedCount == 3` that would've silently broken if a 4th required type were ever added.
  - `Vendor.kycStatus` is now **derived**, recomputed from the live document set every time a
    document is uploaded or decided — not directly admin-settable anymore.
  - `Vendor.kycDocumentUrl` and `Vendor.rejectionReason` were **dropped** from the `vendors`
    table (with a best-effort, explicitly-lossy backfill into a `PAN`-typed row before the drop).
  - **New endpoints:** `GET /vendors/{id}/kyc-documents` (list), `PATCH
    /vendors/{id}/kyc-documents/{documentId}/decision` (admin, approves/rejects ONE document).
  - **Removed endpoint:** `PATCH /vendors/{id}/kyc-decision` (whole-vendor decision) — this is a
    documented **breaking API change**.
  - **Deliberate design choice:** rejecting one document on an already-`ACTIVE` vendor sets the
    derived `kycStatus` to `REJECTED` (visible) but does **not** silently flip the vendor back to
    `INACTIVE` — pulling a live vendor's storefront down is treated as a separate, explicit admin
    action (`suspend`), not an automatic side effect of a document re-review.
  - **Known, accepted gap:** no append-only history of past submissions/decisions. A re-upload or
    re-decision overwrites the row in place. Flagged as a real limitation, not silently ignored.
  - **Verification status: NOT run.** This sandbox has no access to Maven Central, so `mvn test`
    has never been executed against this code. Structurally reviewed (brace/paren balance, no
    dangling references to removed symbols) but not compiler-verified.

## 3. Frontend — React
**Stack (locked):** React + Zustand (state) + Tailwind CSS (styling only, no inline styles/CSS
Modules — needed for `:focus-visible`/`:hover`/breakpoints). Directory structure mirrors backend
module boundaries (`auth/`, `catalog/`, `orders/`, `vendor/`, `admin/`, `shared/`) — **no**
`features/` wrapper layer, after that convention flip-flopped once early on.

**Build order:** vendor dashboard first (deepest backend functionality — KYC, payouts, GST,
TCS/TDS, disputes — most demonstrable there), then admin console, then customer storefront.
Storefront not started.

### Typography — finalized
- **Syne** — storefront display face only.
- **Plus Jakarta Sans** — everywhere else.
- **Federo was explicitly dropped**, not just unused — do not reintroduce.

### Color — partially finalized
- Token **names** are locked: `brand.saffron`, `brand.indigo`, `feedback.neem`, `feedback.chilli`,
  `surface.storefront`, `surface.dashboard`, `surface.cardMuted`, and a `tint.{neem, chilli,
  saffron, muted}.{bg, border, text}` set for status badges.
- **The actual hex values are NOT finalized here.** They're specified in a separate
  `design-system-reference.md` that has not been shared in this conversation. The hex values I
  used in the tailwind token file I wrote this session (`tint-colors.tailwind.js`) are
  **placeholders I picked myself** to make the component functional — not the real brand palette.
  Anyone continuing this needs the real reference doc before treating those hex values as final.

### Animation / motion — NOT finalized
No decision on record anywhere in this project's history: no page-load sequence, no
scroll-triggered reveals, no hover micro-interactions, no stated reduced-motion policy. This is a
genuinely open gap, not a documented decision.

### Components built this session (fresh code, against the new backend contract)
- `src/vendor/api/kycApi.ts` — presign → PUT → confirm upload flow, list, admin decision, typed
  against the real backend response shapes.
- `src/vendor/store/useVendorStore.ts` (KYC slice only — payout/dispute slices from earlier
  passes not reconstructed here) — Zustand + `persist`, with `partialize` allow-listing only
  `vendorId`/`businessName`/`overallKycStatus`. The `documents` array (containing per-document
  `documentUrl` and `rejectionReason`) is deliberately excluded from `localStorage` — unencrypted
  browser storage is not a safe place for that.
- `src/shared/components/VerificationBadgeStack.tsx` — status badges driven only by
  `tint-{variant}-{bg,border,text}` classes (no arbitrary hex). Passive badges have no
  `tabIndex`/role; a genuinely clickable badge (view rejection reason) is a real `<button>` with
  `focus-visible:ring-2`.
- `src/vendor/components/KycVerificationPanel.tsx` — renders all 4 doc types, upload/replace per
  slot, lucide-react icons only (no emoji), shows rejection reason inline on click.

### Components added this session (cross-checked against an external tool's proposal, rebuilt to match actual contracts)
An external AI tool produced a "design expansion blueprint" (animation system + KYC panel mockup
+ toast component) claiming to build on this project. On review it did not match the real
codebase and contained bugs:
- Invented a merged `VerificationBadgeStack` component/prop shape that doesn't exist — the real
  code has two separate exports, `StatusBadge` (passive) and `InteractiveBadge` (real `<button>`),
  matching the accessibility distinction already on record in this doc.
- Used status values (`success`/`alert`/`pending`/`neutral`, `UNDER_REVIEW`) not present in the
  real `KycDocStatus` union (`PENDING | APPROVED | REJECTED`).
- Asserted a `prefers-reduced-motion` policy in prose with no actual implementation anywhere in
  the code.
- Introduced Radix as an implicit new dependency (`var(--radix-accordion-content-height)`) —
  not part of the locked stack (React + Zustand + Tailwind), not present in either zip.
- Contained a genuine bug: animation durations written as `250s` instead of `250ms` (a 4-minute
  accordion), and `.filter(...).count` where JS/TS requires `.length`.

Only the genuinely new, contract-correct pieces were kept and rebuilt from scratch:
- `src/shared/components/OperationToast.tsx` — toast notification component. Uses the project's
  real tint variant names (`neem`/`chilli`/`saffron`) rather than an invented
  `success`/`alert`/`info` vocabulary, and Tailwind's built-in `motion-safe:`/`motion-reduce:`
  variants instead of a hand-rolled (and unimplemented) reduced-motion policy.
- `src/shared/tokens/motion.tailwind.js` — partial Tailwind config, toast keyframe only, duration
  bug fixed (`300ms`), no Radix dependency.
- **Not yet done:** these two files exist as standalone additions and haven't been wired into
  `KycVerificationPanel.tsx` (e.g. firing a toast on upload confirm or on an admin decision) or
  merged into a real `tailwind.config.js`. `KycVerificationPanel.tsx`,
  `useVendorStore.ts`, and `VerificationBadgeStack.tsx` were reviewed and found correct against
  the current backend contract — untouched this session.
- Reminder: dynamic Tailwind class construction (`` `bg-tint-${variant}-bg` ``, used in both the
  original `VerificationBadgeStack.tsx` and the new `OperationToast.tsx`) is a known JIT-purge
  risk in a real build — flagged, not yet resolved, since no build has been run.

### Known open issues (from `FRONTEND_STATE.md`, still unresolved)
- `gstEngine.ts` PAN-aware TDS calculation fix — reported as handed back in an earlier session,
  **not re-verified** in this session.
- `VendorDashboardShell.tsx` emoji→lucide icon swap — only done for the new KYC panel above, the
  shell itself wasn't touched this session.
- **No real code export/repo exists** for anything from the *original* frontend session before
  this one — everything before this session exists only as chat snippets, never run or built.
  The 5 files listed above are freshly written in this session's own environment, directly
  against the backend's actual (but still uncompiled) contract — not a recovery of old snippets.
- Frontend files from this session also **have not been run through a real bundler/typechecker**.

## 3a. Motion / animation — still open, one exception
Still no page-load sequence, scroll-reveal, or hover micro-interaction decisions on record — that
gap stands. The one exception: the toast slide-in above now has a real, working implementation
(300ms, `motion-safe:`/`motion-reduce:`), scoped only to that one component. This is not a
project-wide motion system and shouldn't be read as one.

## 3b. Remaining frontend build — session plan
No real project scaffold exists yet (no `package.json`/`tsconfig`/`vite.config` anywhere in the
zip) — everything so far is loose files, never installed or compiled. This sandbox *can* actually
run `npm install`/`tsc`/`vite build` (unlike the backend's Maven-blocked situation), so session 1
below should produce the first genuinely compiler-verified frontend code in this project, not
another "structurally reviewed, not run" pass.

Scope below covers the vendor-dashboard phase only (the build order already locked: vendor
dashboard → admin console → storefront). Admin console and storefront are separate, unplanned
phases after this.

| # | Session | Work | Deliverable |
|---|---|---|---|
| 1 | Scaffold + real verification | `package.json`/`tsconfig`/`vite.config`, merge the 3 scattered tailwind fragments (`tint-colors.tailwind.js`, `motion.tailwind.js`, brand/feedback/surface) into one real config, **add a Tailwind `safelist` for dynamic tint classes (e.g. `` bg-tint-${variant}-bg ``), checked against the real hex values already in `tint-colors.tailwind.js` — not a re-guessed config from an external draft**, `npm install`, run real `tsc`/`vite build` against the KYC slice + toast, fix whatever the compiler finds, wire `OperationToast` into `KycVerificationPanel` | First compiler-verified code in this project, dynamic status classes confirmed to survive a production build |
| 2 | Auth + shell | Auth module (login, token storage — **auth token kept out of raw `localStorage`, e.g. httpOnly cookie, same reasoning as excluding `documents`/`rejectionReason` from `persist`**), `VendorDashboardShell.tsx` (nav rail, lucide icons — closes issue #8), wire real `vendorId`/`authToken` into the KYC panel, **add a refetch-on-tab-focus check for the persisted `overallKycStatus` so a stale cached approval/revocation doesn't linger after a server-side admin change** | Navigable, logged-in vendor dashboard, KYC page working end to end, cached KYC status self-corrects instead of going stale |
| 3 | GST engine + payouts | Rebuild `gstEngine.ts` with PAN-aware TDS (needs backend's `panOnFile` wired through — issues #5/#6), `VendorPayoutLedger.tsx` (₹-formatted table, **`tabular-nums`/`font-mono` applied to all currency figures so columns don't shift as values change — already specified in `FRONTEND_STATE.md`, calling it out explicitly here so it isn't missed**) | Payout tab functional, tax calc verified against test cases, currency columns visually stable |
| 4 | Disputes + close-out | Disputes store slice + minimal UI, full typecheck across the whole vendor module, sweep `FRONTEND_STATE.md` issues #1–9 to confirm each is actually closed live, not just proposed in a chat message, **design the actual fix for a dropped connection between the S3 PUT and the `/confirm` call — not an in-memory retry, since `documents` is deliberately excluded from `persist` and won't survive a reload** | Vendor-dashboard phase complete and verified |

**Hard blocker independent of session count:** real hex values for `brand`/`feedback`/`surface`
are still behind an unshared `design-system-reference.md`. No session closes this — placeholder
hex stays in use, flagged, until that doc is provided.

**Rejected from external review (not added):** reordering Session 2/3 to split auth from the
shell — the stated justification (shell "depends heavily on financial context markers") isn't
supported by anything on record; KYC, not payouts, is the first page the shell wraps per the
locked build order. The suggested retry-in-store mitigation for the S3 confirm gap was also
rejected as unworkable for the reason above — replaced with "design the actual fix" in Session 4.

**To keep each session fast:** open it with this file + `FRONTEND_STATE.md` +
`MASTER_BLUEPRINT.md` attached, so context doesn't need to be re-derived from scratch.

## 3c. Held design addition — premium depth shadows (not yet merged)
An external proposal for a "premium visual signature" was reviewed. Most of it was rejected: it
rebuilt `VerificationBadgeStack` as a single merged component again (the exact accessibility
regression already fixed once — real code has separate `StatusBadge`/`InteractiveBadge`), used a
third, different set of wrong hex values for the tint tokens, and quietly reopened locked
typography (added Playfair Display/Inter fallbacks). None of that was kept.

One part was legitimate and visually harmless: a soft box-shadow depth scale
(`premium-card`/`premium-hover`/`premium-dropdown`) and a custom ease curve
(`premium-ease`, the standard fluid cubic-bezier). Saved as
`src/shared/tokens/premium-depth.tailwind.js`, **on hold, not merged into any build yet** —
there's no shell or card surface built to apply it to, and the proposal that included it
mislabeled `VendorDashboardShell.tsx` as "Session 1" work when the shell is actually Session 2
per the locked plan. Apply it when Session 2 (shell) or Session 4 (close-out polish) actually
builds those surfaces — against the real `StatusBadge`/`InteractiveBadge`, not a rebuilt version.

## 3d. Held — competitor-pattern mapping (fold into existing sessions, no separate pass)
Checked functional patterns across Meesho/Flipkart/Amazon seller panels (verifiable: status-first
health-check dashboards, transparent line-item payout ledgers, real-time order/status
notifications, OTP-only login). No public source shows their actual animation/motion
implementation — these are gated, logged-in tools, not documented at that level — so this is
functional-pattern grounding only, not a claim of having seen their motion code.

Mapping, to be applied **inside the sessions that already touch these files** — not a new
session, so nothing gets bolted on separately and forgotten or skipped under time pressure:

| Pattern | Applies to | Which session already covers it |
|---|---|---|
| Status-first health-check widget | `KycVerificationPanel` (done) — use as the template for other tabs | Session 3 (payouts), Session 4 (disputes) — build those tabs status-first from day one instead of a plain table first |
| Transparent, trustworthy payout ledger | `VendorPayoutLedger.tsx` | Session 3 — apply the held `premium-depth.tailwind.js` shadow scale here specifically |
| Real-time status notifications | `OperationToast.tsx` (built, unwired) | Session 1 close-out (already lists wiring the toast into `KycVerificationPanel`) — extend that same wiring to payout-settled and dispute-decision events when those tabs are built in Sessions 3–4, not as a separate pass |
| OTP-only login | Auth module | Session 2 — factor into the auth design directly |

Nothing here changes session count or scope — it's a lens applied while building what's already
planned, so it doesn't need its own slot and can't get silently dropped.

## 3e. Correction — two more external reviews checked, mixed accuracy
Two more external documents were checked against the real codebase.

**Confirmed correct, worth keeping in mind:** tint-hex-drift warning (already addressed by
`tint-colors.tailwind.js`); the historical `tabIndex={0}`-on-passive-badges bug (real, already
fixed — `FRONTEND_STATE.md` line 109); the PII-in-localStorage mandate (matches the real
`partialize` design already in `useVendorStore.ts` exactly).

**Confirmed wrong — do not schedule this as new work:** one review claimed the S3 upload flow
"is currently a mock string" and the presign pipeline "was never actually wired to components."
Checked `kycApi.ts` and `KycVerificationPanel.tsx` directly — this is false. The real
`uploadDocument` store action already calls the real `presign → PUT → confirm` flow against the
real backend endpoints. This is done, not a gap. If a future review resurfaces "wire the S3
upload" as a task, check the actual files before accepting it.

**Noted, not yet resolved:** a separate proposal was the first to correctly use the real
`StatusBadge`/`InteractiveBadge` two-export architecture (instead of reinventing a merged
component, the mistake made twice before) — but its prop names (`label`, missing optional
`subtext` on `InteractiveBadge`) don't exactly match the real component's (`subtext` on both).
Confirms the right *shape* was finally proposed; a real drop-in against the exact real prop names
still needs writing, not yet done.

**New conflict introduced, needs resolving before either is used:** that same proposal defined a
`premium-card` shadow value (`0 4px 20px -6px rgba(30,37,76,0.05)...`) that differs from the one
already held in `premium-depth.tailwind.js` (`0 2px 12px -4px rgba(30,37,76,0.04)...`). Two
different "premium-card" values now exist under the same name across held proposals — pick one
canonical value when the shell/ledger actually get built (Session 2/3); don't merge either
blindly.

**Not verifiable, don't cite in the pitch:** a "competitive teardown" describing Swiggy
Owner/Blinkit Seller/Meesho's internal UI strategy was presented as researched fact with no
source. These are gated, logged-in seller panels with no public design documentation at that
level of detail — treat those specific claims as unverified, not as competitive research.

## 3f. Decisions taken — Framer Motion, canonical shadow value, gstEngine deferred
Three open items from the last review round were resolved:

**Framer Motion — allowed, scoped.** No public source confirms what Meesho/Flipkart's actual
seller panels use internally (gated tools). Motion (current name for Framer Motion) runs
animations via the browser's native Web Animations API for most cases, falling back to JS only
for spring physics/gestures — not the heavy blocking engine the original "avoid heavy JS
animation engines" decision was guarding against. **Decision: allowed, but scoped to
interactive/gesture moments only** — drawer slide-in, badge press feedback. Basic fades and
loading states stay plain Tailwind/CSS. This is a real change to the original motion-architecture
call from section 3a — recorded here, not silently adopted.

**Canonical `premium-card` shadow — the original held value wins.**
`0 2px 12px -4px rgba(30,37,76,0.04), 0 1px 4px -1px rgba(30,37,76,0.02)`, already in
`src/shared/tokens/premium-depth.tailwind.js`. Later proposals' heavier versions
(`0 4px 20px...`, `0 20px 32px...` for hover/elevated states) are discarded. Any future proposal
using a different `premium-card`/`premium-hover` value should be corrected against this one, not
merged as-is.

**`gstEngine.ts` real signature — still unresolved, deferred.** The file isn't in either
uploaded zip; only referenced conceptually in `FRONTEND_STATE.md` (issues #5/#6). Both external
proposals invented different function signatures for a file neither had access to — neither is
trusted. Revisit before Session 3 actually builds `VendorPayoutLedger.tsx` against it.

## 3g. MAJOR CORRECTION — full backend inventory checked, frontend plan was scoped too small
Directly inspected `marketplace-springboot-kyc-multidoc.zip`. It contains far more than the
frontend plan accounted for: **14 real backend modules**, 145 Java files, 18 Flyway migrations —
`admin`, `auth`, `catalog` (Products, incl. `stockQuantity` — inventory already lives here, not a
separate module), `dispute`, `invoice`, `order`, `payment`, `payout`, `refund`, `shipping`, `tax`,
`vendor`. Only the vendor/KYC slice has any frontend built against it. Every other module has a
real, working API with nothing consuming it on the frontend yet — this was the actual scope gap,
not a missing backend.

**Second correction, resolves the open `gstEngine.ts` question:** tax is computed and persisted
**server-side**, not client-side. `TaxWithholdingService` calculates TCS (1%, Sec 52 CGST Act)
and TDS (1% with PAN / 5% without, Sec 194-O + Sec 206AA penalty rate) at the moment of sale and
stores it. The frontend's job was never to reimplement this calculation in a `gstEngine.ts` —
every proposal that invented one (client-side recompute) was solving the wrong problem. The
frontend only needs to fetch and display real numbers from:
- `GET /api/v1/tax-withholding/mine/{financialYear}` — vendor's own TCS/TDS totals
- `GET /api/v1/payouts/mine` — vendor's own payout ledger (paginated)

No client-side tax engine needs building. `VendorPayoutLedger.tsx` renders what these endpoints
return — this removes the entire "unknown signature" blocker from section 3f.

**Sidebar/IA decision, now answered by what's real:** show only nav items with a real backend
endpoint behind them. That's Orders, Catalogue (Products), Invoices, Payments, Payouts,
Disputes, Refunds, Shipping, Tax — in addition to KYC (built). Insights/Recommendations still
don't exist anywhere in the backend — genuinely cut from near-term scope, not just deferred.

## 3h. Revised session plan — module-by-module, replaces the KYC-only 4-session plan
Old plan under-scoped the work by treating KYC as nearly the whole frontend. New plan sequences
by what's real and already has your original build-order logic (deepest financial workflows
first) still respected within it.

| # | Session | Work | Deliverable |
|---|---|---|---|
| 1 | **DONE, this session.** Scaffold + KYC close-out | `package.json`/`tsconfig`/`vite.config`, Tailwind safelist, canonical hex from `tint-colors.tailwind.js`, `npm install`, real `tsc`/`vite build`, wire `OperationToast` into `KycVerificationPanel`, decide Framer Motion dependency now (already decided: yes, scoped) | **First compiler-verified build — achieved.** `npm install` (141 packages, 0 errors), `tsc -b --noEmit` (strict, 0 errors on first pass, no fixes needed), `vite build` (1520 modules, real `dist/`), safelist verified against actual compiled CSS (all 9 dynamic tint classes present, not assumed). Toast wired via a new minimal `useToasts` hook — found and handled a real constraint (`OperationToast`'s hardcoded fixed position can't stack multiple toasts) rather than shipping it silently broken. See `FRONTEND_STATE.md`'s "Session 1" section for full detail. Not done: no headless-browser/interaction test, no live-backend call attempted. |
| 2 | **DONE, this session.** Auth + shell + real nav | Auth module (login, JWT in-memory only), `VendorDashboardShell.tsx` with nav scoped to real backend modules only, refetch-on-tab-focus, Action Center (2/3 sources real, 1 honestly stubbed), one page-load choreography | **Logged-in shell navigating to real, backend-backed sections - achieved.** `tsc -b --noEmit` (strict, 0 errors), `vitest run` (5/5, including a real bug found and fixed - see 3k), `vite build` (1529 modules). See 3k for full detail, including what's still unverified (JWT-storage inference, `userId`/`vendorId` equivalence). |
| 3 | Payouts + Tax (no client tax engine needed) | `VendorPayoutLedger.tsx` fetching `/payouts/mine` + `/tax-withholding/mine/{fy}` directly, `tabular-nums` on all ₹ figures | Real payout/tax data rendered, nothing invented client-side |
| 4 | Orders | Order list + detail against `OrderController` (`POST /orders`, `GET /orders/{id}` — vendor-scoped views) | Orders visible end to end |
| 5 | Catalogue / Products | Product CRUD UI against `ProductController` (`GET/POST/PUT/DELETE`, `/mine`, `/{id}/publish`) — this is also where "Inventory" lives (`stockQuantity` field), not a separate module | Vendor can manage listings + stock |
| 6 | Invoices + Payments (read-only) | Invoice list/download against `InvoiceController` (`/mine`, `/mine/{id}/download`); payment status display (payments are gateway-webhook-driven — no vendor-initiated actions needed here) | Vendor-facing financial documents visible |
| 7 | Disputes + Refunds + Shipping | Dispute view/evidence upload against `DisputeController`; refund status display; shipment tracking display | Full vendor-dashboard module coverage complete |
| 8 | Full sweep + admin-console kickoff | Full typecheck/build across every module, close every `FRONTEND_STATE.md` issue live, then begin admin console (KYC decision queue, dispute resolution, tax/payout admin views — all already have real `@PreAuthorize("hasRole('ADMIN')")` endpoints) | Vendor dashboard fully verified; admin console started |

**Still open, independent of session count:** real hex values (`design-system-reference.md`),
and the sidebar-scope decision above (now resolved — real modules only, no decorative items).

## 3i. Premium visual features — folded into the session plan, not a separate pass
Reviewed for a client-facing "wow" pass. Signature direction chosen: **"precision, not
decoration"** — one consistent interaction language repeated across every module, not novelty
per screen. Added directly into the sessions that already touch each surface, same reasoning as
section 3d (nothing gets its own slot, so nothing gets silently dropped).

| Feature | Where | Session | Note |
|---|---|---|---|
| Checkmark draw-in on KYC approval (SVG path animation, one-time) | `KycVerificationPanel` | 1 (close-out) | Small addition to already-planned toast wiring |
| Micro-Ledger Accordion (collapsed → full CGST/SGST/IGST/TCS/TDS) | `VendorPayoutLedger.tsx` | 3 | This is the highest-priority visual investment — trustworthy-fintech feel matters most here |
| Order status as a stepped timeline, not a status word | Orders list/detail | 4 | Reuse this exact pattern for Refunds/Shipping too — don't invent a second visual language |
| Inline stock urgency (tinted number, not a separate badge) | Catalogue/Products | 5 | Quieter than a warning banner, on purpose |
| Invoice rows as document cards (thumbnail, mono invoice #, icon-only download) | Invoices | 6 | Only screen where a slightly "paper-like" treatment (thin border, subtle corner shadow) fits |
| Contextual side drawer for dispute detail | Disputes | 7 | Concept kept from earlier external review; exact code not reused — build fresh against real `DisputeController` shape |
| Action Center card ("2 things need you" — pulls KYC rejections + pending disputes + orders awaiting dispatch) | Dashboard home | 2 (shell) | Real data pull across 3 already-real endpoints, not decorative |
| Global command search (⌘K) — client-side filter over orders/products | Dashboard shell | 2 or 8 | Cheap to build, disproportionately impressive live — good candidate if Session 2 has room, otherwise Session 8 |
| Designed empty + loading states (skeleton matches real layout, empty states have real copy) | Every module | Each session builds its own module's empty/loading state at build time, not retrofitted later | Most external proposals skipped this entirely — deliberately not skipping it here |
| One page-load choreography (shell → header → KPI stagger 40-60ms, ~400ms total), reused on every page | Shell + every module | 2 (define once), then reused as-is everywhere else | Do not redesign this per page — repetition is the point |

**One item needs a real decision, not just scheduling — Account Health composite score**
(single number combining KYC/Orders/Fulfilment/Disputes). This needs new backend aggregation —
nothing in the current 14 modules computes a combined score. Highest-leverage single feature for
a pitch (first thing visible on login), but it's a backend task before it's a frontend task.
Not scheduled into a session yet — flag for a real "do we build this backend endpoint" decision,
same way Framer Motion and the shadow-value conflict were resolved earlier.

**Explicitly rejected, to avoid scope creep:** glassmorphism beyond one modal backdrop, animated
number counters everywhere, gradient backgrounds, more than 3 shadow levels (Level 0 background /
Level 1 `premium-card` / Level 2 `premium-hover`, per section 3c), per-page unique color accents.

## 3j. Account Health backend — built
Built directly against the real schema (not guessed): `Vendor.kycStatus`, `OrderItem.vendorId` +
`Order.status`, `Dispute.vendorId` + `Dispute.status`. All in `backend-additions/` in this zip —
these are new files or full-file patches to drop into `marketplace-springboot`, not yet merged
into the actual backend repo.

**New:** `GET /api/v1/vendors/{id}/account-health` — returns
`{ overallScore, rating, kycScore, fulfilmentScore, disputeScore }`.

**Formula (v1, documented as adjustable in the code itself, not final):**
- KYC 40% — 100/50/0 from `Vendor.kycStatus` (APPROVED / PENDING·UNDER_REVIEW / REJECTED)
- Fulfilment 40% — `FULFILLED` orders ÷ (`FULFILLED`+`REFUNDED`+`PARTIALLY_REFUNDED`) for that
  vendor; defaults to 100 for a vendor with no resolved orders yet, so a brand-new vendor isn't
  penalized for having no track record
- Disputes 20% — 100 minus 15 points per open/under-review dispute, floored at 0
- Rating bands: 90+ Excellent, 75-89 Good, 60-74 Needs Attention, <60 At Risk

**Files added:**
- `order/repository/OrderItemRepository.java` — new; didn't exist before. Needed because
  vendor_id lives on `OrderItem`, not `Order` (orders are multi-vendor).
- `vendor/dto/AccountHealthResponse.java`, `vendor/service/AccountHealthService.java` — new.
- `dispute/repository/DisputeRepository.java` — **full-file replacement**, adds one derived
  query method (`countByVendorIdAndStatusIn`) to the existing file.
- `patches/VendorController_ADD_THIS_METHOD.java` — snippet to add to the existing
  `VendorController.java` (import + field + endpoint), not a standalone file — mirrors the
  existing `getById` access pattern (`ADMIN` or `VENDOR`, no extra self-check) rather than
  inventing a new authorization style for one endpoint.

**Merged into the real backend (this session).** All 5 files were placed directly into
`marketplace-springboot`'s actual package structure, not left as standalone patches:
- `OrderItemRepository.java`, `AccountHealthResponse.java`, `AccountHealthService.java` —
  new files, copied in as-is.
- `DisputeRepository.java` — full-file replacement applied (adds
  `countByVendorIdAndStatusIn`, nothing else changed).
- `VendorController.java` — hand-patched in place: two new imports
  (`AccountHealthResponse`, `AccountHealthService`), one new field
  (`accountHealthService`), and the `GET /{id}/account-health` endpoint added directly
  after `getById`, mirroring its exact `@PreAuthorize("hasAnyRole('ADMIN', 'VENDOR')")`
  pattern.

Before merging, every referenced field/enum was checked against the real model files, not
assumed: `Order.OrderStatus` (`PENDING_PAYMENT, PAID, PAYMENT_FAILED, CANCELLED, FULFILLED,
REFUNDED, PARTIALLY_REFUNDED`), `OrderItem.vendorId`, `Dispute.vendorId`,
`Dispute.DisputeStatus` (`OPEN, UNDER_REVIEW, RESOLVED_REFUNDED, RESOLVED_REJECTED,
RESOLVED_REPLACED`), and `Vendor.kycStatus` / `Vendor.KycStatus`
(`PENDING, UNDER_REVIEW, APPROVED, REJECTED`) — all matched exactly, no drift. Brace/paren
balance checked on every touched file post-merge.

**Still not done:** not compiled — no Maven Central access in this sandbox, same limitation
as the rest of the backend. No test written. This is now a single coherent
`marketplace-springboot` zip with the feature inside it (not a separate patch bundle) —
`mvn compile`/`mvn test` in a real environment is the next real verification step. Frontend
consumption of this endpoint is still future work — not yet scheduled into a session number.

## 3k. Session 2 — Auth + shell + real nav (this session, real, compiler-verified)

Built against the confirmed-live backend contract handed off at the start of this session
(register → DB persist → login → JWT issuance verified end-to-end against a real running Spring
Boot instance, several real backend bugs found and fixed by actually exercising it — the single
biggest caveat blocking frontend progress, "no live-backend call has ever happened," is now
resolved on the backend side though this frontend sandbox still can't reach it directly).

**Delivered, matching the Session 2 line in the 3h table:** auth module (login only — real
`POST /auth/login`, handles both the confirmed 200 and 401 shapes exactly, JWT kept out of
`localStorage`), `VendorDashboardShell.tsx` (nav rail, lucide icons, scoped to real backend
modules only per 3g), refetch-on-tab-focus for cached KYC status, Action Center card, one
page-load choreography defined once and reused everywhere.

**JWT storage — in-memory only, not httpOnly cookie.** The session brief asked for this to be
verified against `JwtService.java`/`SecurityConfig.java` before implementing; that source
wasn't available in this session. Decided instead from what *was* confirmed: the login response
returns the token as a JSON body field, not via `Set-Cookie`, and the existing (Session 1,
untouched) `kycApi.ts` already sends it back manually as `Authorization: Bearer <token>` on
every request — a cookie-based backend wouldn't need to hand the token back in the body at all.
This is inference from the confirmed contract plus already-real code, stated as such, not a
claim of having read the Java security config. Real tradeoff, stated plainly: no `persist`
middleware at all means a page refresh logs the vendor out — no silent session-restore. Revisit
with a real decision (httpOnly cookie + refresh flow, or an explicit encrypted-storage choice)
once there's actual access to the backend's security config, rather than guessing further.

**`userId` vs `vendorId` — flagged, not resolved.** The confirmed login response has `userId`,
no `vendorId`. Every vendor-scoped call in this build (KYC docs, account-health) treats `userId`
as the vendor id, which is the only id the response offers and matches the Session 1 placeholder
pattern (`PLACEHOLDER_VENDOR_ID = 1`) — but it's unverified against the real `AuthController`/
`Vendor` entity. Confirm before an ADMIN login or a vendor whose `Vendor.id` diverges from
`userId` exposes this.

**Action Center — two of three data sources real, one honestly stubbed.** The session plan
called for "KYC rejections + pending disputes + orders awaiting dispatch, 3 real endpoints."
This session's brief confirmed live contracts for exactly two: KYC documents (Session 1) and the
new `GET /vendors/{id}/account-health`. No vendor-scoped "my open disputes" or "my orders
awaiting dispatch" list endpoint was named (only `POST /orders` and `GET /orders/{id}` - a
single order, not a list; no dispute endpoint at all). Guessing a path here would repeat the
exact gstEngine.ts mistake already corrected once (3f: inventing a signature for a contract
nobody had access to). The third slot in `ActionCenterCard.tsx` is a static, honest placeholder
- not a fetch against a made-up URL. Wire it for real once Session 4 (Orders) / Session 7
(Disputes) confirm those list endpoints the same way account-health was confirmed this session.

**No routing library added.** No react-router-dom decision is on record anywhere in this
project, and adding a new dependency without a recorded decision is the exact mistake already
flagged once for Radix (3d). `VendorDashboardShell` uses local `activeSection` state instead of
routes. Revisit if deep-linking/back-button support becomes a real requirement - as its own
recorded decision, not a silent addition.

**Real bug found by the test, not glossed over:** `ActionCenterCard` initially called
`fetchKycDocuments` without first calling `setVendorContext` - the store reads `vendorId` from
its own state (set by `setVendorContext`), not from component props, so the call silently
bailed out with "No vendor context set" and never hit the network when a vendor lands on Home
before ever opening the Verification tab. The extended interaction test suite caught this
(a KYC-list fetch call that should have happened, didn't). Fixed by having `ActionCenterCard`
set vendor context itself instead of assuming tab-visit order.

**Real commands run, real results:** `tsc -b --noEmit` (strict) - 0 errors. `vitest run` -
5/5 passing (extended from Session 1's 3, now driving the real login form before reaching the
KYC panel, since it's nested behind the auth gate + shell nav rather than being the page root).
`vite build` - succeeded, 1529 modules. Purge-safety re-checked for this session's new
dynamic-looking classes (`StaggerReveal`'s literal `[animation-delay:Nms]` classes), not
assumed safe by analogy to the Session 1 tint-class check - all 5 confirmed present in the
compiled CSS (an early check looked like 3 were missing; the CSS minifier rewrites
`100ms`/`150ms`/`200ms` to `.1s`/`.15s`/`.2s`, which broke a literal-string grep - re-verified
with exact selector matching, genuinely present, no safelist entry was actually needed).

**`premium-depth.tailwind.js` merged this session** - the shell and its card surfaces
(Action Center, KYC panel) are now real, so `shadow-premium-card`/`-hover` have surfaces to
apply to, per its own hold note and 3c/3f. Applied against the real `StatusBadge`/
`InteractiveBadge`, not a rebuilt version.

**Not done, still open:** no live-backend call attempted from this sandbox (same limitation as
every prior session - compiled/tested against the documented contract, not exercised against
the real running instance mentioned in this session's brief); Payouts/Tax/Orders/Catalogue/
Invoices/Payments/Disputes/Refunds/Shipping remain `ModulePlaceholder` screens per the locked
session plan; real hex values still pending `design-system-reference.md`; the `userId`/
`vendorId` and JWT-storage inferences above are unverified against real backend source.

## 4. Overall honest status
- Backend: real, structurally consistent, schema-migrated, tested-in-code — but never compiled
  (no Maven Central access in this sandbox; unchanged this session).
- Frontend: **Sessions 1 and 2 are now real and compiler-verified.** `npm install`,
  `tsc -b --noEmit`, `vitest run`, and `vite build` all ran for real and passed for both the KYC
  slice + toast (Session 1) and the auth module + dashboard shell + Action Center (Session 2,
  see 3k). Sessions 3-8 (payouts/tax, orders, catalogue, invoices/payments,
  disputes/refunds/shipping, full sweep + admin console) have not started - their nav items
  exist in the shell as honest `ModulePlaceholder` screens, not built UI.
- Design system: typography and token *names* locked; actual color hex and all motion/animation
  decisions are either in an unshared reference doc or genuinely undecided — `tailwind.config.js`
  now carries explicit inline placeholder-hex warnings on every affected value, so this can't be
  missed by a future session or a copy-paste into a client build.
- **Frontend interaction gap now closed.** A real `vitest`/`jsdom`/`@testing-library/react`
  test suite (`src/test/App.interaction.test.tsx`) mounts the actual component tree and drives
  a real file-upload interaction through the real store and API wrapper, mocked only at the
  `fetch()` boundary (standing in for the live backend). 3/3 tests pass. This also caught a
  real bug invisible to the compiler: Session 1's toast wiring showed the identical error
  message twice at once (persistent banner + toast) on an upload failure - fixed, verified by
  the updated test, confirmed the production build and safelist still hold after the fix.
- Remaining blocking unknowns: `mvn test` (backend, still blocked on Maven Central access) and
  an actual live-backend call for the frontend (the new test mocks the network boundary, it
  doesn't confirm the real backend returns these exact shapes), and the real hex values behind
  `design-system-reference.md`.
