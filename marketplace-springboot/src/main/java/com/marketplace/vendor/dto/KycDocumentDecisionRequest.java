package com.marketplace.vendor.dto;

import jakarta.validation.constraints.NotNull;

// Same shape as the old vendor-level KycDecisionRequest, now scoped to one document instead of
// the whole vendor - this is what actually gives an admin the "PAN verified but GSTIN rejected"
// granularity that was the entire stated reason for moving to a multi-document model in the
// first place. The old vendor-level PATCH /kyc-decision endpoint is removed in favor of this;
// see MASTER_BLUEPRINT.md's breaking-change note.
public record KycDocumentDecisionRequest(
        @NotNull(message = "approved is required")
        Boolean approved,

        String rejectionReason
) {}
