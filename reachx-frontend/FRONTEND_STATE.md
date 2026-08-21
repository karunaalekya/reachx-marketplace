# FRONTEND STATE — Read This First In Any New Session
**Give this file to a new session along with `MASTER_BLUEPRINT.md` (backend API spec) and
`design-system-reference.md` (full design system) before asking it to write any code.**

## What this is
React frontend for the ReachX multi-vendor marketplace backend (see `MASTER_BLUEPRINT.md`).
Built in a separate AI session from the backend — this file is the only record of what that
session has actually produced, since there is no zip/repo export yet. Treat every code snippet
below as **reported, not verified** — nothing here has been run, built, or tested.

## Stack (locked, do not re-litigate)
- React + Zustand for state management
- Tailwind CSS for all styling — inline `style={{}}` objects are explicitly rejected (can't
  express `:focus-visible`/`:hover`/responsive breakpoints, all required by the design brief)
- Directory structure mirrors backend module boundaries: `auth/`, `catalog/`, `orders/`,
  `vendor/`, `admin/`, `shared/` (tokens, primitives) — no `features/` wrapper layer
- Typography: Syne (storefront display only) + Plus Jakarta Sans (everywhere else) — Federo was
  considered and explicitly dropped, don't reintroduce it
- Full palette/type-scale/spacing tokens: see `design-system-reference.md`, and
  `tailwind.config.js` below

## Build order decision
Vendor dashboard first (deepest backend functionality — payouts, GST, TCS/TDS, disputes — is
most demonstrable there), then admin console, then customer storefront. Storefront has not been
started yet.

## Update — multi-document KYC contract wired (this session)

The backend moved from single-document to real multi-document KYC (see `MASTER_BLUEPRINT.md`'s
breaking-change note: `PATCH /vendors/{id}/kyc-decision` is gone, `kycDocumentUrl`/
`rejectionReason` are gone from `GET /vendors/{id}`). New, real frontend files were built against
that contract from scratch in this session — not patches to the old unverified snippets below,
which should be treated as superseded wherever they conflict with these:

- `src/vendor/api/kycApi.ts` — `listKycDocuments`, `uploadKycDocument` (presign → PUT → confirm,
  now per-`docType`), `decideKycDocument` (admin).
- `src/vendor/store/useVendorStore.ts` — KYC slice only (payout ledger / disputes slices from
  earlier passes are a separate concern, not reconstructed here). `documents` array —
  containing per-document `documentUrl` and `rejectionReason` — is excluded from `persist`'s
  `partialize`; only `vendorId`/`businessName`/`overallKycStatus` are cached. This is the actual
  fix for issue #7 below, now applied to the real multi-document shape rather than the old
  single-document one.
- `src/shared/components/VerificationBadgeStack.tsx` — rebuilt: draws only from
  `tint-{variant}-{bg,border,text}` classes (see new `src/shared/tokens/tint-colors.tailwind.js`,
  merge its `tintColors` export into the real `tailwind.config.js`), no arbitrary hex. Passive
  `StatusBadge` has no `tabIndex`/role; `InteractiveBadge` is a real `<button>` for the
  rejected-document "view reason" case. This resolves issues #2–#4 below for this component.
- `src/vendor/components/KycVerificationPanel.tsx` — rebuilt against the real 4-doc-type list
  (PAN/GSTIN/BANK_CHEQUE required, MSME_CERTIFICATE optional), lucide-react icons throughout
  (`UploadCloud`/`FileText`/`Loader2`, no emoji) — resolves issue #8 below for this component.

**Still open, not touched by this update:**
- `gstEngine.ts` PAN-aware TDS fix (issue #5/#6) — unrelated to the KYC panel itself, not
  re-verified in this pass.
- `VendorDashboardShell.tsx` emoji→lucide swap (issue #8) — only done for the KYC panel above;
  the shell itself wasn't in scope this session.
- No actual code export/repo exists yet for anything built in the *original* frontend session
  (see "Immediate next step" below, still accurate) — the 5 files above are fresh, real files
  written in this session's own sandbox, not a recovery of those earlier snippets.
- These new files have not been run through a real bundler/typechecker — same "reported, not
  verified" caveat as everything else in this doc applies to them too, though they were written
  directly against the backend's actual, verified-on-paper (not yet `mvn test`-verified either)
  contract rather than a guessed one.

---



- **`tailwind.config.js`** — theme extension mapping the palette to `brand.saffron`,
  `brand.indigo`, `feedback.neem`, `feedback.chilli`, `surface.storefront`, `surface.dashboard`,
  `surface.cardMuted`, plus `fontFamily.display` (Syne) and `fontFamily.sans` (Plus Jakarta Sans).
- **`src/shared/components/VerificationBadgeStack.tsx`** — the signature status-badge component
  (icon + tinted background + left border + sub-text). Refactored to Tailwind classes in the
  latest pass.
- **`src/shared/utils/gstEngine.ts`** — CGST/SGST/IGST split + TCS/TDS estimate calculator.
  **A corrected version was handed back** (see "Unresolved issues" below) — confirm the live
  file actually has the PAN-aware TDS fix before trusting any number it produces.
- **`src/vendor/store/useVendorStore.ts`** — Zustand store for KYC documents, payout ledger,
  disputes. **A corrected version was handed back** for the `persist`/`partialize` fix — confirm
  the live file excludes PAN/GSTIN/bank details/rejection reasons from localStorage before
  trusting it.
- **`src/vendor/components/KycVerificationPanel.tsx`** — KYC document list with inline rejection
  notes and a content-shaped skeleton loader.
- **`src/vendor/components/VendorPayoutLedger.tsx`** — payout table with gross/commission/TCS/
  TDS/net columns, tabular-nums formatting for ₹ amounts.
- **`src/vendor/layouts/VendorDashboardShell.tsx`** — left-rail nav + header shell wrapping the
  above.

## Unresolved issues — fix before/while continuing, don't rebuild from scratch around them

1. **KYC upload endpoint now exists — wire the frontend to it.** The backend previously had no
   way for a vendor to submit a KYC document at all. This is now fixed:
   `POST /vendors/{id}/kyc-documents/presign` (get upload URL) then
   `POST /vendors/{id}/kyc-documents` (confirm, body `{ "objectKey": "..." }`) — see
   `MASTER_BLUEPRINT.md` for exact shapes. **Important**: this is a single-document model —
   one `kycDocumentUrl`/`kycStatus`/`rejectionReason` for the whole vendor, not separate
   independently-tracked PAN/GSTIN/bank-cheque documents like the frontend's mock data assumed.
   Either simplify `KycVerificationPanel`/`useVendorStore` to one document, or flag to the
   project owner that a multi-document model needs a real backend schema change first — don't
   keep building multi-document UI against a single-document backend.
2. **Badge component doesn't consistently use its own tokens** — was raw arbitrary hex
   (`bg-[#EBF5F0]`) instead of the Tailwind theme. **Fix proposed and looks right**: a nested
   `colors.tint.{neem,chilli,saffron,muted}.{bg,border,text}` block in `tailwind.config.js`,
   referenced via classes like `bg-tint-chilli-bg` instead of arbitrary hex. Confirm this is
   actually applied to the live `VerificationBadgeStack.tsx`, not just proposed.
3. **Status tint hex values had drifted across passes** (two different hex sets for the same
   three states) — resolved by the tint-token fix in #2 above, which picks one canonical set.
   Confirm no other component still has a third, different hardcoded set.
4. **`tabIndex={0}` on every badge was wrong** — fixed: passive badges lose `tabIndex`/interactive
   roles entirely; a badge meant to be clickable (e.g. "view rejection reason") becomes a real
   `<button>` with `focus-visible:ring-2`. Confirm this split was actually applied everywhere
   `VerificationBadgeStack` is used, not just in the one example shown.
5. **`gstEngine.ts` TDS rate was originally hardcoded to 1% regardless of vendor PAN status** —
   doesn't match the backend's actual rule (1% with PAN, 5% without, Sec 206AA). A corrected
   version taking a `vendorHasPanOnFile` param was handed back — confirm it's actually in the
   live file, not just proposed.
6. **Backend now exposes `panOnFile: boolean` on `GET /vendors/{id}`** (added specifically to
   support the fix above) — confirm the frontend is actually fetching and passing this into
   `gstEngine.ts`'s calls, not still guessing/hardcoding it.
7. **`useVendorStore.ts`'s `persist` middleware was writing PAN, GSTIN, bank account numbers,
   and rejection reasons to `localStorage` unencrypted.** A `partialize`-based fix (allow-list
   only `vendorId`/`businessName`/`overallKycStatus`) was handed back — confirm it's live.
8. **Emoji used as nav/status icons** (📊 📜 📦 ⚠️) — inconsistent rendering across
   OS/browsers, not screen-reader friendly, reads as generic rather than the "precision tool"
   feel the brief asks for. **Fix proposed**: swap to named `lucide-react` icons (BarChart3,
   ShieldCheck, Package, AlertTriangle) — confirm applied to the live `VendorDashboardShell.tsx`.
9. **Directory structure flip-flopped once early on** (`src/features/vendor/...` vs
   `src/vendor/...`) — the later, settled convention is `src/vendor/...` with no `features/`
   wrapper (see structure above). Check nothing got built under the old path.

## Decisions already made (don't re-ask)
- Zustand over Redux Toolkit/Context — enough scale for cart/auth/checkout state without
  Redux's ceremony.
- Tailwind over inline styles or CSS Modules — needed for focus/hover states and responsive
  breakpoints the design brief requires.
- Syne is the sole storefront display face; Federo was explicitly dropped, not just unused.
- Vendor dashboard built before admin console and storefront.

## Session 1 — REAL, compiler-verified build (this session)

Everything below actually ran in a real sandbox with npm registry access - not another
"structurally reviewed, not run" pass.

**Scaffold created:** `package.json`, `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`,
`vite.config.ts`, `tailwind.config.js` (merges `tint-colors.tailwind.js` +
`motion.tailwind.js` - `premium-depth.tailwind.js` deliberately left unmerged, see its own
file for why), `postcss.config.js`, `index.html` (loads Syne + Plus Jakarta Sans from Google
Fonts), `src/index.css`, `src/main.tsx`, `src/App.tsx` (placeholder vendorId/authToken -
real auth is Session 2), `src/vite-env.d.ts`.

**Real commands run, real results:**
- `npm install` — 141 packages, 0 errors.
- `tsc -b --noEmit` (strict mode, `noUnusedLocals`/`noUnusedParameters` on) — **0 errors on
  first pass.** No compiler fixes were needed on the existing KYC-slice files.
- `vite build` — succeeded, 1520 modules transformed, real `dist/` output.
- **Safelist verified against actual compiled CSS, not assumed**: grepped the built
  `dist/assets/*.css` for all 9 dynamically-constructed classes
  (`bg/border/text-tint-{neem,chilli,saffron}-{bg,border,text}`) that `VerificationBadgeStack`
  and `OperationToast` build via template strings — **all 9 present.** This was flagged as an
  unresolved JIT-purge risk multiple times before; it's now confirmed fixed, not just
  addressed in config.
- `vite preview` smoke test — served, HTTP 200, `#root` present in HTML. This confirms the
  build serves; it does **not** confirm React mounted without a runtime console error (no
  headless-browser check was run) - flagging that gap honestly rather than overclaiming.

**OperationToast wired into KycVerificationPanel** (was built standalone, unwired before this
session): added `src/shared/hooks/useToasts.ts` (deliberately minimal - single active toast,
not a stacking system) and edited `KycVerificationPanel.tsx` to track in-flight uploads via a
ref and fire a toast on completion (success or failure, using the real store's `error` state).
**Real constraint found and handled, not glossed over**: `OperationToast` renders at a
hardcoded `fixed bottom-5 right-5` with no per-instance offset, so multiple simultaneous
toasts would render exactly on top of each other. `useToasts` replaces rather than stacks
until a real notification-stacking system gets designed - that's separate, undecided scope
(see the notification-center discussion in `PRESENT_POSITION_AND_DESIGN_DECISIONS.md`), not
invented here as a side effect of this wiring.

**Framer Motion**: added to `package.json` as a real dependency (decision already recorded as
"allowed, scoped to interactive/gesture moments"), not yet imported anywhere - no component
in this session's scope needs it yet (that starts with the rejection-reason drawer, later).

**Not done in this session, still open:**
- No headless-browser / interaction test (file input change, actual upload flow against a
  live backend) - this build has never talked to a real running backend, only compiled and
  served statically.
- `premium-depth.tailwind.js` remains unmerged, per its own held status.
- Real hex values still pending `design-system-reference.md` - `tailwind.config.js` has
  explicit placeholder comments on every brand/feedback/surface value.

## Post-Session-1 gap resolution (this pass)

Closed the two honestly-flagged gaps from Session 1, and one new real bug the resolution
itself surfaced:

**1. Built a real interaction test (`src/test/App.interaction.test.tsx`), not another
compile-only pass.** Added `vitest` + `jsdom` + `@testing-library/react` as real
devDependencies. This mounts the actual `App`/`KycVerificationPanel` component tree in a
browser-like DOM and drives a real file-input `change` event through the real store and the
real `kycApi.ts` fetch calls - the network layer is mocked at the `fetch()` boundary only
(standing in for the live backend, which still can't be reached from this sandbox - see below).
Three tests, all passing on a real `vitest run`:
- Mount with zero `console.error` calls (closes "confirmed the build serves, not that React
  mounts without a runtime error").
- Full presign → PUT → confirm upload flow, asserting the real success toast text renders.
- A failed-PUT path, asserting the real failure toast renders.

**2. Real bug found and fixed by the new test, not by inspection**: after Session 1's toast
wiring, an upload failure showed the *exact same error message* twice at once - once in the
pre-existing persistent error banner, once as the new toast's subtext. This is a genuine UI
redundancy the compiler/bundler can't catch (both render legally, no type error). Fixed in
`KycVerificationPanel.tsx`: the failure toast's subtext now reads "See the error above for
details." instead of repeating the error verbatim; the full message still renders exactly
once, in the banner. Test updated to assert the corrected (non-duplicated) behavior.

**3. Real, stated limit - not resolved, because it can't be from here:** this is still not a
live-backend test. No Spring Boot server has run in this sandbox (same Maven Central
limitation as the rest of the backend work). The fetch-boundary mock in the new test stands in
for a real server response, and is a genuine step up from "never exercised the interaction
code path at all" - but it is not equivalent to confirming the real backend actually returns
these shapes. That confirmation still requires either a real `mvn` build in an environment with
Maven Central access, or pointing this frontend at a real running instance and clicking through
it by hand.

## Session 2 — Auth + shell + real nav (this session, real, compiler-verified)

Built against the real, live-confirmed backend contract handed off at the start of this
session (register → DB persist → login → JWT issuance verified end-to-end in a real Codespace;
several real backend bugs found and fixed by actually exercising it). Everything below is real
code in this zip, not reported-only.

**New files:**
- `src/auth/api/authApi.ts` — `login()` only, matches the confirmed 200 (`token`/`role`/
  `userId`/`displayName`) and 401 (`error`/`timestamp`/`status`) shapes exactly. Vendor
  self-registration (`POST /vendors/register`) is also confirmed live but out of this
  session's scope (login + shell only) — add `registerVendor()` here when scheduled.
- `src/auth/store/useAuthStore.ts` — token kept **in memory only**, no `persist` middleware at
  all (not even a `partialize`d one). Reasoning on record in the file itself: the confirmed
  login contract returns the JWT in the JSON body (not a `Set-Cookie` header), and the existing
  `kycApi.ts` already sends it back manually as `Authorization: Bearer <token>` — inferred from
  the contract and the already-real Bearer-header code, **not** from reading `JwtService.java`/
  `SecurityConfig.java` directly (not available this session, flagged as such rather than
  claiming a file read that didn't happen). Real, stated tradeoff: no session survives a page
  refresh. Also flagged: the login response has no `vendorId` field, only `userId` — every
  vendor-scoped call in this build treats `userId` as the vendor id, unconfirmed against the
  real `AuthController`/`Vendor` entity.
- `src/auth/components/LoginForm.tsx` — real form, real submit, renders the exact confirmed
  401 error text.
- `src/vendor/api/accountHealthApi.ts` — `GET /vendors/{id}/account-health`, confirmed live
  this session. `rating` typed as `string`, not narrowed to the doc's band names — the live
  example (`"GOOD"`) doesn't match the band vocabulary (`"Good"`) and guessing which is
  canonical would repeat the gstEngine mistake (3f). Callers derive their own tier from
  `overallScore`.
- `src/vendor/components/ActionCenterCard.tsx` — real KYC-rejection data (shared
  `useVendorKycStore`) + real account-health data. Third data source (pending disputes /
  orders awaiting dispatch) is a **static, honest placeholder**, not a fetch against a guessed
  URL — no vendor-scoped dispute or order-list endpoint was confirmed live this session (only
  `POST /orders` and `GET /orders/{id}` were named, no list endpoint; no dispute endpoint at
  all). Wire it for real in Session 4 (Orders) / Session 7 (Disputes).
- `src/vendor/layouts/VendorDashboardShell.tsx` — left nav rail, lucide icons throughout
  (closes issue #8 for the shell itself, not just the KYC panel), nav scoped to real
  backend-module endpoints only per the 3g sidebar decision. No routing library added — no
  react-router-dom decision is on record anywhere in this project (adding an unrecorded
  dependency was already called out once, for Radix). Nav is state-based
  (`activeSection`) instead.
- `src/vendor/layouts/ModulePlaceholder.tsx` — honest "not built yet" screen for the 9 nav
  items with a real endpoint but no UI yet, instead of a fake table.
- `src/shared/hooks/useRefetchOnFocus.ts` — refetches KYC documents on tab
  visibility/focus regain, not just on mount. Closes the Session 2 "cached `overallKycStatus`
  self-corrects instead of going stale" goal.
- `src/shared/components/StaggerReveal.tsx` — the one page-load choreography (shell → header →
  content, ~50ms stagger, ~420ms total), defined once, reused as-is by every section. Plain CSS
  keyframe (`shell-reveal`, added to `motion.tailwind.js`) + `motion-safe:`/`motion-reduce:`,
  not Framer Motion — the Framer Motion decision (3f) scoped it to gesture/interactive moments
  only, a page-load reveal is a loading state. Delay classes are 5 fixed literal strings, not
  template-constructed, so Tailwind's JIT picks them up without a safelist entry.
- `tailwind.config.js` — `premium-depth.tailwind.js` merged in this session (shell + card
  surfaces now exist to apply `shadow-premium-card`/`-hover` to, per its own hold note and 3c).

**Real commands run, real results:**
- `tsc -b --noEmit` (strict) — 0 errors.
- `npx vitest run` — **5/5 passing**, including a real bug the test caught and fixed, not
  glossed over: `ActionCenterCard` called `fetchKycDocuments` without first calling
  `setVendorContext`, so the store silently bailed out with "No vendor context set" and never
  called `fetch()` at all when a vendor lands on Home before ever opening the Verification tab.
  Fixed by having `ActionCenterCard` set vendor context itself rather than assuming
  `KycVerificationPanel` had already run first. The interaction test suite was extended (not
  replaced) to drive the real login form before reaching the KYC panel, since the panel is now
  nested behind the auth gate + shell nav instead of being the page root.
- `npm run build` (`tsc -b && vite build`) — succeeded, 1529 modules, real `dist/`.
- Safelist/purge check re-verified for this session's new dynamic-looking classes, not
  assumed safe by analogy: grepped the compiled CSS for all 5 `[animation-delay:Nms]`
  selectors. All 5 present — note the CSS minifier rewrites `100ms`/`150ms`/`200ms` to
  `.1s`/`.15s`/`.2s` (values ≥100 get unit-optimized), which made an early grep for the literal
  string `"100ms"` look like a false purge failure. Re-checked with an exact selector match,
  confirmed real.

**Not done this session, still open:**
- No live-backend call attempted from this sandbox — same as every session before it, this is
  compiled/tested against the documented contract, not exercised against the real running
  Spring Boot instance mentioned in this session's brief.
- Payouts/Tax/Orders/Catalogue/Invoices/Payments/Disputes/Refunds/Shipping are nav items with
  `ModulePlaceholder` screens, not built UI — per the locked session plan (3h), these are
  Sessions 3–7.
- Real hex values still pending `design-system-reference.md`.
- The `userId`-as-`vendorId` assumption in `useAuthStore.ts` is unverified against the real
  backend entity model.
- Action Center's disputes/orders slot is a static placeholder, not live data — see above.

## Session 3 — Payouts + Tax, REAL, compiler-verified build (this session)

Actual backend source read directly this time (cloned `karunaalekya/reachx-marketplace`,
`marketplace-springboot` — controllers/DTOs/entities, not MASTER_BLUEPRINT.md prose alone).
This surfaced two corrections to the plan this doc had on record:

- **`GET /payouts/mine` is not the ledger's data source.** `PayoutResponse` only carries the
  gateway-transfer side (`amount`, `gateway`, `status`, `failureReason`, `retryCount`,
  `initiatedAt`/`completedAt`) — not gross/commission/TCS/TDS. That breakdown actually lives on
  `GET /commissions/mine` (`CommissionRecordResponse`: `grossAmount`, `commissionRate`,
  `commissionAmount`, `tcsAmount`, `tdsAmount`, `vendorNetPayable`, `payoutStatus`). Built against
  both, joined by `orderId` in `usePayoutStore.ledgerRows()`.
- **No CGST/SGST/IGST split exists anywhere in this schema.** `CommissionRecord` only has
  combined `tcsAmount`/`tdsAmount`. The Micro-Ledger Accordion renders TCS/TDS only — the fields
  that actually exist — not the GST breakdown floated in 3i below.

Built: `payoutApi.ts` (real endpoints — `/commissions/mine`, `/commissions/mine/pending-total`,
`/payouts/mine`, `/tax-withholding/mine/{fy}`, all read from the real controllers), `usePayoutStore.ts`
(separate file, no persist — this data is more sensitive than the KYC store's already-excluded
fields), `VendorPayoutLedger.tsx` (ledger + Micro-Ledger Accordion + FY tax-totals card, wired into
both the Payouts and Tax nav slots), `OperationToast` fires on a payout transitioning to
`COMPLETED` (detected via a status diff in `fetchLedger`, not guessed/simulated). `tabular-nums`/
`font-mono` on every ₹ figure. `shadow-premium-card`/`-dropdown` applied to the ledger's cards and
the expanded accordion panel. Main content width bumped 3xl → 4xl — the ledger row (order info +
amount + status badge + chevron) needed it; Home/KYC still read fine at this width.
`npx tsc -b` and `npm run build` both pass clean.

Not done this session: pagination UI for the ledger (fetches one page of 100 — no
infinite-scroll/pagination decision is on record anywhere, not inventing one); a per-order tax
drill-down (the backend has no vendor-facing endpoint for that — `/tax-withholding/vendor/{vendorId}`
is ADMIN-only, only the FY-aggregate `/mine/{fy}` is vendor-scoped).

## Design tokens — real palette LOCKED (post-Session-3, pre-Session-4)

`design-system-reference.md` hex values confirmed via client conversation. Went through two
briefs on `brand.indigo` (`#10142D` first, `#1E254C` second — directly contradictory reasoning
between the two) — Raj confirmed `#1E254C` final on 2026-08-21: most recent explicit brief,
already wired/verified, not reopening this again. Real, compiler-verified — `npm run build`
clean after every change below.

- `brand.indigo` → `#1E254C` (LOCKED). `brand.saffron` → `#E05A10` (LOCKED, unchanged across
  both briefs — energetic true saffron/orange, not pale gold — direction given as "Razorpay
  meets Zepto/Blinkit Partner" / "Stripe meets Swiggy Partner").
- `tint.neem`/`tint.chilli`/`tint.saffron` bg/border LOCKED (unchanged across both briefs) in
  `tint-colors.tailwind.js`. `text` values were never in either client contract (bg/border
  only) — still a derived value (same darkening ratio the prior placeholder set used), flag for
  real design review if an exact text hex gets specified later.
- `feedback.neem`/`feedback.chilli` DROPPED from `tailwind.config.js` — grep confirmed these
  were never rendered anywhere (every status surface already used `tint.*`); the client's
  second-round hex matrix reused those names but with hex identical to the already-locked
  `tint.*` values, so it's a naming overlap, not a new token.
- `surface.storefront` → `#FDFBF7` (LOCKED), `surface.dashboard` → `#FFFFFF` (LOCKED),
  `surface.cardMuted` → `#F3F3F1` (LOCKED, 2026-08-21) — full palette is now confirmed, zero
  placeholders remaining.

## Stabilization sweep (this pass) — real, compiler-verified

Not filed as "Session 4" of either session plan on record — this doc's own plan calls Session 4
"Orders," while `PRESENT_POSITION_AND_DESIGN_DECISIONS.md`'s table calls it "Disputes +
close-out." Both were checked against the real backend before starting anything: `DisputeController`
exposes zero vendor-facing endpoints (every method is either public-no-auth for a customer
raising a dispute, or `@PreAuthorize("hasRole('ADMIN')")`) — no `/disputes/mine` pattern exists,
unlike every other vendor module. Building disputes UI now would mean inventing an endpoint
shape, which this project's own discipline explicitly rejects. Orders has the same gap per this
doc's own prior note (no vendor-scoped order-list endpoint confirmed live either). So this pass
did the one thing that didn't depend on an unresolved backend contract: closing out issues
already on record as fixed, and one real gap in the fix itself.

**`framer-motion` removed from `package.json`.** Grepped `src/` first — zero references to
`AnimatePresence`, `motion.`, or `framer` anywhere in the codebase. It was added in Session 1 as
a scoped-for-later dependency but never actually used (the one page-load animation,
`StaggerReveal.tsx`, uses a plain CSS keyframe + `motion-safe:`/`motion-reduce:`, not Framer
Motion). Removing an unused dependency, not a code migration.

**Issues #1–9 swept live, not just asserted:**
- #1 (multi-doc KYC upload wired) — confirmed: `kycApi.ts` types `docType` per the real 4-type
  enum, not the old single-document model.
- #2–4 (badge tokens, hex drift, `tabIndex`) — confirmed live in `VerificationBadgeStack.tsx`:
  `StatusBadge` has no `tabIndex`/role, `InteractiveBadge` is a real `<button>`, both draw only
  from `tint-{variant}-{bg,border,text}` classes. Grepped for `bg-[#` across `src/` — zero
  arbitrary-hex classes remain (only in explanatory comments).
- #5–6 (gstEngine PAN-aware TDS) — superseded, not fixed in place: there is no frontend
  `gstEngine.ts` in this build at all. Session 3 confirmed PAN-aware TDS is computed and
  persisted entirely server-side (`TaxWithholdingService.java`, 1%/5% by `panOnFile`, with real
  unit tests). The frontend reads `commission.tdsAmount` directly off `GET /commissions/mine` —
  `panOnFile` isn't referenced client-side at all because there's nothing left for it to drive.
- #7 (PII in localStorage) — confirmed: `useVendorKycStore`'s `partialize` allow-lists only
  `vendorId`/`businessName`/`overallKycStatus`; `usePayoutStore` has no `persist` middleware at
  all.
- #8 (emoji icons) — confirmed: zero emoji characters anywhere in `src/`.
- #9 (directory structure) — confirmed: no `src/features/` directory exists anywhere.

**S3-confirm-drop gap (issue #1 in the session-plan table, distinct from the numbered list
above) — designed and built, not just flagged again.** `kycApi.ts`'s `uploadKycDocument` was
split into `presignAndUploadToBucket` and `confirmBucketUpload` — two independently-retryable
steps, because they fail differently: a failed PUT means nothing reached the bucket (plain
upload failure, nothing to retry); a failed confirm means the file is already safe in the
bucket and only the backend's record of it is missing. `useVendorKycStore` gained a
`pendingConfirm` field (in-memory only, deliberately excluded from `persist` — same reasoning
as `documents`, this bridges a network blip within a session, not a reload) and a
`retryConfirm` action that re-calls confirm with the same `objectKey`, no re-upload.
`KycVerificationPanel.tsx` renders an explicit "Retry confirmation for {doc}" button in the
error banner when this state is set, and fires a distinct toast ("needs one more step," not
"upload failed") so a vendor isn't told the upload failed when the file is actually sitting
safely in the bucket. Not implemented as an automatic retry-in-store loop — matches this
project's own prior rejection of that approach for the same reason (state that can't survive a
reload shouldn't silently retry as if it can).

**New test added, not just written and assumed passing:**
`src/test/App.interaction.test.tsx` gained a sixth case exercising the real drop→retry path at
the `fetch()` boundary — PUT succeeds, confirm throws, asserts the distinct pending-confirm UI
renders, clicks retry, asserts only one more `fetch` call happens (to confirm, not presign or
PUT) and the pending state clears. `npx vitest run`: **6/6 passing.** `npx tsc -b --noEmit`:
0 errors. `npx vite build`: 1532 modules, clean `dist/`.

## Immediate next step
1. **Orders + Disputes are now built and wired** (this pass). Both replace their
   `ModulePlaceholder` in `VendorDashboardShell.tsx`. Endpoints confirmed live in the real repo
   (`karunaalekya/reachx-marketplace`, `marketplace-springboot`) - controllers, services, DTOs,
   and enums all read directly, not inferred:
   - `GET /orders/mine` (+ optional `?status=`) and `GET /orders/mine/status-counts` -
     `OrdersPanel.tsx` renders Amazon/Flipkart-style status tabs with live badge counts, each
     vendor order expands to show only that vendor's own line items (never another vendor's,
     enforced server-side in `VendorOrderResponse.from`) plus inline shipment tracking
     (courier/AWB/status, with an explicit "Past ship-by deadline" flag off the server-computed
     `overdue` field - not recomputed client-side, to avoid disagreeing with the backend's own
     definition of overdue).
   - `GET /disputes/mine` - `DisputesPanel.tsx` is deliberately read-only: raising a dispute is
     a public customer-facing action, resolving one is ADMIN-only
     (`PATCH /disputes/{id}/resolve`) - neither belongs in a vendor dashboard, confirmed against
     the real `DisputeController`.
   - `npx tsc -b --noEmit`: 0 errors. `npx vitest run`: 6/6 (existing suite, untouched, still
     green - no test added for these two panels yet, unlike the KYC retry-confirm fix, which had
     one added). `npx vite build`: clean, 1538 modules. Dynamic `tint-*` classes for the two new
     status-badge components confirmed present in the built CSS via the existing safelist - no
     new safelist pattern was needed.
   - `userId`-as-`vendorId` in `useAuthStore.ts` - stays CLOSED, confirmed prior pass.

2. **Real, live, NOT fixed - flag this to the client/backend owner:** `GET /orders/{id}` is
   still public with no auth check and returns `OrderResponse.from(order)` - the *entire* order
   including every vendor's items, prices, and quantities, to anyone who has (or guesses) the
   numeric ID. This predates the `/mine` work and is unrelated to it, but it's a real,
   live cross-vendor data leak sitting in the current backend. Needs an ownership/role check
   before this goes anywhere near a real client.

3. No test coverage yet for `OrdersPanel.tsx` / `DisputesPanel.tsx` - the existing
   `App.interaction.test.tsx` only covers login + KYC upload/retry. Worth a follow-up pass at
   the `fetch()` boundary, same style as the KYC retry test, before this ships further.

4. After the vendor-dashboard phase: admin console, then storefront.
