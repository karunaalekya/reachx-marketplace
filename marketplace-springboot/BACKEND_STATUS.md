# Backend status — vendor-facing API surface

Kept up to date so anyone (or any future session) picking this up doesn't have to re-derive
what's live by re-reading every controller. Last updated: 2026-08-21.

## Vendor-facing endpoints — live, verified via `mvn compile` + fresh repo pull

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /commissions/mine` | VENDOR | Per-order gross/commission/TCS/TDS/net ledger line |
| `GET /commissions/mine/pending-total` | VENDOR | Single number, not client-derivable across pages |
| `GET /payouts/mine` | VENDOR | Settlement/transfer status, distinct from commission record |
| `GET /tax-withholding/mine/{financialYear}` | VENDOR | Flat `{tcs, tds}` totals, FY format `YYYY-YY` |
| `POST/GET /vendors/{id}/kyc-documents`, `.../presign` | VENDOR | Split presign+PUT / confirm — see frontend `kycApi.ts` for why |
| `GET /disputes/mine` | VENDOR | Read-only for vendors — raising is public/customer, resolving is ADMIN-only |
| `GET /orders/mine` (+ `?status=`) | VENDOR | Vendor's own line items only, never another vendor's sharing the order |
| `GET /orders/mine/status-counts` | VENDOR | Zero-filled for every `OrderStatus`, powers tab badges |

## Public endpoints

| Endpoint | Notes |
|---|---|
| `POST /orders` | Guest checkout, optional `Idempotency-Key` header |
| `GET /orders/lookup?orderNumber=&email=` | Guest order tracking — order number alone is guessable, email match required. Same "not found" message on either failure mode, so it can't be used to enumerate emails |
| `POST /disputes` | Guest dispute raising |

## Admin-only endpoints

| Endpoint | Notes |
|---|---|
| `GET /orders/{id}` | **Locked down 2026-08-21** — was public with no check, leaked every vendor's items in a shared order. Now `@PreAuthorize("hasRole('ADMIN')")` |
| `GET /disputes`, `GET /disputes/{id}`, `PATCH /disputes/{id}/resolve` | |
| `GET /tax-withholding/vendor/{vendorId}` | |

## Data model notes worth knowing before building against this

- **Multi-vendor orders**: `vendorId` lives on `OrderItem`, not `Order` — one order can span
  several vendors. Any vendor-scoped order query needs a join + item-level filter, not a plain
  `findByVendorId` on `Order`.
- **Shipments**: one row per `(order_id, vendor_id)` in `shipments`, full lifecycle
  (`PENDING → CREATED → PICKUP_SCHEDULED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, plus
  `FAILED`/`RTO`), AWB + courier name, and a `shipByDeadline` (V19 migration) with a
  server-computed `overdue` boolean.
- **Tax**: PAN-aware TDS/TCS computed entirely server-side in `TaxWithholdingService` — no
  frontend tax-calculation engine exists or is needed. Combined TCS/TDS only, no per-tax-head
  CGST/SGST/IGST split on `CommissionRecord`.
- **Auth**: `userId` in the login response *is* `vendor.getId()` for a VENDOR-role login
  (verified against `AuthService`/`JwtService` directly) — but this does NOT hold for an ADMIN
  login, which uses a separate id space.

## Known open items

- No test coverage yet for the frontend Orders/Disputes screens (`OrdersPanel.tsx` /
  `DisputesPanel.tsx`) — only login + KYC upload/retry are covered in
  `App.interaction.test.tsx`.
- Frontend Catalogue/Invoices/Payments/Refunds modules not started — nav items exist as
  placeholders pointing at their respective controllers.
