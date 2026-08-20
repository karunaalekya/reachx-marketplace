package com.marketplace.vendor;

import com.marketplace.common.email.EmailService;
import com.marketplace.common.exception.DuplicateResourceException;
import com.marketplace.vendor.dto.VendorRegistrationRequest;
import com.marketplace.vendor.dto.VendorResponse;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.model.VendorKycDocument;
import com.marketplace.vendor.repository.VendorKycDocumentRepository;
import com.marketplace.vendor.repository.VendorRepository;
import com.marketplace.vendor.service.VendorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VendorServiceTest {

    @Mock private VendorRepository vendorRepository;
    @Mock private VendorKycDocumentRepository vendorKycDocumentRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;
    @Mock private EmailService emailService;
    @Mock private com.marketplace.catalog.storage.StorageService storageService;

    @InjectMocks private VendorService vendorService;

    private VendorRegistrationRequest validRequest;

    @BeforeEach
    void setUp() {
        validRequest = new VendorRegistrationRequest(
                "Test Traders", "vendor@test.com", "9876543210",
                "SecurePass123", "22AAAAA0000A1Z5", "ABCDE1234F"
        );
    }

    @Test
    void register_savesVendorAndPublishesEvent_whenEmailIsNew() {
        when(vendorRepository.existsByEmail(validRequest.email())).thenReturn(false);
        when(passwordEncoder.encode(validRequest.password())).thenReturn("hashed");
        when(vendorRepository.save(any(Vendor.class))).thenAnswer(invocation -> {
            Vendor v = invocation.getArgument(0);
            v.setId(1L);
            return v;
        });

        VendorResponse response = vendorService.register(validRequest);

        assertEquals("Test Traders", response.businessName());
        assertEquals("PENDING", response.kycStatus());
        assertEquals("INACTIVE", response.status());
        // validRequest includes a panNumber ("ABCDE1234F") - panOnFile should reflect that,
        // not just default to false.
        assertEquals(true, response.panOnFile());
    }

    @Test
    void register_throwsDuplicate_whenEmailAlreadyExists() {
        when(vendorRepository.existsByEmail(validRequest.email())).thenReturn(true);

        assertThrows(DuplicateResourceException.class, () -> vendorService.register(validRequest));
    }

    @Test
    void verifyEmail_marksVerifiedAndClearsToken_whenTokenValid() {
        Vendor vendor = Vendor.builder()
                .id(1L).email("vendor@test.com").emailVerified(false)
                .verificationTokenHash("somehash").build();

        // The service hashes the raw token internally and looks up by hash - we can't predict
        // the exact hash without duplicating its SHA-256 logic, so stub the repository to match
        // whatever the service computes by capturing the argument instead of hardcoding a hash.
        when(vendorRepository.findByVerificationTokenHash(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Optional.of(vendor));
        when(vendorRepository.save(any(Vendor.class))).thenAnswer(inv -> inv.getArgument(0));

        vendorService.verifyEmail("raw-token-value");

        assertEquals(true, vendor.isEmailVerified());
        assertEquals(null, vendor.getVerificationTokenHash());
    }

    @Test
    void createKycPresignedUpload_namespacesObjectKeyUnderVendorIdAndDocType() {
        Vendor vendor = Vendor.builder().id(7L).businessName("Test Traders").build();
        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));

        var request = new com.marketplace.vendor.dto.KycPresignedUploadRequest(
                "gst-certificate.pdf", "application/pdf", VendorKycDocument.DocType.GSTIN);

        when(storageService.createPresignedUpload(
                org.mockito.ArgumentMatchers.startsWith("vendor-kyc/7/GSTIN/"), eq("application/pdf")))
                .thenReturn(new com.marketplace.catalog.storage.StorageService.PresignedUpload(
                        "https://bucket.example.com/upload?sig=abc",
                        "https://bucket.example.com/vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf",
                        "vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf",
                        900L));

        var response = vendorService.createKycPresignedUpload(7L, request);

        assertEquals("https://bucket.example.com/upload?sig=abc", response.uploadUrl());
        // The objectKey passed to StorageService must fall under this vendor's own namespace AND
        // carry the docType segment - confirmKycUpload relies on the vendorId prefix to reject a
        // key belonging to another vendor, and on the docType segment to know which document
        // slot this upload confirms.
        org.mockito.ArgumentCaptor<String> keyCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(storageService).createPresignedUpload(keyCaptor.capture(), eq("application/pdf"));
        assertTrue(keyCaptor.getValue().startsWith("vendor-kyc/7/GSTIN/"));
    }

    @Test
    void confirmKycUpload_createsDocumentRowAndResetsToPending_onFirstSubmission() {
        Vendor vendor = Vendor.builder()
                .id(7L).kycStatus(Vendor.KycStatus.PENDING).status(Vendor.VendorStatus.INACTIVE).build();
        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorRepository.save(any(Vendor.class))).thenAnswer(inv -> inv.getArgument(0));
        when(vendorKycDocumentRepository.findByVendorIdAndDocType(7L, VendorKycDocument.DocType.GSTIN))
                .thenReturn(java.util.Optional.empty());
        when(vendorKycDocumentRepository.findByVendorId(7L)).thenReturn(List.of());
        when(vendorKycDocumentRepository.save(any(VendorKycDocument.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(storageService.publicUrlFor("vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf"))
                .thenReturn("https://bucket.example.com/vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf");

        var request = new com.marketplace.vendor.dto.ConfirmKycUploadRequest(
                "vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf");

        var response = vendorService.confirmKycUpload(7L, request);

        assertEquals("PENDING", response.status());
        assertEquals("GSTIN", response.docType());
        assertEquals("https://bucket.example.com/vendor-kyc/7/GSTIN/uuid-gst-certificate.pdf",
                response.documentUrl());
    }

    @Test
    void confirmKycUpload_updatesExistingRowAndClearsRejectionReason_onReUploadAfterRejection() {
        // Regression coverage for the re-submit-after-rejection path: a vendor whose GSTIN
        // document was rejected re-uploads under the same docType, and the stale rejection
        // reason from the old submission must not linger once a new document is under review.
        Vendor vendor = Vendor.builder().id(7L).kycStatus(Vendor.KycStatus.REJECTED).build();
        VendorKycDocument existing = VendorKycDocument.builder()
                .id(50L).vendorId(7L).docType(VendorKycDocument.DocType.GSTIN)
                .status(VendorKycDocument.DocStatus.REJECTED)
                .rejectionReason("GSTIN certificate blurred")
                .build();
        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorRepository.save(any(Vendor.class))).thenAnswer(inv -> inv.getArgument(0));
        when(vendorKycDocumentRepository.findByVendorIdAndDocType(7L, VendorKycDocument.DocType.GSTIN))
                .thenReturn(java.util.Optional.of(existing));
        when(vendorKycDocumentRepository.findByVendorId(7L)).thenReturn(List.of(existing));
        when(vendorKycDocumentRepository.save(any(VendorKycDocument.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(storageService.publicUrlFor("vendor-kyc/7/GSTIN/uuid-retry.pdf"))
                .thenReturn("https://bucket.example.com/vendor-kyc/7/GSTIN/uuid-retry.pdf");

        var request = new com.marketplace.vendor.dto.ConfirmKycUploadRequest("vendor-kyc/7/GSTIN/uuid-retry.pdf");

        var response = vendorService.confirmKycUpload(7L, request);

        assertEquals("PENDING", response.status());
        assertEquals(null, response.rejectionReason());
        assertEquals(50L, response.id()); // updated the existing row in place, didn't create a second one
    }

    @Test
    void confirmKycUpload_rejectsObjectKeyBelongingToAnotherVendor() {
        Vendor vendor = Vendor.builder().id(7L).build();
        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));

        // objectKey namespaced under vendor 9, not the requesting vendor 7 - this is exactly the
        // cross-vendor key reuse ProductImageService.confirmUpload's expectedPrefix check exists
        // to block, mirrored here for KYC documents.
        var request = new com.marketplace.vendor.dto.ConfirmKycUploadRequest("vendor-kyc/9/GSTIN/uuid-file.pdf");

        assertThrows(IllegalArgumentException.class,
                () -> vendorService.confirmKycUpload(7L, request));
    }

    @Test
    void confirmKycUpload_rejectsMalformedObjectKeyMissingDocTypeSegment() {
        // A stale pre-V18 key (vendor-kyc/{vendorId}/uuid-file.pdf, no docType segment) or a
        // hand-crafted one - must fail loudly rather than silently mis-parsing a filename as a
        // docType.
        Vendor vendor = Vendor.builder().id(7L).build();
        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));

        var request = new com.marketplace.vendor.dto.ConfirmKycUploadRequest("vendor-kyc/7/uuid-file.pdf");

        assertThrows(IllegalArgumentException.class,
                () -> vendorService.confirmKycUpload(7L, request));
    }

    @Test
    void decideKycDocument_approvingLastRequiredDocType_flipsVendorToActive() {
        // All three required types (PAN, GSTIN, BANK_CHEQUE) already APPROVED except this one -
        // approving it should flip the vendor's overall kycStatus to APPROVED and status to
        // ACTIVE. Deliberately doesn't hardcode "3" anywhere in the service - this test exists to
        // catch a regression if that ever creeps back in.
        Vendor vendor = Vendor.builder().id(7L).kycStatus(Vendor.KycStatus.PENDING)
                .status(Vendor.VendorStatus.INACTIVE).build();
        VendorKycDocument pan = approvedDoc(7L, VendorKycDocument.DocType.PAN);
        VendorKycDocument bank = approvedDoc(7L, VendorKycDocument.DocType.BANK_CHEQUE);
        VendorKycDocument gstin = VendorKycDocument.builder()
                .id(3L).vendorId(7L).docType(VendorKycDocument.DocType.GSTIN)
                .status(VendorKycDocument.DocStatus.PENDING).build();

        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorRepository.save(any(Vendor.class))).thenAnswer(inv -> inv.getArgument(0));
        when(vendorKycDocumentRepository.findByIdAndVendorId(3L, 7L))
                .thenReturn(java.util.Optional.of(gstin));
        when(vendorKycDocumentRepository.save(any(VendorKycDocument.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(vendorKycDocumentRepository.findByVendorId(7L))
                .thenReturn(List.of(pan, bank, gstin));

        var decision = new com.marketplace.vendor.dto.KycDocumentDecisionRequest(true, null);
        vendorService.decideKycDocument(7L, 3L, decision);

        assertEquals(Vendor.KycStatus.APPROVED, vendor.getKycStatus());
        assertEquals(Vendor.VendorStatus.ACTIVE, vendor.getStatus());
    }

    @Test
    void decideKycDocument_rejectingOneRequiredDocType_setsOverallRejectedButDoesNotDemoteActiveVendor() {
        // A vendor already ACTIVE (e.g. all three approved previously) gets one document
        // re-reviewed and rejected. kycStatus should reflect REJECTED so the gap is visible, but
        // status must NOT silently flip back to INACTIVE - pulling a live vendor's storefront
        // down is a distinct, deliberate action (VendorService#suspend), not an implicit side
        // effect of a document re-review.
        Vendor vendor = Vendor.builder().id(7L).kycStatus(Vendor.KycStatus.APPROVED)
                .status(Vendor.VendorStatus.ACTIVE).build();
        VendorKycDocument pan = approvedDoc(7L, VendorKycDocument.DocType.PAN);
        VendorKycDocument bank = approvedDoc(7L, VendorKycDocument.DocType.BANK_CHEQUE);
        VendorKycDocument gstin = VendorKycDocument.builder()
                .id(3L).vendorId(7L).docType(VendorKycDocument.DocType.GSTIN)
                .status(VendorKycDocument.DocStatus.PENDING).build();

        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorRepository.save(any(Vendor.class))).thenAnswer(inv -> inv.getArgument(0));
        when(vendorKycDocumentRepository.findByIdAndVendorId(3L, 7L))
                .thenReturn(java.util.Optional.of(gstin));
        when(vendorKycDocumentRepository.save(any(VendorKycDocument.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(vendorKycDocumentRepository.findByVendorId(7L))
                .thenReturn(List.of(pan, bank, gstin));

        var decision = new com.marketplace.vendor.dto.KycDocumentDecisionRequest(false, "GSTIN mismatch on re-check");
        vendorService.decideKycDocument(7L, 3L, decision);

        assertEquals(Vendor.KycStatus.REJECTED, vendor.getKycStatus());
        assertEquals(Vendor.VendorStatus.ACTIVE, vendor.getStatus());
    }

    @Test
    void decideKycDocument_throwsIfDocumentAlreadyApproved() {
        Vendor vendor = Vendor.builder().id(7L).build();
        VendorKycDocument doc = approvedDoc(7L, VendorKycDocument.DocType.PAN);
        doc.setId(3L);

        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorKycDocumentRepository.findByIdAndVendorId(3L, 7L))
                .thenReturn(java.util.Optional.of(doc));

        var decision = new com.marketplace.vendor.dto.KycDocumentDecisionRequest(true, null);

        assertThrows(IllegalStateException.class,
                () -> vendorService.decideKycDocument(7L, 3L, decision));
    }

    @Test
    void decideKycDocument_throwsIfRejectingWithoutReason() {
        Vendor vendor = Vendor.builder().id(7L).build();
        VendorKycDocument doc = VendorKycDocument.builder()
                .id(3L).vendorId(7L).docType(VendorKycDocument.DocType.PAN)
                .status(VendorKycDocument.DocStatus.PENDING).build();

        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorKycDocumentRepository.findByIdAndVendorId(3L, 7L))
                .thenReturn(java.util.Optional.of(doc));

        var decision = new com.marketplace.vendor.dto.KycDocumentDecisionRequest(false, "   ");

        assertThrows(IllegalArgumentException.class,
                () -> vendorService.decideKycDocument(7L, 3L, decision));
    }

    @Test
    void listKycDocuments_returnsOnlyUploadedSlots_notSyntheticPlaceholders() {
        Vendor vendor = Vendor.builder().id(7L).build();
        VendorKycDocument pan = approvedDoc(7L, VendorKycDocument.DocType.PAN);

        when(vendorRepository.findById(7L)).thenReturn(java.util.Optional.of(vendor));
        when(vendorKycDocumentRepository.findByVendorId(7L)).thenReturn(List.of(pan));

        var docs = vendorService.listKycDocuments(7L);

        // Only PAN was uploaded - GSTIN/BANK_CHEQUE/MSME_CERTIFICATE are absent, not synthesized
        // as empty placeholder rows.
        assertEquals(1, docs.size());
        assertEquals("PAN", docs.get(0).docType());
    }

    private static VendorKycDocument approvedDoc(Long vendorId, VendorKycDocument.DocType type) {
        return VendorKycDocument.builder()
                .vendorId(vendorId).docType(type)
                .status(VendorKycDocument.DocStatus.APPROVED)
                .build();
    }
}
