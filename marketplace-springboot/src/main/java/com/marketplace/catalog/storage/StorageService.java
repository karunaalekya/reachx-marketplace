package com.marketplace.catalog.storage;

// Abstraction over the presigned-upload pattern so ProductImageService doesn't depend on a
// specific provider's SDK. The S3 API is the de facto standard here - AWS S3, Cloudinary
// (via its S3-compatible endpoint), and Supabase Storage all speak it, so one implementation
// covers all three; swapping providers is a config change (endpoint/credentials), not a code change.
public interface StorageService {

    // Generates a short-lived, single-object presigned PUT URL the client uploads directly to.
    // Returns both the upload URL (write-only, expires) and the final public read URL (permanent,
    // for storing in the DB) plus the object key (needed later for delete).
    PresignedUpload createPresignedUpload(String objectKey, String contentType);

    void deleteObject(String objectKey);

    // Direct server-side upload, distinct from the presigned-upload flow above. Product images
    // are uploaded by the client's browser (binary never touches this app); GST invoice PDFs are
    // generated server-side by this app, so they need a normal put, not a presigned URL for a
    // client to use.
    void putObject(String objectKey, byte[] content, String contentType);

    // Derives the public URL for a key using the same base-URL config as presigning - lets the
    // confirm-upload step trust only the objectKey it itself issued, never a client-supplied URL.
    String publicUrlFor(String objectKey);

    record PresignedUpload(String uploadUrl, String publicUrl, String objectKey, long expiresInSeconds) {}
}
