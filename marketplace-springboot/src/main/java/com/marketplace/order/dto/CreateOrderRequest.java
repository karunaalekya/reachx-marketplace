package com.marketplace.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.List;

public record CreateOrderRequest(

        @NotBlank @Email
        String customerEmail,

        @NotBlank
        @Pattern(regexp = "^[6-9]\\d{9}$", message = "Enter a valid 10-digit Indian mobile number")
        String customerPhone,

        @NotBlank
        String shippingAddress,

        // Required for GST invoicing (CGST+SGST vs IGST determination against the vendor's
        // state) - see Order.customerState / InvoiceService.
        @NotBlank
        String customerState,

        @NotEmpty(message = "Order must contain at least one item")
        @Valid
        List<OrderItemRequest> items
) {
    public record OrderItemRequest(
            @NotNull Long productId,
            @NotNull @Min(1) Integer quantity
    ) {}
}
