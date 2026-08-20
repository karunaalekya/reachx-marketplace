package com.marketplace.payout.controller;

import com.marketplace.common.security.CurrentVendor;
import com.marketplace.payout.dto.PayoutResponse;
import com.marketplace.payout.gateway.PayoutGateway;
import com.marketplace.payout.model.Payout;
import com.marketplace.payout.service.PayoutService;
import lombok.extern.slf4j.Slf4j;
import org.json.JSONObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/payouts")
@Slf4j
public class PayoutController {

    private final PayoutService payoutService;
    private final Map<String, PayoutGateway> gateways;

    public PayoutController(PayoutService payoutService, Map<String, PayoutGateway> gateways) {
        this.payoutService = payoutService;
        this.gateways = gateways;
    }

    // Vendor's own payout ledger - mirrors CommissionController's /mine pattern.
    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<PayoutResponse>> mine(@CurrentVendor Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(payoutService.findByVendor(vendorId, pageable).map(PayoutResponse::from));
    }

    // Admin: all payouts, optionally filtered by status - the reconciliation/ops view. Without a
    // status filter this could return every payout ever, which is fine for a demo/pilot scale
    // but should get a default sane page size (Pageable already handles that) before scaling.
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<PayoutResponse>> all(
            @RequestParam(required = false) Payout.PayoutStatus status, Pageable pageable) {
        Page<Payout> page = status != null
                ? payoutService.findByStatus(status, pageable)
                : payoutService.findAll(pageable);
        return ResponseEntity.ok(page.map(PayoutResponse::from));
    }

    // Admin: any vendor's payout ledger, for support/reconciliation.
    @GetMapping("/vendor/{vendorId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<PayoutResponse>> byVendor(@PathVariable Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(payoutService.findByVendor(vendorId, pageable).map(PayoutResponse::from));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PayoutResponse> byId(@PathVariable Long id) {
        return ResponseEntity.ok(PayoutResponse.from(payoutService.getById(id)));
    }

    // Manual reconciliation path - the enterprise-grade requirement this codebase's README
    // already calls out for other flows (webhook replay/retry tooling is on ROADMAP.md as a
    // still-open gap for other modules; this is that same category of tooling, built for
    // payouts specifically since a payout is the one place a silent failure directly costs a
    // vendor money that's already legitimately theirs).
    @PostMapping("/{id}/retry")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PayoutResponse> retry(@PathVariable Long id) {
        return ResponseEntity.ok(PayoutResponse.from(payoutService.retry(id)));
    }

    // Cashfree Payouts webhook - status updates for transfers that were PROCESSING/PENDING when
    // transfer() returned (Cashfree Payouts is asynchronous for bank transfers - the initial
    // requestTransfer response is not always the final word). Separate signing secret from
    // Cashfree's payment-collection webhook (see CashfreePayoutGateway).
    @PostMapping("/webhook/cashfree")
    public ResponseEntity<String> cashfreeWebhook(
            @RequestBody String rawPayload,
            @RequestHeader(value = "x-webhook-signature", required = false) String signature) {

        PayoutGateway cashfree = gateways.get("cashfreePayoutGateway");
        if (!cashfree.verifyWebhookSignature(rawPayload, signature)) {
            log.warn("Rejected Cashfree Payouts webhook - signature verification failed");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid signature");
        }

        JSONObject payload = new JSONObject(rawPayload);
        JSONObject data = payload.optJSONObject("data");
        JSONObject transfer = data != null ? data.optJSONObject("transfer") : null;

        String transferId = transfer != null ? transfer.optString("transferId", null) : null;
        String status = transfer != null ? transfer.optString("status", "") : "";
        String reason = transfer != null ? transfer.optString("reason", "Transfer failed") : "Transfer failed";

        if (transferId == null) {
            log.warn("Cashfree Payouts webhook had no transferId, ignoring: {}", rawPayload);
            return ResponseEntity.ok("OK");
        }

        boolean completed = "SUCCESS".equalsIgnoreCase(status);
        payoutService.applyWebhookStatusUpdate(transferId, completed, completed ? null : reason);
        return ResponseEntity.ok("OK");
    }

    // RazorpayX payout webhook - same HMAC-SHA256-hex scheme as Razorpay's payment webhooks, but
    // a separate webhook subscription/secret (see RazorpayXPayoutGateway).
    @PostMapping("/webhook/razorpayx")
    public ResponseEntity<String> razorpayxWebhook(
            @RequestBody String rawPayload,
            @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {

        PayoutGateway razorpayx = gateways.get("razorpayxGateway");
        if (!razorpayx.verifyWebhookSignature(rawPayload, signature)) {
            log.warn("Rejected RazorpayX webhook - signature verification failed");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid signature");
        }

        JSONObject payload = new JSONObject(rawPayload);
        String event = payload.optString("event", "");
        JSONObject entity = payload.optJSONObject("payload") != null
                ? payload.optJSONObject("payload").optJSONObject("payout") != null
                    ? payload.optJSONObject("payload").optJSONObject("payout").optJSONObject("entity") : null
                : null;

        String transferId = entity != null ? entity.optString("id", null) : null;
        if (transferId == null) {
            log.warn("RazorpayX webhook had no payout id, ignoring: {}", rawPayload);
            return ResponseEntity.ok("OK");
        }

        boolean completed = "payout.processed".equals(event);
        boolean failed = "payout.failed".equals(event) || "payout.reversed".equals(event);

        if (completed || failed) {
            payoutService.applyWebhookStatusUpdate(transferId, completed, completed ? null : "RazorpayX event: " + event);
        } else {
            log.info("Ignoring non-terminal RazorpayX payout event: {}", event);
        }
        return ResponseEntity.ok("OK");
    }
}
