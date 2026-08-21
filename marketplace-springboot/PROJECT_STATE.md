# PROJECT STATE — Read This First In Any New Session

**Instruction for whoever picks this up (human or AI): read this file, `README.md`, and
`ROADMAP.md` completely before writing or suggesting any code. Do not ask the person to
re-explain the project — everything needed is in these three files.**

## What this is
Backend for a multi-vendor eCommerce marketplace (Indian market). Client-facing pitch:
BJNEXUS.AI, freelance dev proposing to Edithtech ReachX. Client asked for React + Spring Boot
+ PostgreSQL + Redis + Kafka + Razorpay/Cashfree/PayU + Shiprocket — that exact stack is what's
built (not substituted).

## Current state (as of last session)
- **KYC moved to a real multi-document model** (this session, supersedes the single-document
  entry directly below). The single-document model was shipped first as the safe, minimal option
  and explicitly flagged as a real design gap rather than silently expanding scope - an earlier
  proposal to build multi-document as a quick bolt-on was reviewed and rejected first (wrong
  `vendorId` type - `String` instead of this codebase's `Long`; wrong package path suggesting it
  wasn't written against the real code; a hardcoded `approvedCount == 3` that would silently
  break the moment a 4th required doc type was added; and, most importantly, no actual per-
  document admin decision endpoint - the entire stated point of going multi-document). This build
  fixes all of that and adds the missing piece:
  - New `vendor_kyc_documents` table (V18 migration), one row per `(vendor, docType)`. `docType`
    is `PAN` / `GSTIN` / `BANK_CHEQUE` (all required) / `MSME_CERTIFICATE` (optional, uploadable
    and reviewable but not counted toward overall approval). Required-ness lives on the
    `VendorKycDocument.DocType` enum itself (`isRequired()`), never as a hardcoded count anywhere
    - this is the direct fix for the `approvedCount == 3` bug from the rejected proposal.
  - `Vendor.kycDocumentUrl` and `Vendor.rejectionReason` are **dropped** (V18 also does a
    best-effort backfill of any existing single-document row into a `PAN`-typed row before
    dropping - lossy for any `document_url` shape that doesn't end in the object key, flagged in
    the migration's own comment, not treated as a real production data-migration concern since
    there are no real rows yet). `Vendor.kycStatus` stays, but is now a **derived** field -
    `VendorService#recomputeOverallKycStatus` sets it from the current per-document statuses
    every time a document is uploaded or decided, rather than being directly admin-set.
  - **New**: `GET /vendors/{id}/kyc-documents` (self/admin, lists what's actually been uploaded -
    no synthetic placeholder rows for un-uploaded types) and
    `PATCH /vendors/{id}/kyc-documents/{documentId}/decision` (admin, approves/rejects ONE
    document - this is the endpoint the rejected proposal was missing entirely).
  - **Removed**: `PATCH /vendors/{id}/kyc-decision` (whole-vendor decision) - no longer makes
    sense once decisions are per-document. This is a real breaking API change, called out
    explicitly at the top of `MASTER_BLUEPRINT.md`'s KYC section.
  - Presign/confirm endpoints updated: `KycPresignedUploadRequest` gained a required `docType`
    field; the resulting `objectKey` embeds it as its own path segment
    (`vendor-kyc/{vendorId}/{docType}/...`), and `confirmKycUpload` recovers `docType` from that
    trusted path rather than accepting it as separate, independently-spoofable input at confirm
    time - same trust model this codebase already used for the vendorId-prefix check, just
    extended one segment further.
  - `VendorServiceTest` rewritten for the new shapes: presign namespacing (now vendor+docType),
    first-upload and re-upload-after-rejection (now per-document, verifying the row is updated in
    place rather than duplicated), cross-vendor key rejection, a new malformed-objectKey-missing-
    docType-segment case, per-document approve/reject (including the "approving the last required
    type flips the vendor to ACTIVE" and "rejecting one type after the vendor is already ACTIVE
    sets kycStatus=REJECTED but does NOT silently demote status back to INACTIVE" cases - that
    second one is a deliberate design choice: an admin who actually wants to stop an active
    vendor from selling has `VendorService#suspend` for that, an explicit action, not an implicit
    side effect of a document re-review), already-approved/reject-without-reason error cases, and
    the list endpoint returning only uploaded slots (not placeholders for the rest).
  - **Not built, flagged as a real gap**: no append-only history of past document
    submissions/decisions - a re-upload or re-decision overwrites the row in place, so "what did
    the GSTIN certificate look like before this vendor's second submission" isn't answerable from
    this schema. Would need a separate audit table if that's ever a real requirement (e.g. a
    dispute over what was actually reviewed).
  - **Still unverified, same as everything else in this project**: this has never been compiled.
    No Maven Central access in this environment (see network-configuration note below) - `mvn
    test` has not been run against this code. Treat the multi-document build with the exact same
    "trust after `mvn test`, not before" posture as the rest of this file already asks for.
- **KYC document upload endpoints added** (prior session, now superseded by the multi-document
  model above - kept here for history): the frontend session had built a KYC
  upload UI against an invented presigned-S3 API contract that didn't exist anywhere in this
  backend — checked `MASTER_BLUEPRINT.md` directly and confirmed the only vendor-KYC endpoints
  that existed were the admin queue/decision ones, nothing letting a vendor submit a document at
  all. Added the real thing, following `ProductImageController`/`ProductImageService`'s exact
  two-step presigned-upload pattern (reuses the same `StorageService` abstraction, already
  cross-module-shared with `invoice`):
  - `POST /vendors/{id}/kyc-documents/presign` (VENDOR, self-only) — returns a short-lived upload
    URL, objectKey namespaced under `vendor-kyc/{vendorId}/`.
  - `POST /vendors/{id}/kyc-documents` (VENDOR, self-only) — confirms the objectKey landed,
    verifies it falls under the calling vendor's own namespace (blocks cross-vendor key reuse,
    same defense `ProductImageService.confirmUpload` already has), sets `kycDocumentUrl`, and
    always resets `kycStatus` to `PENDING` + clears `rejectionReason` — works identically for a
    first submission or a re-upload after rejection.
  - **Important scope note, called out explicitly in `MASTER_BLUEPRINT.md`**: this is a
    **single-document model** — `Vendor.kycDocumentUrl` is one field, one status, one rejection
    reason for the whole vendor. The frontend session's mock data assumed separate independently-
    tracked documents (PAN / GSTIN / bank cheque each with their own status) — that was ahead of
    what this backend actually supports. A true multi-document model would need a new
    `VendorKycDocument` entity (one row per doc type) — a real schema change, not implied by
    anything built here. Flag this to whoever owns the frontend before more UI gets built assuming
    multi-document.
  - 4 new tests in `VendorServiceTest`: objectKey namespacing on presign, status/URL reset on
    first upload, rejection-reason clearing on re-upload after a REJECTED vendor re-submits, and
    rejection of a cross-vendor objectKey.
  - `MASTER_BLUEPRINT.md` updated with both endpoints' full request/response shapes and the
    scope note above.
- **`panOnFile` added to `VendorResponse`** (this session): found while directing a separate
  frontend-build session — the frontend needs to predict which TDS rate a commission record
  will get (1% Sec 194-O with PAN, 5% Sec 206AA without, see `TaxWithholdingService`), and
  `panNumber` was captured on `Vendor` at registration but never returned by any response DTO.
  `MASTER_BLUEPRINT.md` had already flagged this exact gap as a known TODO (section on "Why TDS
  is sometimes 5%") — confirms it was a real, anticipated gap, not a new invention. Exposes a
  **boolean**, not the raw PAN number, since that's all the frontend use case needs.
  `VendorServiceTest` updated with an assertion proving it. `MASTER_BLUEPRINT.md`'s vendor
  registration response example and the stale "infer it from tdsAmount" TODO both updated to
  match.
- Also found and fixed while directing that same frontend session (prior to the `panOnFile` fix
  above): `CommissionRecordResponse` was missing `tcsAmount`/`tdsAmount`/`vendorNetPayable`
  fields the entity already had; `MASTER_BLUEPRINT.md` didn't document `TaxWithholdingController`'s
  endpoints at all, and had a stale `payouts/mine` example showing the pre-tax amount instead of
  the actual post-tax `vendorNetPayable` transferred. Both already fixed and present in this zip.
- **Frontend-driven backend fixes** (this session): while directing a separate frontend-build
  session, two real gaps surfaced by checking what the frontend actually needed against what
  the API actually returns.
  1. **`CommissionRecordResponse` was missing fields the entity already had** - `CommissionRecord`
     has carried `tcsAmount`/`tdsAmount`/`vendorNetPayable` since V16, but the DTO exposed via
     `GET /commissions/mine` was never updated to include them, so there was no real endpoint
     returning the per-order tax breakdown a vendor payout ledger UI needs. Fixed - DTO now
     returns all three. No other call sites constructed this DTO, so this was a safe, contained
     change.
  2. **`MASTER_BLUEPRINT.md` didn't document `TaxWithholdingController` at all** (new Section 7b)
     - the vendor self-view (`GET /tax-withholding/mine/{financialYear}`) and admin GSTR-8/TDS
     reporting endpoints exist and work but were invisible to anyone building against the
     blueprint alone. Also fixed a related doc bug while in there: Section 7a's `GET
     /payouts/mine` example `amount` still showed the pre-tax `vendorPayoutAmount` figure, but
     `PayoutService` actually transfers `vendorNetPayable` (post-TCS/TDS, lower) - corrected the
     example and added an explicit note on which field means what.
  - Flagged, not fixed: there's no `panOnFile` boolean exposed on `GET /vendors/{id}`, needed to
    explain the 1%-vs-5% TDS rate difference (Sec 206AA) in a vendor-facing UI without the
    vendor having to infer it by back-calculating from `tdsAmount`. Noted in the blueprint as a
    "worth adding" rather than built, since no frontend session had asked for it yet.
- **Shipping/tax review pass, two real bugs fixed** (prior session): after V17 added
  `shipping_fee_amount`/`tax_amount` to orders and per-vendor shipping charges
  (`order_vendor_shipping_charges`), this session traced every module touching `Order`/money
  end-to-end to check nothing was missed.
  1. **`RefundService` bug (fixed)**: `initiateRefund` computed `refundAmount` purely from
     `OrderItem::getLineTotal`, so a refunded vendor's own shipping charge was silently dropped -
     the customer would be refunded for that vendor's items but not the shipping fee that vendor
     collected. Fixed to add `OrderVendorShippingCharge` (via
     `OrderVendorShippingChargeRepository.findByOrderIdAndVendorId`) on top of the items total,
     same pattern `InvoiceService` already used. Constructor gained a new
     `OrderVendorShippingChargeRepository` param - `RefundServiceTest` updated (only manual
     `new RefundService(...)` call site) plus two new tests: one proving shipping is folded into
     the refund, one proving a multi-vendor order only pulls *that* vendor's shipping charge (and
     never even looks up the other vendor's).
  2. **V17 migration bug (fixed)**: every money column elsewhere in this schema is
     `CHECK (... >= 0)` (see V1, V3, V6, V15, V16) - V17's `shipping_fee_amount`/`tax_amount`
     (orders + invoices) and the new `order_vendor_shipping_charges.shipping_fee_amount` were
     missing that constraint. Added to match the established pattern.
  - Checked but NOT a bug: `InvoiceService`'s Shiprocket integration reads `OrderItem::getLineTotal`
    for `sub_total` in the Shiprocket payload - that field is documented by Shiprocket as declared
    goods value, not freight, so excluding the shipping fee there is correct as-is, not an
    oversight to fix.
  - Still unverified: same as everything else in this project, `mvn test` has not actually been
    run (see "Immediate next step" below) - this review pass found bugs by reading, not by
    running tests.
- **TCS + TDS statutory withholding, now built** (prior session): a gap found by asking
  "does everything a real e-commerce *operator* legally owes exist?" — separate question from
  the vendor-side GST invoicing (pass 4) or the payout mechanics (pass 5), because TCS/TDS are
  obligations THIS platform carries, not the vendor. V16 migration adds `tcs_amount`,
  `tds_amount`, `vendor_net_payable` to `commission_records`, plus a new `tax_withholding_records`
  filing-snapshot table (also fixes a real pre-existing bug found while doing this: V6's
  `payout_status` CHECK constraint was missing `CANCELLED_REFUNDED`, which the Java enum and
  `RefundService` have both used since V7/V8). New `tax` package: `TaxWithholdingRecord` entity,
  `TaxWithholdingService` (computes TCS at 1% of gross with the same customerState-vs-vendor.state
  CGST+SGST-vs-IGST split InvoiceService already does, and TDS at 1%/5% depending on whether the
  vendor has a PAN on file), `TaxWithholdingController` (admin GSTR-8/TDS-quarterly reporting +
  vendor self-view). `CommissionService.recordCommission` now computes and snapshots both taxes
  at the same `order.paid` moment everything else in that record gets snapshotted.
  `PayoutService` now transfers `vendorNetPayable` (post-tax), not the pre-tax
  `vendorPayoutAmount` — `PayoutServiceTest` updated accordingly (it was hardcoding the old
  pre-tax amount, which would have silently gone stale otherwise). `ROADMAP.md`'s TCS/TDS gap is
  now ✅. **Honest simplification, documented in README**: TDS is deducted on every sale
  unconditionally rather than only past the real ₹5L/FY Sec 194-O threshold, since there's no
  per-vendor-per-FY running-total lookup in this schema yet — safer direction to be wrong in
  (operator liability vs. vendor reclaiming excess credit), not a shortcut taken lightly.
- **Vendor payouts are now built** (prior session): V14 migration adds `vendor_payout_accounts`
  (bank/UPI beneficiary details, account number encrypted at rest via AES/GCM - see
  `common/security/AesGcmStringConverter.java`), V15 adds `payouts` (one row per commission
  record, unique-constrained so a payout can never happen twice for the same commission record).
  New `payout` package: `VendorPayoutAccount`/`Payout` entities, `PayoutGateway` interface with
  `CashfreePayoutGateway` (primary) and `RazorpayXPayoutGateway` (alternate) implementations,
  `VendorPayoutAccountService` (self-service bank/UPI registration + gateway beneficiary
  verification), `PayoutService` (the actual worker - Kafka listener off new `payout.eligible`
  topic, own consumer group `payout-service` + own DLT), `PayoutAccountController` +
  `PayoutController` (vendor self-service, admin reconciliation/retry, both gateways' status
  webhooks). `ShippingService` now publishes `payout.eligible` the moment a shipment's tracking
  webhook reports `DELIVERED` - this is the actual trigger point from the locked architecture
  (see decision #1 below). `ROADMAP.md`'s vendor-payout gap is now ✅ - all three 🔴 items from
  the locked decisions are done. Full detail in README.md's "Gaps closed — pass 5" section,
  including why payout gateway calls deliberately do NOT follow the same
  "let-exceptions-reach-Kafka's-retry/DLT" pattern used everywhere else in this codebase (money
  movement, not data - a blind retry risks a double payout).
- **GST invoice generation** (prior session): V12 migration adds required
  `customerState` to orders (needed to compare against vendor state for CGST+SGST vs IGST),
  V13 adds `invoices`/`invoice_sequences` tables, new `invoice` package (entity, repository,
  atomic per-vendor-per-FY sequence allocator, OpenPDF generator, service, Kafka listener off
  `shipment.created`, controller). `ROADMAP.md`'s GST invoice gap is now ✅. Full detail in
  README.md's "Gaps closed — pass 4" section — including the two real, documented
  simplifications: flat 18% rate (no HSN/tax-rate field on Product to do per-category rates),
  and tax extracted from within the already-collected amount rather than added on top (since
  checkout never collected a separate tax line). **This is a breaking change to
  `POST /api/v1/orders`** — `customerState` is now required; `MASTER_BLUEPRINT.md` updated to
  match.
- **117+ Java files, 15 Flyway migrations (V1–V15), builds a complete transactional core**, plus
  the product-images pass (previous session): V11 migration, `ProductImage` entity, presigned-URL
  S3-compatible upload flow (`catalog/storage`), `ProductImageController`/`Service`, and
  test coverage in `ProductImageServiceTest`. `ROADMAP.md`'s "product images" gap is now ✅.
- Could NOT be compiled/tested in the sandbox this was built in — no Maven Central network
  access there. **Never assume it compiles clean until `mvn test` has actually been run somewhere
  with real internet access.** See "Immediate next step" below. This applies to the new payout
  code too — same as everything else, unverified until `mvn test` actually runs. The Cashfree
  Payouts and RazorpayX gateway integrations specifically are implemented against public API
  documentation only, same honesty posture this file already gives PayU — neither has been
  exercised against a live sandbox account (no credentials available in this environment).
  Validate one real end-to-end payout before trusting either with real vendor money.
- Full module list, what's implemented, and all known limitations: see `README.md`.
- Full gap list against a *complete* production marketplace (reviews, notifications, etc.): see
  `ROADMAP.md` — this is the most important file for "what's left." All three 🔴 items from the
  locked decisions below are now done: vendor payouts, GST invoices, and (from before the locked
  decisions existed) product images.
- Frontend: NOT built. `MASTER_BLUEPRINT.md` is the complete API spec for building it
  separately (self-contained, no backend source needed to use it).

## Note on unexplained files (2026-08-18)
`catalog/storage/S3StorageService.java` (and its supporting `StorageService` interface) appeared
in this session's working copy already written, owned by a different filesystem user than the
session's own file-creation calls, and was not present in the originally uploaded zip. Content
was reviewed and is functionally sound (S3-compatible presign/delete, correct `forcePathStyle`
handling for non-AWS endpoints) with nothing malicious found — it was kept and built on rather
than discarded. Flagging here so a future session doesn't assume it was hand-verified line by
line the way normal review passes are; treat it with the same "verify before trusting" posture
as anything else in this codebase.

## Decisions already made (don't re-litigate these)
- Backend is Spring Boot/Java, not Node — this was a deliberate correction after early
  confusion in the project's history; client explicitly asked for Java.
- Admins are a separate DB table from vendors, not a role flag on vendors (security decision).
- Refunds are scoped per-vendor within a multi-vendor order, not per-whole-order.
- PayU is intentionally partial: checkout works, webhook verification is implemented but
  unvalidated against a live sandbox, refunds are unbuilt and throw explicitly rather than fake
  success. This was a deliberate honesty choice, not an oversight — don't "fix" it by faking it.

## Decisions locked (2026-08-18) — do not re-ask these
1. **Vendor payouts**: Automated, via Cashfree Payouts / RazorpayX — NOT Razorpay Route/Split (Route ties settlement to swipe-time, breaks partial refunds + delayed delivery confirmation). Architecture: collect 100% to primary gateway → Shiprocket delivery-confirmation webhook fires `payout.eligible` to Kafka → dedicated consumer group + own DLT (same pattern as `order.paid`) → worker nets against any `PARTIALLY_REFUNDED`/dispute holds on that vendor's commission record before calling Cashfree Payouts. **✅ Built** — see README.md "Gaps closed — pass 5" for the full module rundown and the deliberate departure from the rest of the codebase's Kafka-retry pattern (payout gateway failures are captured as a normal `FAILED` outcome, not rethrown, to avoid a blind-retry double-payout).
2. **GST invoices**: Backend-generated PDF, triggered on `READY_TO_SHIP` (built off `shipment.created`, the closest event this codebase's `Shipment.ShipmentStatus` vocabulary has to that concept). CGST+SGST (9%+9%) if vendor state == customer state, else IGST (18%). Library: **OpenPDF**, not iText — iText's core is AGPL/commercial-license, not shippable to a client without a license conversation; OpenPDF (LGPL/MPL) avoids that. **✅ Built** — see README.md "Gaps closed — pass 4" for the two documented simplifications (flat rate, tax-inclusive extraction).
3. **Product images**: Presigned-URL direct upload (S3-compatible; also covers Cloudinary/Supabase via the same pattern). Flow: React asks Spring Boot for upload permission → Spring Boot requests presigned URL from bucket → React uploads binary directly to bucket (never through the Spring Boot REST layer) → React saves only the resulting URL string back to Spring Boot.
4. **Database stays PostgreSQL — no Supabase swap.** Verified against the client's own outsourcing post (Ishika Bhawsar, Edithtech ReachX): stack line reads "React.js, Spring Boot, Redis, Kafka, PostgreSQL/MySQL" — Postgres satisfies this as originally specified. Supabase was only ever in scope as an S3-compatible option under the image-storage decision above (#3), not as a database host. If the client later requests Supabase specifically as DB hosting, that's Postgres under the hood anyway (JPA/Flyway layer unaffected) — just a connection-string/hosting change, not a re-architecture.

## Immediate next step, before any new feature work
Have the person run this (takes 2 minutes, requires normal internet access — NOT possible from
inside a sandboxed session like the one that built this):
```bash
sudo apt-get install -y openjdk-17-jdk maven
docker-compose up -d postgres redis zookeeper kafka
mvn test
```
If anything fails, fix that specific error before building anything new. This has never been
verified to compile — treat that as the single highest-priority unknown, above any new feature.

## How this project got built (context, not action items)
Iterative sessions: vendor/catalog → auth → orders/payments → shipping → admin disputes/commission
→ multiple rounds of bug-finding (transaction rollback bug, broken tests from un-updated
constructors, missing CORS, missing actuator dependency) → gap-filling (password reset, email
verification, rate limiting, idempotency, abandoned-order expiry, vendor suspend). Each round
found real bugs from the round before — this is normal for iterative AI-assisted builds, not a
sign anything is uniquely broken. Expect more to surface once `mvn test` actually runs.

## Session Update - 2026-08-21 - Backend verified live against frontend Session 5

**Backend status: RUNNING and VERIFIED locally.**
- docker-compose up (postgres, redis, zookeeper, kafka, app) - all healthy
- Flyway: 19/19 migrations validated, schema current
- smoke_test.sh: 13/13 hard checks PASS, 0 FAIL
- 2 informational items from smoke_test.sh worth a look (not bugs):
  - Item 15 (GET /shipments/order/{id}) returned 200 instead of expected 404 - script's
    expectation may be stale, or a shipment exists from a prior run. Not investigated yet.
  - Item 16 (POST /disputes) - smoke_test.sh's guessed payload shape is WRONG, not the API.
    Real required fields: raisedByEmail, vendorId, category (not orderId/reason/description).
    Confirmed correct in frontend's disputesApi.ts already (see below) - smoke_test.sh itself
    should be fixed to match, not the API or the frontend.

**Frontend Session 5 (router build) status: unzipped and running, NOT yet manually
walked through against live backend (login flow untested end-to-end as of this note).**
- Location referenced in this session: reachx-frontend-SESSION5-router.zip
- All 6 API wrapper files (authApi, ordersApi, payoutApi, disputesApi, kycApi,
  accountHealthApi) carry source-verified header comments confirming they were checked
  directly against backend controllers/DTOs, not guessed. Spot-checked disputesApi.ts
  against smoke_test.sh's live response - frontend contract is correct, matches real API.
- API_BASE defaults correctly to http://localhost:8080/api/v1 in every file, matches
  docker-compose.yml's default CORS_ALLOWED_ORIGINS (localhost:5173, localhost:3000).
- authApi.ts only wraps login - vendor self-registration (POST /vendors/register, confirmed
  live) intentionally not wired yet, out of Session 5 scope per its own comment.

**Next concrete step:** register a test vendor via curl, log in through the actual frontend
UI at localhost:5173, and confirm the dashboard shell + Orders/Payouts/Disputes/KYC panels
load real data end-to-end. This is the one thing not yet verified - build passing and API
contracts matching is not the same as a confirmed working login-to-dashboard flow.

**Do NOT start frontend sessions 6-8 until the above end-to-end check is done and clean.**
