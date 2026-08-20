package com.marketplace.shipping.dto;

public record ShiprocketTrackingWebhook(
        String awb,
        String current_status
) {}
