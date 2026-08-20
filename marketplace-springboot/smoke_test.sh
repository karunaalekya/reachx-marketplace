#!/bin/bash
# ReachX Marketplace backend smoke test - exercises every module reachable without
# real payment gateway / Shiprocket / SMTP credentials.
set -uo pipefail
BASE="http://localhost:8080/api/v1"
PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS ($actual): $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL (expected $expected, got $actual): $desc"
    FAIL=$((FAIL+1))
  fi
}

echo "=== 1. Register a fresh vendor ==="
EMAIL="smoketest_$(date +%s)@test.com"
REG=$(curl -s -X POST "$BASE/vendors/register" -H "Content-Type: application/json" \
  -d "{\"businessName\":\"Smoke Test Vendor\",\"email\":\"$EMAIL\",\"password\":\"TestPass123!\",\"phone\":\"9876543210\"}")
VENDOR_ID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
[ -n "$VENDOR_ID" ] && echo "  PASS: vendor registered, id=$VENDOR_ID" && PASS=$((PASS+1)) || { echo "  FAIL: registration failed: $REG"; FAIL=$((FAIL+1)); }

echo "=== 2. Login, get JWT ==="
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"TestPass123!\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)
[ -n "$TOKEN" ] && echo "  PASS: got JWT" && PASS=$((PASS+1)) || { echo "  FAIL: login failed: $LOGIN"; FAIL=$((FAIL+1)); }
AUTH="Authorization: Bearer $TOKEN"

echo "=== 3. GET /vendors/{id} - own profile ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/vendors/$VENDOR_ID" -H "$AUTH")
check "get own vendor profile" "200" "$CODE"

echo "=== 4. GET /vendors/{id}/account-health - the new endpoint ==="
HEALTH=$(curl -s "$BASE/vendors/$VENDOR_ID/account-health" -H "$AUTH")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/vendors/$VENDOR_ID/account-health" -H "$AUTH")
check "account-health endpoint" "200" "$CODE"
echo "  response: $HEALTH"

echo "=== 5. POST /products - create a product ==="
PROD=$(curl -s -X POST "$BASE/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Widget","description":"test","price":499.00,"stockQuantity":50,"sku":"SMOKE-001"}')
PRODUCT_ID=$(echo "$PROD" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
[ -n "$PRODUCT_ID" ] && echo "  PASS: product created, id=$PRODUCT_ID" && PASS=$((PASS+1)) || { echo "  FAIL: product creation failed: $PROD"; FAIL=$((FAIL+1)); }

echo "=== 6. GET /products/mine ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products/mine" -H "$AUTH")
check "list own products" "200" "$CODE"

echo "=== 7. POST /products/{id}/publish ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products/$PRODUCT_ID/publish" -H "$AUTH")
check "publish product" "200" "$CODE"

echo "=== 8. GET /products (public catalog, no auth) ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products")
check "public product list" "200" "$CODE"

echo "=== 9. POST /orders - create an order against our own product (no auth - customer-facing) ==="
ORDER=$(curl -s -X POST "$BASE/orders" -H "Content-Type: application/json" \
  -d "{\"customerEmail\":\"customer@test.com\",\"customerPhone\":\"9123456780\",\"shippingAddress\":\"123 Test St\",\"customerState\":\"Telangana\",\"items\":[{\"productId\":$PRODUCT_ID,\"quantity\":2}]}")
ORDER_ID=$(echo "$ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
[ -n "$ORDER_ID" ] && echo "  PASS: order created, id=$ORDER_ID" && PASS=$((PASS+1)) || { echo "  FAIL: order creation failed: $ORDER"; FAIL=$((FAIL+1)); }

echo "=== 10. GET /orders/{id} ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/orders/$ORDER_ID" -H "$AUTH")
check "get order detail" "200" "$CODE"

echo "=== 11. POST /payments/orders/{orderId}/initiate ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/payments/orders/$ORDER_ID/initiate" -H "$AUTH")
echo "  actual code: $CODE (informational - placeholder gateway creds mean this SHOULD fail cleanly, not crash)"

echo "=== 12. GET /payouts/mine ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/payouts/mine" -H "$AUTH")
check "list own payouts (empty list expected)" "200" "$CODE"

echo "=== 13. GET /invoices/mine ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/invoices/mine" -H "$AUTH")
check "list own invoices" "200" "$CODE"

echo "=== 14. GET /commissions/mine ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/commissions/mine" -H "$AUTH")
check "list own commissions" "200" "$CODE"

echo "=== 15. GET /shipments/order/{orderId} ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/shipments/order/$ORDER_ID" -H "$AUTH")
echo "  actual code: $CODE (404 expected - no shipment created yet, that's correct not broken)"

echo "=== 16. POST /disputes - raise a dispute ==="
DISPUTE=$(curl -s -X POST "$BASE/disputes" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"orderId\":$ORDER_ID,\"reason\":\"Smoke test dispute\",\"description\":\"testing\"}")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/disputes" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"orderId\":$ORDER_ID,\"reason\":\"Smoke test dispute\",\"description\":\"testing\"}")
echo "  actual code: $CODE (informational - shape may differ from what I guessed, check response)"
echo "  response: $DISPUTE"

echo "=== 17. GET /vendors/me/payout-account ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/vendors/me/payout-account" -H "$AUTH")
echo "  actual code: $CODE (404 expected, none registered)"

echo ""
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed (hard failures only - some 'informational' checks above need your eyes)"
echo "=========================================="
