package com.marketplace.vendor.service;

import com.marketplace.catalog.dto.PresignedUploadResponse;
import com.marketplace.catalog.storage.StorageService;
import com.marketplace.common.email.EmailService;
import com.marketplace.common.exception.DuplicateResourceException;
import com.marketplace.common.exception.InvalidCredentialsException;
import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.common.util.SlugUtil;
import com.marketplace.config.KafkaTopics;
import com.marketplace.vendor.dto.ConfirmKycUploadRequest;
import com.marketplace.vendor.dto.KycDocumentDecisionRequest;
import com.marketplace.vendor.dto.KycPresignedUploadRequest;
import com.marketplace.vendor.dto.VendorKycDocumentResponse;
import com.marketplace.vendor.dto.VendorRegistrationRequest;
import com.marketplace.vendor.dto.VendorResponse;
import com.marketplace.vendor.event.VendorKycDecisionEvent;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.model.VendorKycDocument;
import com.marketplace.vendor.repository.VendorKycDocumentRepository;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class VendorService {

    private final VendorRepository vendorRepository;
    private final VendorKycDocumentRepository vendorKycDocumentRepository;
    private final PasswordEncoder passwordEncoder;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final EmailService emailService;
    private final StorageService storageService;

    private static final SecureRandom RANDOM = new SecureRandom();

    @Value("${app.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    @Transactional
    public VendorResponse register(VendorRegistrationRequest request) {
        if (vendorRepository.existsByEmail(request.email())) {
            throw new DuplicateResourceException("A vendor account with this email already exists");
        }

        String rawVerificationToken = generateRawToken();

        Vendor vendor = Vendor.builder()
                .businessName(request.businessName())
                .email(request.email())
                .phone(request.phone())
                .passwordHash(passwordEncoder.encode(request.password()))
                .gstin(request.gstin())
                .panNumber(request.panNumber())
                .kycStatus(Vendor.KycStatus.PENDING)
                .status(Vendor.VendorStatus.INACTIVE)
                .emailVerified(false)
                .verificationTokenHash(sha256(rawVerificationToken))
                .build();

        Vendor saved = vendorRepository.save(vendor);
        log.info("Vendor registered: id={} email={}", saved.getId(), saved.getEmail());

        String verifyLink = frontendBaseUrl + "/verify-email?token=" + rawVerificationToken;
        emailService.send(saved.getEmail(), "Verify your email",
                "Welcome to the marketplace. Please verify your email by clicking the link below:\n\n"
                        + verifyLink);

        kafkaTemplate.send(KafkaTopics.VENDOR_REGISTERED, saved.getId().toString(), saved.getEmail());

        return VendorResponse.from(saved);
    }

    @Transactional
    public void verifyEmail(String rawToken) {
        Vendor vendor = vendorRepository.findByVerificationTokenHash(sha256(rawToken))
                .orElseThrow(InvalidCredentialsException::new);

        vendor.setEmailVerified(true);
        vendor.setVerificationTokenHash(null);   // one-time use, consistent with password reset tokens
        vendorRepository.save(vendor);
        log.info("Vendor email verified: id={}", vendor.getId());
    }

    public VendorResponse getById(Long id) {
        return VendorResponse.from(findVendorOrThrow(id));
    }

    public Page<VendorResponse> findPendingKyc(Pageable pageable) {
        return vendorRepository.findByKycStatus(Vendor.KycStatus.PENDING, pageable)
                .map(VendorResponse::from);
    }

    // Self (vendor) or admin: list every KYC document slot this vendor has uploaded into.
    // Deliberately does NOT synthesize rows for doc types never uploaded - the frontend already
    // knows the full DocType enum and can render "not yet uploaded" for anything missing from
    // this list, so this stays a plain read of what actually exists rather than the service
    // inventing placeholder rows.
    public List<VendorKycDocumentResponse> listKycDocuments(Long vendorId) {
        findVendorOrThrow(vendorId); // 404s cleanly if the vendor itself doesn't exist
        return vendorKycDocumentRepository.findByVendorId(vendorId).stream()
                .map(VendorKycDocumentResponse::from)
                .toList();
    }

    // Admin-only: approve or reject ONE document slot (PAN / GSTIN / BANK_CHEQUE /
    // MSME_CERTIFICATE), not the whole vendor at once - this is what actually delivers the
    // "PAN verified but GSTIN rejected" granularity that was the entire point of moving off the
    // old single-field model. Replaces the old vendor-level PATCH /kyc-decision entirely; see
    // MASTER_BLUEPRINT.md's breaking-change note for anyone integrating against the old shape.
    @Transactional
    public VendorKycDocumentResponse decideKycDocument(
            Long vendorId, Long documentId, KycDocumentDecisionRequest decision) {
        Vendor vendor = findVendorOrThrow(vendorId);
        VendorKycDocument doc = vendorKycDocumentRepository.findByIdAndVendorId(documentId, vendorId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "KYC document " + documentId + " not found for vendor " + vendorId));

        if (doc.getStatus() == VendorKycDocument.DocStatus.APPROVED) {
            throw new IllegalStateException("This document is already approved");
        }

        if (Boolean.TRUE.equals(decision.approved())) {
            doc.setStatus(VendorKycDocument.DocStatus.APPROVED);
            doc.setRejectionReason(null);
        } else {
            if (decision.rejectionReason() == null || decision.rejectionReason().isBlank()) {
                throw new IllegalArgumentException("Rejection reason is required when rejecting a KYC document");
            }
            doc.setStatus(VendorKycDocument.DocStatus.REJECTED);
            doc.setRejectionReason(decision.rejectionReason());
        }
        doc.setDecidedAt(Instant.now());

        VendorKycDocument savedDoc = vendorKycDocumentRepository.save(doc);
        log.info("Vendor KYC document decided: vendorId={} documentId={} docType={} approved={}",
                vendorId, documentId, doc.getDocType(), decision.approved());

        recomputeOverallKycStatus(vendor);

        kafkaTemplate.send(
                KafkaTopics.VENDOR_KYC_DECIDED,
                vendorId.toString(),
                new VendorKycDecisionEvent(
                        vendor.getId(),
                        vendor.getBusinessName(),
                        vendor.getEmail(),
                        decision.approved(),
                        savedDoc.getRejectionReason(),
                        Instant.now()
                )
        );

        return VendorKycDocumentResponse.from(savedDoc);
    }

    // Recomputes Vendor.kycStatus (the overall/derived summary) from the current set of
    // per-document rows, and flips Vendor.status to ACTIVE the moment every REQUIRED doc type
    // (see VendorKycDocument.DocType#isRequired) is APPROVED. Deliberately reads
    // DocType.values() rather than any hardcoded count - this is the direct fix for the
    // `approvedCount == 3` bug flagged in the earlier draft of this schema: adding a 5th required
    // doc type later needs zero changes here, only a new enum constant (+ V-migration CHECK).
    //
    // Once a vendor has reached ACTIVE, a later rejection (e.g. a re-review after a dispute)
    // deliberately does NOT demote Vendor.status back to INACTIVE - that would silently pull an
    // already-live, already-selling vendor's storefront down as a side effect of a KYC
    // re-review, which is a much bigger action than "flag this document as needing
    // re-submission." An admin who actually wants to stop that vendor from selling has
    // VendorService#suspend for that - a deliberate, explicit action, not an implicit one.
    // kycStatus itself still reports REJECTED/PENDING accurately either way, so this is visible,
    // just not auto-enforced against an already-active vendor.
    private void recomputeOverallKycStatus(Vendor vendor) {
        List<VendorKycDocument> docs = vendorKycDocumentRepository.findByVendorId(vendor.getId());

        List<VendorKycDocument.DocType> requiredTypes = Arrays.stream(VendorKycDocument.DocType.values())
                .filter(VendorKycDocument.DocType::isRequired)
                .toList();

        boolean anyRequiredRejected = docs.stream()
                .filter(d -> d.getDocType().isRequired())
                .anyMatch(d -> d.getStatus() == VendorKycDocument.DocStatus.REJECTED);

        boolean allRequiredApproved = requiredTypes.stream().allMatch(type ->
                docs.stream().anyMatch(d -> d.getDocType() == type
                        && d.getDocType().isRequired()
                        && d.getStatus() == VendorKycDocument.DocStatus.APPROVED));

        if (allRequiredApproved) {
            vendor.setKycStatus(Vendor.KycStatus.APPROVED);
            if (vendor.getStatus() == Vendor.VendorStatus.INACTIVE) {
                vendor.setStatus(Vendor.VendorStatus.ACTIVE);
            }
        } else if (anyRequiredRejected) {
            vendor.setKycStatus(Vendor.KycStatus.REJECTED);
        } else {
            vendor.setKycStatus(Vendor.KycStatus.PENDING);
        }

        vendorRepository.save(vendor);
    }

    // Step 1 of the presigned-upload flow for KYC documents - same pattern
    // ProductImageService.createPresignedUpload uses for product images, reusing the same
    // StorageService abstraction (S3-compatible: AWS S3, Cloudinary, Supabase Storage all work).
    // request.docType() picks which slot (PAN / GSTIN / BANK_CHEQUE / MSME_CERTIFICATE) this
    // upload is for, and is embedded into the objectKey path itself rather than trusted again as
    // free-standing input at confirm time - see confirmKycUpload below.
    public PresignedUploadResponse createKycPresignedUpload(
            Long vendorId, KycPresignedUploadRequest request) {
        Vendor vendor = findVendorOrThrow(vendorId);

        // Namespaced under vendor-kyc/{vendorId}/{docType}/ - the {vendorId} segment lets
        // confirmKycUpload verify a returned objectKey actually belongs to this vendor (same
        // defense as ProductImageService.confirmUpload's expectedPrefix check), and the
        // {docType} segment lets confirmKycUpload recover which document slot this upload was
        // for without accepting a second, independently-spoofable docType at confirm time.
        String safeFileName = SlugUtil.toSlug(stripExtension(request.fileName()))
                + extensionFor(request.contentType());
        String objectKey = "vendor-kyc/%d/%s/%s-%s".formatted(
                vendor.getId(), request.docType().name(), UUID.randomUUID(), safeFileName);

        StorageService.PresignedUpload upload =
                storageService.createPresignedUpload(objectKey, request.contentType());

        return PresignedUploadResponse.from(upload);
    }

    // Step 2: the client has already PUT the file bytes directly to the bucket using the
    // presigned URL from step 1 - this call never carries the document binary, only the
    // objectKey confirming it landed. docType is parsed back out of the trusted objectKey path
    // (vendor-kyc/{vendorId}/{docType}/...) rather than accepted as separate client input here -
    // same trust model as the vendorId-prefix check below, just extended one path segment
    // further. Re-submitting the same docType after a rejection reuses this same endpoint and
    // updates the existing row in place (upsert by (vendorId, docType)) - it always resets that
    // document's status to PENDING and clears any prior rejection reason, since a freshly
    // uploaded document needs fresh admin review.
    @Transactional
    public VendorKycDocumentResponse confirmKycUpload(Long vendorId, ConfirmKycUploadRequest request) {
        Vendor vendor = findVendorOrThrow(vendorId);

        String expectedPrefix = "vendor-kyc/%d/".formatted(vendor.getId());
        if (!request.objectKey().startsWith(expectedPrefix)) {
            throw new IllegalArgumentException(
                    "This upload key does not belong to vendor " + vendorId);
        }

        VendorKycDocument.DocType docType = parseDocTypeFromObjectKey(request.objectKey(), expectedPrefix);

        String publicUrl = storageService.publicUrlFor(request.objectKey());

        VendorKycDocument doc = vendorKycDocumentRepository
                .findByVendorIdAndDocType(vendorId, docType)
                .orElseGet(() -> VendorKycDocument.builder()
                        .vendorId(vendorId)
                        .docType(docType)
                        .build());

        doc.setStorageKey(request.objectKey());
        doc.setDocumentUrl(publicUrl);
        doc.setStatus(VendorKycDocument.DocStatus.PENDING);
        doc.setRejectionReason(null);
        doc.setUploadedAt(Instant.now());
        doc.setDecidedAt(null);

        VendorKycDocument saved = vendorKycDocumentRepository.save(doc);
        log.info("Vendor KYC document uploaded: vendorId={} docType={}", vendorId, docType);

        recomputeOverallKycStatus(vendor);

        return VendorKycDocumentResponse.from(saved);
    }

    // objectKey shape is vendor-kyc/{vendorId}/{docType}/{uuid}-{filename} (see
    // createKycPresignedUpload) - expectedPrefix already covers "vendor-kyc/{vendorId}/", so the
    // next path segment is the docType. Throws the same IllegalArgumentException family as the
    // prefix check above for any objectKey that doesn't actually match this shape (e.g. a stale
    // key from before V18, or a hand-crafted one) rather than throwing an unchecked
    // IllegalArgumentException from valueOf() with a less clear message.
    private VendorKycDocument.DocType parseDocTypeFromObjectKey(String objectKey, String expectedPrefix) {
        String remainder = objectKey.substring(expectedPrefix.length());
        int slash = remainder.indexOf('/');
        if (slash <= 0) {
            throw new IllegalArgumentException("Malformed KYC objectKey, missing docType segment: " + objectKey);
        }
        String docTypeSegment = remainder.substring(0, slash);
        try {
            return VendorKycDocument.DocType.valueOf(docTypeSegment);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown KYC docType in objectKey: " + docTypeSegment);
        }
    }

    private String stripExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "application/pdf" -> ".pdf";
            default -> ".jpg"; // image/jpeg, image/jpg
        };
    }

    // Vendor self-service: set their own pickup address, required before their orders can ship.
    @Transactional
    public VendorResponse updateAddress(Long vendorId, com.marketplace.vendor.dto.UpdateVendorAddressRequest request) {
        Vendor vendor = findVendorOrThrow(vendorId);
        vendor.setAddressLine1(request.addressLine1());
        vendor.setAddressLine2(request.addressLine2());
        vendor.setCity(request.city());
        vendor.setState(request.state());
        vendor.setPincode(request.pincode());
        vendor.setPickupLocationName(request.pickupLocationName());
        Vendor saved = vendorRepository.save(vendor);
        log.info("Vendor address updated: vendorId={}", vendorId);
        return VendorResponse.from(saved);
    }

    // Admin-only: suspend a vendor (e.g. policy violation, fraud investigation). Unlike KYC
    // rejection, this can be applied to an already-ACTIVE vendor - it's an enforcement action,
    // not a pre-approval gate. The enum value existed already but had no way to be set until now.
    @Transactional
    public VendorResponse suspend(Long vendorId, String reason) {
        Vendor vendor = findVendorOrThrow(vendorId);
        if (vendor.getStatus() == Vendor.VendorStatus.SUSPENDED) {
            throw new IllegalStateException("Vendor is already suspended");
        }
        vendor.setStatus(Vendor.VendorStatus.SUSPENDED);
        Vendor saved = vendorRepository.save(vendor);
        log.warn("Vendor suspended: vendorId={} reason={}", vendorId, reason);
        return VendorResponse.from(saved);
    }

    @Transactional
    public VendorResponse reactivate(Long vendorId) {
        Vendor vendor = findVendorOrThrow(vendorId);
        if (vendor.getStatus() != Vendor.VendorStatus.SUSPENDED) {
            throw new IllegalStateException("Vendor is not currently suspended");
        }
        vendor.setStatus(Vendor.VendorStatus.ACTIVE);
        Vendor saved = vendorRepository.save(vendor);
        log.info("Vendor reactivated: vendorId={}", vendorId);
        return VendorResponse.from(saved);
    }

    // Admin-only: adjust a vendor's commission rate going forward. Past commission_records
    // keep their own snapshotted rate (see CommissionService) - this never rewrites history.
    @Transactional
    public VendorResponse updateCommissionRate(Long vendorId, java.math.BigDecimal newRate) {
        Vendor vendor = findVendorOrThrow(vendorId);
        vendor.setCommissionRate(newRate);
        Vendor saved = vendorRepository.save(vendor);
        log.info("Vendor commission rate updated: vendorId={} newRate={}", vendorId, newRate);
        return VendorResponse.from(saved);
    }

    Vendor findVendorOrThrow(Long id) {
        return vendorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found with id: " + id));
    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("Failed to hash token", e);
        }
    }
}
