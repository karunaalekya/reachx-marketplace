package com.marketplace.catalog.storage;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URI;
import java.time.Duration;

// Works against any S3-API-compatible endpoint - real AWS S3, Cloudinary's S3-compatible
// endpoint, or Supabase Storage's S3-compatible endpoint - purely via the `storage.endpoint`
// config value. Leave storage.endpoint unset for real AWS S3; set it for the others.
@Service
@Slf4j
public class S3StorageService implements StorageService {

    private final S3Presigner presigner;
    private final S3Client s3Client;
    private final String bucket;
    private final String publicBaseUrl;
    private final long presignExpirySeconds;

    public S3StorageService(
            @Value("${storage.endpoint:}") String endpoint,
            @Value("${storage.region:ap-south-1}") String region,
            @Value("${storage.access-key}") String accessKey,
            @Value("${storage.secret-key}") String secretKey,
            @Value("${storage.bucket}") String bucket,
            @Value("${storage.public-base-url}") String publicBaseUrl,
            @Value("${storage.presign-expiry-seconds:300}") long presignExpirySeconds) {

        this.bucket = bucket;
        this.publicBaseUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        this.presignExpirySeconds = presignExpirySeconds;

        var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey));

        var presignerBuilder = S3Presigner.builder()
                .region(Region.of(region))
                .credentialsProvider(credentials);
        var clientBuilder = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(credentials);

        // Only real AWS S3 leaves this blank. Cloudinary/Supabase/MinIO/any other S3-compatible
        // provider needs their endpoint here - path-style access is required for most non-AWS
        // S3-compatible providers (virtual-hosted-style bucket subdomains often don't resolve for them).
        if (endpoint != null && !endpoint.isBlank()) {
            presignerBuilder.endpointOverride(URI.create(endpoint));
            clientBuilder.endpointOverride(URI.create(endpoint));
            clientBuilder.forcePathStyle(true);
        }

        this.presigner = presignerBuilder.build();
        this.s3Client = clientBuilder.build();
    }

    @Override
    public PresignedUpload createPresignedUpload(String objectKey, String contentType) {
        PutObjectRequest putRequest = PutObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .contentType(contentType)
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(presignExpirySeconds))
                .putObjectRequest(putRequest)
                .build();

        PresignedPutObjectRequest presigned = presigner.presignPutObject(presignRequest);
        String publicUrl = publicBaseUrl + "/" + objectKey;

        log.info("Presigned upload created: key={} expiresInSeconds={}", objectKey, presignExpirySeconds);

        return new PresignedUpload(presigned.url().toString(), publicUrl, objectKey, presignExpirySeconds);
    }

    @Override
    public String publicUrlFor(String objectKey) {
        return publicBaseUrl + "/" + objectKey;
    }

    @Override
    public void putObject(String objectKey, byte[] content, String contentType) {
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(objectKey)
                        .contentType(contentType)
                        .build(),
                software.amazon.awssdk.core.sync.RequestBody.fromBytes(content));
        log.info("Uploaded object directly: key={} bytes={}", objectKey, content.length);
    }

    @Override
    public void deleteObject(String objectKey) {
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .build());
        log.info("Deleted storage object: key={}", objectKey);
    }
}
