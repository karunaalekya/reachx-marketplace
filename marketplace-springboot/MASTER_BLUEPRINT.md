# Marketplace Backend — Master Blueprint
**For frontend development in a separate session/repo. This document is self-contained — no backend source access needed.**

Stack: Spring Boot (Java 17) · PostgreSQL · Redis · Kafka · Razorpay · Shiprocket
Base URL (local): `http://localhost:8080`

---

## 1. Authentication

All authenticated requests use `Authorization: Bearer <jwt>`. Token obtained from login.

### `POST /api/v1/auth/login` — public
```json
// Request
{ "email": "string", "password": "string" }
// Response 200
{ "token": "string", "role": "VENDOR" | "ADMIN", "userId": 1, "displayName": "string" }
// Errors: 401 (bad credentials), 429 (locked out after 5 failed attempts, 15 min)
```
Store the token; attach to every subsequent request needing `VENDOR` or `ADMIN` role. No refresh-token flow exists yet — token expires in 24h (frontend should redirect to login on 401).

### `POST /api/v1/auth/forgot-password` — public
```json
// Request
{ "email": "string" }
// Response 200 - ALWAYS this same message, regardless of whether the email exists
{ "message": "If an account exists with that email, a password reset link has been sent." }
```
Build the frontend to show this message unconditionally — don't add client-side logic that reveals whether the email was found (e.g. don't disable a "resend" button differently based on some assumed lookup result). The reset link emailed points to `{FRONTEND_BASE_URL}/reset-password?token=...` — the frontend needs a route at that path.

### `POST /api/v1/auth/reset-password` — public
```json
// Request
{ "token": "string", "newPassword": "min 8 chars" }
// Response 200
{ "message": "Password reset successfully." }
// Errors: 401 if token is invalid, expired (30 min), or already used
```

---

## 2. Vendor Onboarding

### `POST /api/v1/vendors/register` — public
```json
// Request
{
  "businessName": "string", "email": "string", "phone": "10-digit Indian mobile",
  "password": "min 8 chars", "gstin": "15 chars, optional", "panNumber": "ABCDE1234F format, optional"
}
// Response 201
{ "id": 1, "businessName": "...", "email": "...", "phone": "...", "kycStatus": "PENDING",
  "status": "INACTIVE", "commissionRate": 10.00, "panOnFile": true, "createdAt": "ISO-8601" }
```
`kycStatus`: `PENDING` → `APPROVED`/`REJECTED` (admin decides). `status`: `INACTIVE` until KYC approved, then `ACTIVE`. **A vendor cannot sell (create products) until `status: ACTIVE`.** `panOnFile`: boolean, not the raw PAN number — true if `panNumber` was provided at registration. Use this to predict which TDS rate a commission record will get (1% Sec 194-O with PAN, 5% Sec 206AA without) rather than inferring it from a settled record's `tdsAmount`.

### `GET /api/v1/vendors/{id}` — auth (ADMIN or VENDOR)
Returns same shape as above.

### `GET /api/v1/vendors/pending-kyc` — auth (ADMIN), paginated
Admin queue of vendors awaiting KYC review.

### ⚠️ Breaking change (this revision): KYC is now a multi-document model
The old single-field model (`Vendor.kycDocumentUrl`/one `kycStatus`/one `rejectionReason` for the
whole vendor) is **gone**. `PATCH /vendors/{id}/kyc-decision` (whole-vendor approve/reject) **no
longer exists**. `kycDocumentUrl` and `rejectionReason` are **removed** from `GET /vendors/{id}`'s
response. This was flagged as a known, deliberate simplification in the prior revision of this
document — this revision is the real schema change that was flagged as needed, not a silent
bolt-on. If frontend code was already built against the old shapes, it needs updating: pull the
per-document list from the new list endpoint below instead of reading `kycDocumentUrl`/
`rejectionReason` directly off the vendor object.

`GET /vendors/{id}`'s `kycStatus` field still exists and still means the same broad thing
(`PENDING` / `APPROVED` / `REJECTED`), but it's now a **derived/overall** value computed from the
per-document statuses below — approved once every *required* document type is `APPROVED`,
rejected if any *required* type is `REJECTED`, pending otherwise. `status` still flips to `ACTIVE`
the moment `kycStatus` reaches `APPROVED` — same rule as before. One behavioral note: once a
vendor has reached `ACTIVE`, a later single-document rejection (e.g. a re-review) does **not**
silently flip `status` back to `INACTIVE` — `kycStatus` will still show `REJECTED` so the gap is
visible, but pulling an already-selling vendor's storefront down is treated as a distinct admin
action (vendor suspend), not an automatic side effect of one document's re-review.

Document types (`docType`): `PAN` (required), `GSTIN` (required), `BANK_CHEQUE` (required),
`MSME_CERTIFICATE` (optional — uploadable, reviewable, but not counted toward overall approval).

### `GET /api/v1/vendors/{id}/kyc-documents` — auth (ADMIN or VENDOR, self only)
Every document slot this vendor has uploaded into, each with its own status/rejection reason.
Only returns rows that actually exist — a doc type never uploaded is simply absent from the array
(frontend renders that as "not yet uploaded" using its own knowledge of the 4 possible types,
rather than the backend synthesizing empty placeholder rows).
```json
// Response 200
[
  { "id": 12, "docType": "PAN", "required": true,
    "documentUrl": "https://...", "status": "APPROVED", "rejectionReason": null,
    "uploadedAt": "ISO-8601", "decidedAt": "ISO-8601" },
  { "id": 13, "docType": "GSTIN", "required": true,
    "documentUrl": "https://...", "status": "REJECTED", "rejectionReason": "Blurred, resubmit",
    "uploadedAt": "ISO-8601", "decidedAt": "ISO-8601" }
]
```

### `PATCH /api/v1/vendors/{id}/kyc-documents/{documentId}/decision` — auth (ADMIN)
Approves or rejects **one document**, not the whole vendor — this is the actual point of the
multi-document model: an admin can approve PAN while rejecting GSTIN in the same review pass,
which the old whole-vendor decision endpoint could never express. Recomputes the vendor's overall
`kycStatus`/`status` immediately after (see behavioral note above).
```json
// Request
{ "approved": true }
// or
{ "approved": false, "rejectionReason": "string, required if rejecting" }
// Response 200 — the single document just decided, same shape as the list endpoint's entries
// Errors: 409 if this document is already APPROVED, 400 if rejecting without a reason
```

### `POST /api/v1/vendors/{id}/kyc-documents/presign` — auth (VENDOR, self only)
Step 1 of the presigned-upload flow — same two-step pattern as product images (section 3), reused
directly. Vendor asks permission for a specific document slot, gets a short-lived upload URL; the
file binary never touches this backend.
```json
// Request
{ "fileName": "gst-certificate.pdf", "contentType": "application/pdf", "docType": "GSTIN" }
// contentType whitelist: image/jpeg, image/png, image/webp, application/pdf
// docType: one of PAN, GSTIN, BANK_CHEQUE, MSME_CERTIFICATE
// Response 200
{ "uploadUrl": "https://...", "publicUrl": "https://...",
  "objectKey": "vendor-kyc/7/GSTIN/uuid-...", "expiresInSeconds": 900 }
```
Note the `objectKey` now embeds the `docType` as its own path segment
(`vendor-kyc/{vendorId}/{docType}/...`) — the confirm step below recovers `docType` from this
path rather than trusting a second, independently-suppliable `docType` at confirm time.
Frontend PUTs the raw file bytes directly to `uploadUrl` with the same `Content-Type` header sent
in the request, then calls the confirm endpoint below with `objectKey` unchanged.

### `POST /api/v1/vendors/{id}/kyc-documents` — auth (VENDOR, self only)
Step 2: confirms the file already landed in the bucket, for whichever `docType` was embedded in
`objectKey`'s path by the presign step. Works identically for a vendor's first submission of that
docType and for a re-upload after rejection of that same docType — either way this always resets
*that document's* `status` to `PENDING` and clears any prior `rejectionReason` on it, then
recomputes the vendor's overall `kycStatus`.
```json
// Request
{ "objectKey": "vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf" }  // from the presign response above
// Response 200 — the single document just confirmed, same shape as the list endpoint's entries
// (docType comes back in the response - the frontend doesn't need to have tracked it separately)
```

### `PATCH /api/v1/vendors/{id}/commission-rate` — auth (ADMIN)
```json
{ "commissionRate": 12.5 }  // 0-100
```

### `POST /api/v1/vendors/verify-email?token=...` — public
```json
// Response 200
{ "message": "Email verified successfully." }
// Errors: 401 if token invalid (already used or never existed)
```
The verification link emailed on registration points to `{FRONTEND_BASE_URL}/verify-email?token=...` — the frontend needs a route there that calls this endpoint and shows the result. `VendorResponse` now includes `emailVerified: boolean` — consider gating certain vendor actions (e.g. going live with products) on this being true, though the backend does not currently enforce that itself.

### `PATCH /api/v1/vendors/{id}/address` — auth (VENDOR, self only)
```json
// Request
{ "addressLine1": "string", "addressLine2": "string (optional)", "city": "string",
  "state": "string", "pincode": "6-digit Indian pincode", "pickupLocationName": "string" }
```
`pickupLocationName` must match a pickup location the vendor has already registered in their own Shiprocket dashboard — this endpoint doesn't create one, it just tells the backend which existing one to use for that vendor's shipments.

---

## 3. Catalog

### `GET /api/v1/products` — public, paginated
Query params: `categoryId`, `minPrice`, `maxPrice`, `q` (name search), `page`, `size`, `sort`
Returns only `ACTIVE` products. This is the storefront search endpoint.

### `GET /api/v1/products/{id}` — public
Single product detail.

### `POST /api/v1/products` — auth (VENDOR)
```json
// Request
{ "name": "string", "description": "string", "categoryId": 1,
  "price": 499.00, "stockQuantity": 50, "sku": "unique per vendor" }
// Response 201 — status starts as "DRAFT", not visible in public search yet
```

### `GET /api/v1/products/mine` — auth (VENDOR), paginated
Vendor's own products, any status.

### `PUT /api/v1/products/{id}` — auth (VENDOR) — full update, vendor must own the product

### `POST /api/v1/products/{id}/publish` — auth (VENDOR)
Moves DRAFT → ACTIVE. Fails with 409 if stock is 0.

### `DELETE /api/v1/products/{id}` — auth (VENDOR)
Soft-archive (status → ARCHIVED), not a hard delete.

**Product shape (response):**
```json
{ "id": 1, "vendorId": 1, "categoryId": 1, "name": "...", "description": "...",
  "price": 499.00, "stockQuantity": 50, "sku": "...",
  "status": "DRAFT" | "ACTIVE" | "OUT_OF_STOCK" | "ARCHIVED", "createdAt": "ISO-8601" }
```

---

## 4. Checkout (Orders + Payments)

**Flow the frontend must implement:**
1. Customer builds a cart client-side (no server-side cart in this backend — cart lives in frontend state/localStorage until checkout)
2. `POST /api/v1/orders` → creates the order server-side, validates stock atomically
3. `POST /api/v1/payments/orders/{orderId}/initiate` → get a Razorpay order id
4. Frontend opens Razorpay's checkout widget (Razorpay JS SDK) using that order id
5. Razorpay handles payment client-side; backend receives a webhook independently and marks the order PAID — **frontend should poll `GET /api/v1/orders/{id}` or otherwise confirm status, not assume success just because Razorpay's widget closed**

### `POST /api/v1/orders` — public
```json
// Request
{
  "customerEmail": "string", "customerPhone": "10-digit",
  "shippingAddress": "string", "customerState": "string, e.g. Karnataka",
  "items": [{ "productId": 1, "quantity": 2 }]
}
// Response 201
{
  "id": 1, "orderNumber": "ORD-20260816-00001", "status": "PENDING_PAYMENT",
  "subtotalAmount": 998.00, "totalAmount": 998.00, "customerState": "Karnataka",
  "items": [{ "productId": 1, "vendorId": 1, "productName": "...", "unitPrice": 499.00,
              "quantity": 2, "lineTotal": 998.00 }],
  "vendorSubtotals": { "1": 998.00 },  // per-vendor split, for multi-vendor carts
  "createdAt": "ISO-8601"
}
// Errors: 409 if insufficient stock, 404 if product not found
```
**`customerState` is required (added for GST invoicing)** — it's compared case-insensitively against each vendor's own registered state to decide CGST+SGST vs IGST on their invoice. Use a standard Indian state/UT dropdown in the frontend rather than free text, so it reliably matches vendor state values (also free text) instead of relying on exact string luck.

### `GET /api/v1/orders/{id}` — public
Same shape as above. Frontend polls this after payment to confirm status.

### `POST /api/v1/payments/orders/{orderId}/initiate?gateway=RAZORPAY` — public
Query param `gateway`: `RAZORPAY` (default) | `CASHFREE` | `PAYU`
```json
// Response - shape differs slightly by gateway
{ "gateway": "RAZORPAY", "gatewayReference": "order_xxx", "amount": 998.00,
  "currency": "INR", "rawGatewayResponse": "..." }
```
**Razorpay/Cashfree**: use `gatewayReference` as the order id passed into that gateway's JS checkout widget.
**PayU**: PayU has no JS widget — `rawGatewayResponse` contains the full set of signed form fields (key, txnid, amount, productinfo, firstname, email, hash) that must be rendered as an actual HTML form and POSTed directly to PayU's hosted checkout URL. ⚠️ **PayU is not production-ready** — webhook verification always rejects currently (see Section 10).

**Order status values:** `PENDING_PAYMENT` → `PAID` → `FULFILLED`, or `PENDING_PAYMENT` → `PAYMENT_FAILED`, or → `CANCELLED`.

---

## 5. Shipping

### `GET /api/v1/shipments/order/{orderId}` — public
```json
// Response - array, one entry per vendor in a multi-vendor order
[{ "id": 1, "orderId": 1, "vendorId": 1, "awbNumber": "AWB123" | null,
   "courierName": "..." | null, "status": "PENDING" | "CREATED" | "PICKUP_SCHEDULED" |
   "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "RTO",
   "failureReason": null, "createdAt": "...", "updatedAt": "..." }]
```
Shipments are created automatically server-side when payment succeeds — there's no create endpoint for the frontend to call.

---

## 5a. GST Invoices

Generated automatically server-side, one per vendor per order, once that vendor's shipment is created (mirrors shipment granularity — a multi-vendor order gets one invoice per vendor, not one for the whole order). No create endpoint for the frontend to call.

### `GET /api/v1/invoices/order/{orderId}` — public
```json
// Response - array, one entry per vendor in the order (may be empty if shipments haven't been created yet)
[{ "id": 1, "invoiceNumber": "INV/20/2026-27/000001", "orderId": 1, "vendorId": 20,
   "taxType": "CGST_SGST" | "IGST", "taxRatePercent": 18.00, "taxableValue": 1000.00,
   "cgstAmount": 90.00, "sgstAmount": 90.00, "igstAmount": 0.00, "totalAmount": 1180.00,
   "pdfUrl": "https://...", "generatedAt": "ISO-8601" }]
```
`totalAmount` equals what the customer actually paid for that vendor's items — GST is extracted from within that amount (tax-inclusive pricing), not added on top, so it always reconciles with the payment already collected. `pdfUrl` can be used directly as a download link, or via the redirect endpoints below.

### `GET /api/v1/invoices/mine` — auth (VENDOR), paginated — vendor's own invoices
### `GET /api/v1/invoices/mine/{id}/download` — auth (VENDOR) — 302 redirect to the PDF
### `GET /api/v1/invoices/{id}/download` — auth (ADMIN) — 302 redirect to the PDF, any vendor's invoice

---

## 6. Disputes

### `POST /api/v1/disputes` — public
```json
// Request
{
  "orderId": 1, "vendorId": 1, "raisedByEmail": "string",
  "category": "ITEM_NOT_RECEIVED" | "ITEM_DAMAGED" | "ITEM_NOT_AS_DESCRIBED" | "WRONG_ITEM" | "REFUND_REQUEST" | "OTHER",
  "description": "string, max 2000 chars"
}
// Response 201
{ "id": 1, "orderId": 1, "vendorId": 1, "raisedByEmail": "...", "category": "...",
  "description": "...", "status": "OPEN", "resolutionNotes": null, "resolvedAt": null, "createdAt": "..." }
```

### `GET /api/v1/disputes?status=OPEN` — auth (ADMIN), paginated

### `PATCH /api/v1/disputes/{id}/resolve` — auth (ADMIN)
```json
{ "resolution": "RESOLVED_REFUNDED" | "RESOLVED_REJECTED" | "RESOLVED_REPLACED", "notes": "string" }
```

---

## 7. Commission (vendor-facing dashboard data)

### `GET /api/v1/commissions/mine` — auth (VENDOR), paginated
```json
// Each record:
{ "id": 1, "orderId": 1, "vendorId": 1, "grossAmount": 998.00, "commissionRate": 10.00,
  "commissionAmount": 99.80, "vendorPayoutAmount": 898.20, "tcsAmount": 9.98, "tdsAmount": 8.98,
  "vendorNetPayable": 879.24,
  "payoutStatus": "PENDING" | "PAID_OUT" | "HELD_FOR_DISPUTE", "createdAt": "..." }
```
`vendorPayoutAmount` is pre-tax (gross minus commission only). `vendorNetPayable` is what's actually transferred — it also subtracts `tcsAmount` (1% TCS, split CGST+SGST or IGST depending on customer/vendor state) and `tdsAmount` (Sec 194-O: 1% of gross if the vendor has PAN on file, 5% if not — see Section 7b). **Use `vendorNetPayable` for any "what will I actually receive" display, not `vendorPayoutAmount`.**

### `GET /api/v1/commissions/mine/pending-total` — auth (VENDOR)
```json
{ "pendingPayout": 4521.00 }
```

---

## 7a. Vendor Payouts

**Payouts are automatic, not something a vendor "requests".** A vendor's share of an order is released once the customer's delivery is confirmed (Shiprocket webhook → `DELIVERED`) — not at checkout, and not on any fixed schedule. The only thing the frontend needs to build is (1) a one-time bank/UPI details form, and (2) a payout history view. There's no "request payout" button anywhere.

### `POST /api/v1/vendors/me/payout-account` — auth (VENDOR)
```json
// Request — bank account:
{ "accountHolderName": "string", "accountNumber": "9-18 digits", "ifscCode": "e.g. HDFC0001234",
  "bankName": "string, optional", "accountType": "SAVINGS" | "CURRENT" }
// Request — UPI instead of a bank account (provide vpa only, omit accountNumber/ifscCode/accountType):
{ "accountHolderName": "string", "vpa": "name@bank" }
// Response 200
{ "id": 1, "vendorId": 1, "accountHolderName": "...", "accountNumberMasked": "XXXXXXXX1234",
  "ifscCode": "...", "bankName": "...", "accountType": "SAVINGS", "vpa": null,
  "gateway": "CASHFREE", "beneficiaryStatus": "PENDING" | "VERIFIED" | "REJECTED",
  "rejectionReason": "string or null", "updatedAt": "ISO-8601" }
```
Exactly one of (`accountNumber` + `ifscCode` + `accountType`) or (`vpa`) must be supplied — both or neither is a `400`. The real account number is **never** returned by any endpoint, only `accountNumberMasked`. **A vendor cannot be paid until `beneficiaryStatus` is `VERIFIED`** — if it comes back `REJECTED`, show `rejectionReason` and let them resubmit (this endpoint can be called again; it replaces the previous account). Gate this behind vendor onboarding alongside the existing address step (Section 2) — a vendor with no verified payout account still earns commission normally, it just accumulates unpaid until they add one.

### `GET /api/v1/vendors/me/payout-account` — auth (VENDOR)
Same shape as above. `404` if nothing has been registered yet — show the registration form.

### `GET /api/v1/payouts/mine` — auth (VENDOR), paginated
```json
// Each record:
{ "id": 1, "orderId": 1, "vendorId": 1, "amount": 879.24, "gateway": "CASHFREE",
  "gatewayTransferId": "string or null",
  "status": "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "BLOCKED",
  "failureReason": "string or null", "retryCount": 0,
  "initiatedAt": "ISO-8601 or null", "completedAt": "ISO-8601 or null" }
```
`amount` here is the post-tax `vendorNetPayable` figure (see Section 7), not `vendorPayoutAmount` — this is the actual sum transferred to the vendor's bank/UPI account. This endpoint does NOT break `amount` down into commission/TCS/TDS — for that breakdown, join against `GET /commissions/mine` by `orderId`, or show the two views separately (payout status/timing here, tax breakdown there) rather than trying to force one combined table row from a single call.

`BLOCKED` means no verified payout account exists yet (see above) — the frontend should link straight to the payout-account form from this state. `FAILED` needs an admin to investigate/retry; there is currently no vendor self-serve retry.

### Admin: `GET /api/v1/payouts?status=FAILED` — auth (ADMIN), paginated — reconciliation queue across all vendors.
### Admin: `GET /api/v1/payouts/vendor/{vendorId}` — auth (ADMIN), paginated
### Admin: `POST /api/v1/payouts/{id}/retry` — auth (ADMIN) — manually re-attempts a `FAILED` or `BLOCKED` payout.

---

## 7b. Tax Withholding (TCS/TDS)

Every commission record snapshots `tcsAmount` and `tdsAmount` at the moment an order is paid (see Section 7) — these endpoints exist for reconciliation and statutory filing, not for computing anything new.

### `GET /api/v1/tax-withholding/mine/{financialYear}` — auth (VENDOR)
`financialYear` format: `"2026-27"`.
```json
{ "tcs": 4521.00, "tds": 4521.00 }
```
A vendor's own TCS + TDS totals for a financial year, so they can reconcile against what actually lands in their GST/income-tax credit. This is a **year-level aggregate**, not a per-order or per-payout breakdown — use `GET /commissions/mine` for that.

### Admin: `GET /api/v1/tax-withholding/report/{financialYear}/{taxType}` — auth (ADMIN)
`taxType` is `TCS` or `TDS`. Returns a per-vendor summary for the year — the shape needed to actually prepare a GSTR-8 (TCS) or TDS-quarterly filing.

### Admin: `GET /api/v1/tax-withholding/vendor/{vendorId}` — auth (ADMIN), paginated
Raw per-order withholding records for one vendor, for support/reconciliation drill-down behind the summary report above.

**Why TDS is sometimes 5% instead of 1%:** Sec 206AA requires a 5% "no-PAN penalty" TDS rate for any vendor without a PAN on file, vs. the normal 1% under Sec 194-O. `GET /vendors/{id}` now returns `panOnFile: boolean` (see section 2) — use that to predict the rate rather than inferring it from a settled record's `tdsAmount`.

---

## 8. Error Response Shape (all endpoints)
```json
{ "timestamp": "ISO-8601", "status": 400, "error": "message string" }
// Validation errors also include:
{ "timestamp": "...", "status": 400, "error": "Validation failed", "fields": { "email": "Email must be valid" } }
```
HTTP codes used: `400` validation, `401` bad credentials/missing auth, `403` forbidden (wrong role), `404` not found, `409` conflict (duplicate/insufficient stock/invalid state), `429` rate-limited, `502` payment gateway unavailable.

---

## 9. Recommended Frontend Pages (mapping to endpoints above)

| Page | Primary endpoints |
|---|---|
| Storefront / catalog browse | `GET /products` |
| Product detail | `GET /products/{id}` |
| Cart + Checkout | `POST /orders`, `POST /payments/orders/{id}/initiate`, `GET /orders/{id}` |
| Vendor registration | `POST /vendors/register` |
| Vendor login | `POST /auth/login` |
| Vendor dashboard — products | `GET /products/mine`, `POST /products`, `PUT /products/{id}`, `POST /products/{id}/publish` |
| Vendor dashboard — KYC document upload | `GET /vendors/{id}/kyc-documents`, `POST /vendors/{id}/kyc-documents/presign`, `POST /vendors/{id}/kyc-documents` |
| Vendor dashboard — earnings | `GET /commissions/mine`, `GET /commissions/mine/pending-total` |
| Vendor dashboard — payout account setup | `POST /vendors/me/payout-account`, `GET /vendors/me/payout-account` |
| Vendor dashboard — payout history | `GET /payouts/mine` |
| Vendor dashboard — invoices | `GET /invoices/mine`, `GET /invoices/mine/{id}/download` |
| Customer — order confirmation / invoice link | `GET /invoices/order/{orderId}` |
| Admin login | `POST /auth/login` (same endpoint, role differs) |
| Admin — KYC queue | `GET /vendors/pending-kyc`, `GET /vendors/{id}/kyc-documents`, `PATCH /vendors/{id}/kyc-documents/{documentId}/decision` |
| Admin — commission settings | `PATCH /vendors/{id}/commission-rate` |
| Admin — disputes | `GET /disputes`, `PATCH /disputes/{id}/resolve` |
| Admin — payout reconciliation | `GET /payouts?status=FAILED`, `GET /payouts/vendor/{vendorId}`, `POST /payouts/{id}/retry` |
| Customer — raise dispute | `POST /disputes` |

---

## 10. Known Gaps The Frontend Session Should Be Told About
1. **PayU: checkout works, webhook is implemented but unvalidated, refunds don't work.** Real hash-based checkout and real (but sandbox-untested) webhook verification exist. Refunds throw an explicit error — don't offer "refund" as an option for PayU orders in the UI until that's built. Treat PayU as usable-with-caution, not equivalent to Razorpay/Cashfree.
2. **No customer accounts/login** — checkout is guest-only by design in this version. If the client wants order history for repeat customers, that's a new module.
3. **No refresh token** — sessions expire in 24h with a hard re-login, no silent refresh.
4. **Refund scope is now correctly per-vendor** (fixed) — a dispute refund only charges back the disputed vendor's line items. Order status becomes `PARTIALLY_REFUNDED` (not `REFUNDED`) when other vendors' items in the same order are unaffected. The frontend should surface both statuses distinctly, not treat them as the same "refunded" state.
5. **`PATCH /vendors/{id}/address`** exists — vendors must call this before their orders can ship with a correct pickup location. Consider making this a required onboarding step in the frontend flow.
6. **Rate limits exist on a few public endpoints** — `POST /vendors/register` (5/hour), `POST /disputes` (10/hour), `POST /orders` (30/10min), `POST /auth/forgot-password` (5/hour), all keyed by IP. A 429 response means the limit was hit — show a clear "please try again later" message rather than a generic error, since this is expected behavior, not a bug.
7. **Payouts are gateway-integration-complete but gateway-unverified.** Cashfree Payouts and RazorpayX are both fully implemented against their public API docs (beneficiary registration, transfer, webhook signature verification) but have not been run against a live sandbox account (no credentials were available in the build environment) — same caveat this document already gives PayU in point 1. Validate one real end-to-end payout in Cashfree's sandbox before this goes live with real vendor money. `payout.encryption-key` (encrypts vendor bank account numbers at rest) also MUST be replaced with a real generated key (`openssl rand -base64 32`) before any real account numbers are stored — the shipped default is dev-only.
8. **No vendor self-serve payout retry.** A `FAILED` payout currently requires an admin to call `POST /payouts/{id}/retry` — there's no vendor-facing "retry my payout" button. Intentional for v1 (a failed money transfer usually needs a human to check *why* before blindly retrying), but worth flagging if the client expects self-service here.

---

## 11. Design Direction (approved, not yet built)
Palette: deep indigo `#1B2A4A` (primary/structure), warm marigold `#E8A33D` (CTAs/accent), warm paper `#FAF8F3` (background), ink `#1A1A1A` (text), moss green `#2F7D5D` (success/approved states).
Fonts: Fraunces (headlines only) + Inter (body/UI).
Signature element: product cards styled as market vendor tags (punched-hole notch, category-colored edge) rather than generic bordered SaaS cards.
Layout feel: bazaar/stall energy, not generic admin-panel — this was explicitly requested to distinguish from templated AI output.
