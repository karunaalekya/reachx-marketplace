package com.marketplace.vendor.repository;

import com.marketplace.vendor.model.VendorKycDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VendorKycDocumentRepository extends JpaRepository<VendorKycDocument, Long> {

    List<VendorKycDocument> findByVendorId(Long vendorId);

    Optional<VendorKycDocument> findByVendorIdAndDocType(Long vendorId, VendorKycDocument.DocType docType);

    // Used by the confirm-upload step to enforce the one-row-per-(vendor,doc_type) model at the
    // service layer before the DB's own UNIQUE constraint would reject a duplicate insert - lets
    // VendorService update the existing row in place (re-upload) instead of hitting a constraint
    // violation and having to translate that into a user-facing error.
    Optional<VendorKycDocument> findByIdAndVendorId(Long id, Long vendorId);
}
