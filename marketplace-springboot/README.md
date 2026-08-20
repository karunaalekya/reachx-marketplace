# Marketplace Backend — Full Vendor/Payments/Shipping/Dispute Platform

**See `ROADMAP.md` for the full list of known feature gaps against a complete production marketplace (payouts, invoicing, reviews, notifications, etc.) — this README covers what's built, that file covers what isn't yet.**

Exact stack as specified: **Spring Boot (Java) · React-ready REST API · PostgreSQL · Redis · Kafka**

## What's implemented
- **Vendor onboarding**: registration, KYC approval/rejection workflow (admin), status tracking, self-service address/pickup-location update
- **Catalog**: product CRUD, vendor-scoped ownership checks, public search/filter, publish/archive lifecycle
- **Redis caching**: product reads cached (15 min TTL), search results cached (5 min TTL), auto-evicted on writes
- **Security**: stateless JWT auth, BCrypt password hashing, role-based endpoint protection (`ADMIN` / `VENDOR`), Redis-backed login lockout (5 failed attempts → 15 min lock)
- **Database**: Flyway-versioned schema, V1–V15, every change a tracked migration
- **Validation**: request-level validation (GSTIN/PAN format, Indian phone format, price/stock bounds)
- **Error handling**: centralized, returns clean JSON (no stack traces leaking to clients)
- **Auth**: `POST /api/v1/auth/login` — single endpoint for both vendors and admins, issues JWT with correct role. Admins are a separate table, never self-registered.
- **Orders**: multi-vendor cart checkout, splits into per-vendor sub-totals, atomic stock decrement (prevents overselling), automatic stock restoration on payment failure
- **Payments — all three gateways**: Razorpay (full: create order, webhook, refund), Cashfree (full: create order, webhook, refund), PayU (checkout hash generation implemented; webhook verification and refund are honest stubs — see "Known Limitations" below, this is a real gap, not hidden)
- **Shipping**: Shiprocket integration, auto-triggered by `order.paid`. One shipment per vendor per order. Each vendor's own pickup address is used (self-service endpoint included).
- **Disputes + Refunds**: customers raise disputes; admins resolve them. Resolving as REFUNDED now actually processes a real gateway refund (Razorpay/Cashfree), updates order status to REFUNDED, and marks the vendor's commission payout as CANCELLED_REFUNDED. Resolving as REJECTED releases the held payout normally.
- **Commission**: ledger entry auto-recorded on payment at the vendor's rate *at that moment* (later rate changes don't rewrite history). Admin can adjust rates; vendors see their own earnings/pending payout.
- **Reliability**: Kafka dead-letter topic + 3x retry instead of silent-drop on consumer failure.
- **Product images**: presigned-URL direct upload (S3-API-compatible - works with AWS S3, Cloudinary's S3-compatible endpoint, or Supabase Storage via config alone). Vendor requests a short-lived presigned PUT URL (`POST /products/{id}/images/presign`), uploads the file directly to the bucket from the browser, then confirms it (`POST /products/{id}/images`) - the confirm step only trusts a server-issued, product-namespaced object key, never a client-supplied URL, so one vendor can't attach another vendor's uploaded file to their own product. Image binary never passes through the Spring Boot app. Max 10 images/product, enforced both in the service (clean 409) and at the DB level (trigger, migration V11) so a stale app instance or direct DB write can't bypass the cap.
- **GST invoices**: auto-generated PDF (OpenPDF) per vendor per order, triggered off `shipment.created` (own Kafka consumer group + own DLT, same pattern as shipping/commission). Sequential invoice numbering per vendor per financial year via an atomic `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` allocator (migration V13) - required by GST law, and safe under concurrent generation, not just "usually fine". Tax type (CGST+SGST vs IGST) is decided by comparing the order's `customerState` (new required checkout field, migration V12) against the vendor's own registered state. GST is extracted from within the vendor's already-collected line-item total rather than added on top - checkout never collected a separate tax line, so adding GST afterward would show an invoice total the customer never actually paid. PDF never passes through app memory into a client response - uploaded directly to the same S3-compatible bucket as product images, downloaded via a redirect to its bucket URL, same pattern as images.
- **TCS + TDS (statutory operator withholding)**: two obligations this platform carries *as the e-commerce operator itself*, separate from the GST a vendor charges on their own invoice (below). TCS (Sec 52, CGST Act, 1% of gross, split CGST+SGST vs IGST by the same customerState-vs-vendor.state comparison invoicing already uses) and TDS (Sec 194-O, Income Tax Act, 1% of gross, or 5% under Sec 206AA if the vendor has no PAN on file) are both computed and filing-snapshotted (`TaxWithholdingRecord`, one row per commission record per tax type) the instant a commission record is created — same `order.paid` moment everything else in that record gets snapshotted. `CommissionRecord` gains `tcsAmount`, `tdsAmount`, and `vendorNetPayable` (gross − commission − TCS − TDS); `PayoutService` now transfers `vendorNetPayable`, not the pre-tax `vendorPayoutAmount`. Admin reporting: `GET /tax-withholding/report/{financialYear}/{TCS|TDS}` (per-vendor GSTR-8/TDS-quarterly summary), `GET /tax-withholding/vendor/{vendorId}` (raw drill-down). Vendor self-view: `GET /tax-withholding/mine/{financialYear}`. **Honest simplification**: Sec 194-O technically only applies once a vendor's *cumulative annual* sales through this platform cross ₹5,00,000 — there's no per-vendor-per-FY running total in this schema yet, so TDS is deducted on every commission record unconditionally rather than risk under-withholding (a real legal exposure for the operator; over-withholding is just excess credit the vendor reclaims). Revisit once a running-total lookup exists.
- **Vendor payouts**: fully automated, triggered by delivery confirmation (not checkout, not a fixed schedule). Vendor self-registers bank/UPI details (`POST /vendors/me/payout-account`) - the account number is encrypted at rest (AES/GCM) and the gateway (Cashfree Payouts, or RazorpayX as the configured alternate) validates it as a real beneficiary immediately, so a bad IFSC is caught at onboarding, not discovered as a failed payout later. Once Shiprocket's tracking webhook reports `DELIVERED`, a dedicated Kafka consumer (`payout-service`, own DLT) checks that vendor's commission record is still `PENDING` (this check *is* the netting against dispute holds/refunds - DisputeService/RefundService already flip that status off `PENDING` the moment either happens) and calls the gateway. One payout row per commission record ever, DB-unique-constrained, so a redelivered Kafka message can't double-pay. Admins get a reconciliation queue (`GET /payouts?status=FAILED`) and a manual retry endpoint - deliberately manual, not auto-retried, because a payout failure needs a human to check *why* before moving real money again.


## Bugs found and fixed — pass 1 (fresh-eyes review)
1. **Transaction rollback bug (the serious one)**: `RefundService.initiateRefund` was `@Transactional` and re-threw exceptions after saving a `FAILED` refund record — but since it's called from inside `DisputeService.resolve`'s own transaction, that re-throw marked the *entire shared transaction* rollback-only, silently discarding both the refund failure record AND the dispute resolution itself. Fixed by treating a failed refund as a normal returned outcome (checked via `refund.getStatus()`) instead of an exception — test-covered (`refund_returnsFailedRefund_ratherThanThrowing_whenGatewayFails`).
2. **Three test files were compile-broken**: `AuthServiceTest`, `PaymentServiceTest`, and `DisputeServiceTest` all manually construct their service under test, and none were updated when those services were refactored earlier in the same session. `mvn test` would have failed to *compile*. All three fixed and re-verified against their services' actual constructors.
3. **Missing exception handlers**: `IllegalArgumentException` and `AccessDeniedException` both fell through to a generic 500 instead of the correct 400/403. Added explicit handlers for both, plus a 501 for the PayU-unimplemented path.
4. **PayU webhook verification was wrongly treated as unbuildable** — it's actually implementable from PayU's public documentation using fields already present in their webhook body. Built the real reverse-hash check (flagged as needing live-sandbox validation).
5. **Refund scope bug**: a dispute refund on one vendor's item in a multi-vendor order was refunding the *entire order's payment*, not just that vendor's share. Fixed with a new `PARTIALLY_REFUNDED` order status (migration V8).

## Bugs found and fixed — pass 2 ("check all angles" review)
Different angles than pass 1: cross-origin config, schema/entity alignment, Kafka multi-consumer correctness, and dependency completeness.
1. **No CORS configuration existed at all.** Since the entire point of `MASTER_BLUEPRINT.md` is enabling a separately-built frontend, and there was zero CORS setup, any browser-based frontend calling this API from a different origin (any local dev server, any deployed domain) would have been silently blocked by the browser itself — not a server error, just failed requests with no clear reason in server logs. Added a configurable `CorsConfigurationSource` (env var `CORS_ALLOWED_ORIGINS`, defaults to common local dev ports). **Must be set to the real frontend domain before production deploy** — never `*`, since credentials/Authorization headers are allowed.
2. **`spring-boot-starter-actuator` was never added to `pom.xml`**, despite `SecurityConfig` permitting `/actuator/health` as if it existed. That endpoint was dead configuration — no health check endpoint actually existed, which matters for container orchestration (Docker healthcheck, k8s liveness probes, load balancer checks). Added the dependency, explicitly scoped exposure to `health` only with `show-details: never` (don't leak DB/Kafka connection info to an unauthenticated caller), and added an actual `HEALTHCHECK` to the Dockerfile.
3. **Kafka dead-letter topic collision across consumer groups**: `shipping-service` and `commission-service` both consume `order.paid` independently, but the original error handler routed both services' failures to the same `order.paid.DLT` topic — if both failed on the same message, there'd be no way to tell which service's processing actually broke when reviewing the DLT later. Replaced the single shared error handler with per-listener container factories, each publishing to its own group-scoped DLT topic (`order.paid.shipping-service.DLT`, `order.paid.commission-service.DLT`).
4. **Verified entity/schema alignment directly** rather than assuming it — `ddl-auto: validate` means any JPA/DB mismatch blocks the app from starting entirely, so this was worth checking properly, not just trusting memory of what was built. Cross-checked `Refund`, `Vendor` (address fields added mid-session), `Dispute`, and `CommissionRecord` against their migrations field-by-field. All clean — no mismatch found.

## Gaps closed — pass 3 ("remove all gaps")
All four previously-flagged gaps are now built, not just documented as TODOs:
1. **Password reset flow**: `POST /auth/forgot-password` + `POST /auth/reset-password`, token-based (SHA-256 hashed at rest, 30-min expiry, single-use). Deliberately returns the *identical* response whether or not the email exists — this is the standard defense against account enumeration, and it's easy to get subtly wrong (e.g. an error path that's fractionally faster than the success path leaks the same information via timing), so it's worth knowing this exists rather than assuming "has an endpoint" means "is actually safe."
2. **Vendor email verification**: token generated and emailed on registration, `POST /vendors/verify-email?token=...` marks it verified. Same hashed-token pattern as password reset.
3. **General rate limiting** beyond login: `POST /vendors/register`, `POST /disputes`, `POST /orders`, and `POST /auth/forgot-password` are now IP-limited (see `RateLimitInterceptor` for exact numbers). **Real caveat, not hidden**: this uses the raw connection IP (`request.getRemoteAddr()`). If this API is deployed behind a reverse proxy or load balancer (likely, in most real deployments), every request will appear to come from the proxy's IP, making the limiter useless until `X-Forwarded-For` handling is added — which needs to match your actual infrastructure, so it wasn't guessed at here.
4. **HikariCP connection pool** now has explicit, documented values instead of silently relying on whatever Spring Boot's default happens to be.

**The password reset and email verification flows both depend on real SMTP credentials to actually deliver mail** — the code is real (uses Spring's `JavaMailSender`), but with the placeholder credentials in `application.yml`, emails will fail to send (logged, not thrown — see `SmtpEmailService`). Set real `SMTP_*` env vars before this is usable end-to-end.

## Gaps closed — pass 4 ("GST invoices")
1. **GST tax invoice generation, end to end**: `Invoice` entity + `invoices`/`invoice_sequences` tables (V13), `InvoiceNumberGenerator`, `InvoicePdfGenerator` (OpenPDF), `InvoiceService`, `ShipmentCreatedInvoiceListener`, `InvoiceController`. Previously listed in `ROADMAP.md` as a 🔴 launch-blocking gap - now built, not just documented as a TODO.
2. **New required checkout field**: `customerState` (migration V12, `CreateOrderRequest`). GST's CGST+SGST-vs-IGST determination needs a structured customer state to compare against the vendor's own state - the order previously only had a free-text `shippingAddress` with nothing structured to compare. This is a genuine breaking change to `POST /api/v1/orders` - `MASTER_BLUEPRINT.md` is updated, but any frontend work already done against the old request shape needs this field added.
3. **Tax-inclusive extraction, not tax-on-top**: since checkout never collected a separate tax line (see `OrderService` comment: "No separate shipping/tax calc in this module's scope"), the invoice treats the vendor's already-collected line-item total as GST-inclusive and extracts the tax from within it, rather than adding 18% on top. This keeps the invoice's total identical to what the customer actually paid via the gateway - adding tax afterward would show a total that was never actually charged or agreed to.

## Gaps closed — pass 5 ("vendor payouts")
The last of the three 🔴 items from the locked decisions (`PROJECT_STATE.md`) - all three are now built.
1. **Vendor bank/UPI details capture + gateway beneficiary registration**: `VendorPayoutAccount` entity (V14) + `VendorPayoutAccountService`. A vendor submits bank account (account number + IFSC) or a UPI VPA; exactly one of the two is required. The account number is encrypted at rest (AES/256-GCM, `AesGcmStringConverter`) - only the last 4 digits are ever stored/returned in plaintext, for display. Registration immediately calls the active payout gateway's beneficiary-registration API, so a bad IFSC/VPA surfaces as a `REJECTED` status with a reason at onboarding time, not as a mysteriously failed payout weeks later. Re-registering deactivates (not deletes) the previous account - kept for audit history, same reasoning `admins` being a separate table from `vendors` already established in this codebase.
2. **The actual payout worker**: `PayoutService`, listening on a new `payout.eligible` Kafka topic with its own consumer group (`payout-service`) and own DLT, matching every other cross-service event in this codebase (`order.paid`, `shipment.created`). `ShippingService` publishes that event the instant a shipment's tracking webhook reports `DELIVERED` - the actual architectural trigger point from the locked decision (collect 100% up front, release per-vendor on delivery confirmation, which is exactly why Razorpay Route/Split was ruled out for tying settlement to swipe-time instead).
3. **Netting against disputes/refunds is not a separate calculation** - it's the existing `CommissionRecord.payoutStatus` field. `DisputeService` already flips it to `HELD_FOR_DISPUTE` the moment a dispute is raised, and `RefundService` already flips it to `CANCELLED_REFUNDED` the moment a refund actually processes - both per-vendor, per-order, already correct from earlier passes. So `PayoutService`'s entire netting check is "only pay out a commission record that's still `PENDING`" - reusing infrastructure instead of re-deriving the same logic in a second place.
4. **A payout gateway call is treated differently from every other Kafka-triggered side effect in this codebase, on purpose.** `CommissionService`/`ShippingService`/`InvoiceService` all let real exceptions propagate up to Kafka's 3x-retry-then-DLT handler, because retrying "create a shipment" or "record a commission" is safe - those operations are naturally idempotent (checked via a lookup before acting) and retrying a failure that already failed can't make things worse. A payout is different: if the gateway call times out on the way *back* but the transfer actually went through on Cashfree's/RazorpayX's side, a blind Kafka retry would trigger a second real transfer. So `PayoutService.attemptPayout` wraps the gateway call in try/catch and always returns normally with a `FAILED` status recorded - never rethrows - and a `FAILED` payout can only move again via the explicit admin retry endpoint, a deliberate human-in-the-loop step for anything that already touched a payment gateway once.
5. **Two gateway implementations, one selectable via config** (`payout.active-gateway`): `CashfreePayoutGateway` (primary, per the locked decision) and `RazorpayXPayoutGateway` (the named alternate). Both implement bearer/basic-auth-appropriate flows, beneficiary/fund-account registration, transfer initiation with gateway-side idempotency keys, and webhook signature verification. **Same honesty caveat this file already gives PayU**: both are built against each provider's public API documentation, not verified against a live sandbox account (none was available in this build environment) - validate one real end-to-end payout before trusting either with real vendor money.
6. **BLOCKED vs FAILED payout status, kept deliberately distinct**: `BLOCKED` means the gateway was never called at all (e.g. vendor hasn't completed payout onboarding yet) - the fix is "vendor needs to add a verified payout account." `FAILED` means the gateway was actually called and something went wrong - the fix is "an admin needs to investigate, possibly via the gateway's own dashboard, before retrying." Collapsing these into one status would send ops down the wrong troubleshooting path half the time.
4. **Flat 18% GST rate - a real simplification, not hidden**: `Product` has no HSN code or per-category tax-rate field in this schema, so the actual GST slab (0/5/12/18/28%, which varies by product category under real Indian GST law) can't be computed per line item. All invoices currently use a flat 18% rate. This is fine for a demo/pilot but is a genuine gap before real launch with products outside the 18% slab - revisit once `Product` gains a tax-rate/HSN field.
5. **Sequential invoice numbering is safe under concurrency**: allocated via `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` on a per-vendor-per-financial-year row (`invoice_sequences`), not a `SELECT COUNT(*) + 1` - the latter would be able to double-allocate the same number if two shipments for the same vendor triggered invoice generation in the same instant. A rolled-back transaction after allocation leaves a gap in the sequence (tolerated under GST rules) rather than reusing a number (not tolerated).
6. **One invoice per vendor per order**, matching the existing per-vendor shipment granularity (`uq_invoice_order_vendor` constraint, mirrors `Shipment`'s own `(order_id, vendor_id)` uniqueness) - a multi-vendor order gets one invoice per vendor, not one for the whole order, since GST invoicing is a seller-level (vendor-level) obligation, not a marketplace-level one.

**Known limitation on this pass**: not tested against `mvn test` for the same reason as everything else in this codebase (see PROJECT_STATE.md) - untested until that's actually run. The invoice number format (`INV/{vendorId}/{FY}/{seq}`) uses the vendor's internal DB id rather than a GSTIN-derived identifier; fine functionally (GST law doesn't mandate the *content* of the number, only that it's sequential and unique per seller per year) but worth a client conversation if they want their own numbering convention.

## Known limitations (honest, not hidden)
1. **PayU webhook verification is now real** (implemented against PayU's publicly documented reverse-hash formula, using the fields PayU actually sends) — but it has NOT been tested against a live PayU sandbox callback, since I don't have PayU sandbox access. This is the single most common source of PayU integration bugs (subtle field-order errors), so validate it against a real test transaction before trusting it in production. It fails closed (rejects) on any mismatch, so a formula bug blocks payments rather than accepting forged ones — safe direction to be wrong in, but still needs verification. **PayU refunds remain genuinely unbuilt** — they require a separate PayU API with different auth than checkout, and throw a clear `UnsupportedOperationException` rather than pretending to work.
2. **Refund scope is now correctly per-vendor**: a dispute refund charges back only the disputed vendor's line-item subtotal, not the entire order's payment. A multi-vendor order refunding one vendor now correctly sets `PARTIALLY_REFUNDED` (new status, migration V8) instead of `REFUNDED`, and only marks the whole order `REFUNDED` when that vendor was the only one in it. (Previously this refunded the whole payment regardless — fixed and test-covered.)
3. **Package coupling**: `dispute` and `refund` modules depend on each other (dispute triggers refund; refund reads commission data owned by dispute). Works correctly, but a stricter modular-monolith design would extract commission/payout into its own module. Structural note for future refactoring, not a bug.
4. **No customer accounts** — checkout is guest-only by design.
5. **Frontend not built** — parked per your explicit instruction. `MASTER_BLUEPRINT.md` is the handoff spec.

## Prerequisites
- Java 17+
- Maven 3.9+
- Docker + Docker Compose

## Run it locally (real steps, test these before showing the client)

```bash
# 1. Start Postgres, Redis, Kafka
docker-compose up -d postgres redis zookeeper kafka

# 2. Run the app (Flyway migrates the schema automatically on startup)
mvn spring-boot:run

# 3. Confirm it's up
curl http://localhost:8080/actuator/health
```

## Run everything in Docker (app included)
```bash
docker-compose up --build
```

## Run tests
```bash
mvn test
```

## Try the API
```bash
# Register a vendor
curl -X POST http://localhost:8080/api/v1/vendors/register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Traders",
    "email": "vendor@test.com",
    "phone": "9876543210",
    "password": "SecurePass123",
    "gstin": "22AAAAA0000A1Z5",
    "panNumber": "ABCDE1234F"
  }'

# Search public catalog (no auth)
curl http://localhost:8080/api/v1/products?minPrice=100&maxPrice=5000
```

## Before this is client-ready
1. Run `mvn test` and fix anything that fails in your actual environment (dependency versions, Java version mismatches)
2. Replace `jwt.secret` in `application.yml` / docker-compose with a real generated secret, not the placeholder
3. Replace the seeded bootstrap admin password (`V2__add_admins_table.sql`) immediately after first deploy — it's a known default
4. Set real `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
5. Set real `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`
6. If PayU is required: run one real transaction through PayU's sandbox and confirm `PayuGateway.verifyFormWebhook` accepts the genuine callback (the hash formula is implemented per PayU's documentation but untested against a live response). Refunds still need PayU's separate Refund API built — currently throws a clear error rather than attempting a fake call.
7. Set real `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, and a real `SHIPROCKET_WEBHOOK_TOKEN`
8. Each vendor needs to call `PATCH /vendors/{id}/address` to set their pickup location before their orders can ship correctly
9. Set `CORS_ALLOWED_ORIGINS` to the real deployed frontend domain(s) — the default only covers local dev ports and will block a deployed frontend
10. Set real `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD` — password reset and email verification will silently fail to send without these (logged, not thrown, so this can go unnoticed without checking logs)
11. If deploying behind a reverse proxy/load balancer, update `RateLimitInterceptor` to read the real client IP from `X-Forwarded-For` (or your proxy's equivalent header) — it currently uses the raw connection IP, which will be the proxy's IP for every request in that setup, making the limiter ineffective
12. Load-test the Redis cache TTLs against expected traffic before committing to those numbers in a client demo
13. Set real `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PUBLIC_BASE_URL`, and `STORAGE_REGION`. Leave `STORAGE_ENDPOINT` unset for real AWS S3; set it to the provider's S3-compatible endpoint for Cloudinary or Supabase Storage. Also set the bucket's CORS policy to allow PUT from the real frontend origin — without it, the browser-direct upload step will be blocked the same way missing API CORS blocked requests before item #9 was fixed.
14. Every vendor needs their `state` field set accurately (already required at registration) — GST invoices compare it against each order's `customerState` to decide CGST+SGST vs IGST, so a wrong or missing vendor state produces a wrong invoice, and a missing one blocks invoice generation entirely (fails loud into the Kafka DLT rather than guessing — see README "Gaps closed — pass 4").
15. Confirm the flat 18% GST rate actually matches the client's product catalog before real launch — if any products fall outside the 18% slab (0/5/12/18/28% are all real GST slabs), invoices will be wrong until `Product` gains a tax-rate/HSN field and `InvoiceService` uses it per line item instead of one flat rate.
16. Frontend must send `customerState` on `POST /api/v1/orders` (now required) — see `MASTER_BLUEPRINT.md` section 4.
17. Set real `CASHFREE_PAYOUTS_CLIENT_ID`, `CASHFREE_PAYOUTS_CLIENT_SECRET`, `CASHFREE_PAYOUTS_WEBHOOK_SECRET` (these are a *different* credential pair from the `CASHFREE_*` payment-collection ones already set in item 5 — Payouts is a separate Cashfree product). If using RazorpayX instead (`PAYOUT_ACTIVE_GATEWAY=RAZORPAYX`), set `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER` (the RazorpayX current account payouts debit from), and `RAZORPAYX_WEBHOOK_SECRET`.
18. Generate a real `PAYOUT_ENCRYPTION_KEY` with `openssl rand -base64 32` and set it before any real vendor bank account number is ever stored — the shipped default in `application.yml` is dev-only and must not reach production. There is currently no key-rotation tooling; rotating this key without a migration script would make every already-stored account number undecryptable, so treat it as a one-time-set production secret until that tooling exists.
19. Run one real end-to-end payout through Cashfree Payouts' (or RazorpayX's) sandbox before trusting vendor payouts with real money — same "implemented against docs, not sandbox-verified" caveat as PayU in item 6, see README "Gaps closed — pass 5".
20. Each vendor needs to complete `POST /vendors/me/payout-account` before they can actually be paid — a vendor with no verified payout account still earns commission normally (it shows as `PENDING` in `GET /commissions/mine`), it just accumulates unpaid, and any delivery-triggered payout attempt records as `BLOCKED` until they do.
21. Before real launch, confirm GSTR-8 filing dates/process with whoever handles the client's GST compliance — this build computes and records the correct TCS amount per sale, but does not itself file the monthly GSTR-8 return; `GET /tax-withholding/report/{fy}/TCS` gives the per-vendor totals needed to prepare it, not an auto-filed return.
22. Build the per-vendor-per-FY cumulative sales lookup before treating the ₹5L Sec 194-O TDS threshold as properly implemented — right now TDS is deducted on every sale unconditionally (see README "What's implemented" — TCS + TDS), which is legally safe but means small vendors are over-withheld until they reclaim it at ITR filing.
23. Confirm the flat 1% TCS/TDS rates and the 5% Sec 206AA no-PAN TDS rate against current CBDT/CBIC notifications before real launch — these are the standard statutory rates as of this build, but tax rates are the kind of thing that changes via government notification, not code.

## Try login
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "vendor@test.com", "password": "SecurePass123"}'
```

## Try checkout (order → payment)
```bash
# 1. Create an order
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerEmail": "buyer@test.com",
    "customerPhone": "9876543210",
    "shippingAddress": "123 MG Road, Bengaluru",
    "customerState": "Karnataka",
    "items": [{"productId": 1, "quantity": 2}]
  }'

# 2. Initiate payment for that order (returns a Razorpay order id for the frontend widget)
curl -X POST http://localhost:8080/api/v1/payments/orders/1/initiate
```

## GST invoices
Generated automatically once a shipment is created for a vendor (no manual trigger needed).
```bash
# All invoices for an order (one per vendor)
curl http://localhost:8080/api/v1/invoices/order/1

# A vendor's own invoices (requires a vendor JWT)
curl http://localhost:8080/api/v1/invoices/mine -H "Authorization: Bearer <token>"
```
