package com.marketplace.common.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

// Encrypts a single field at rest (currently: vendor bank account numbers - see
// VendorPayoutAccount). AES/256-GCM, key from payout.encryption-key (base64, 32 raw bytes).
//
// Real, documented limitation: the key lives in application config (an env var), not a proper
// KMS/HSM. That's acceptable for a demo/pilot but is a genuine gap before real launch with real
// bank account numbers - see V14 migration comment and README "Before this is client-ready".
// Rotating this to AWS KMS/GCP KMS/Vault later only changes how the key bytes are obtained here,
// not the ciphertext format, so it's not a breaking schema change when that happens.
//
// @Converter(autoApply = false) - this must be applied explicitly with @Convert on the one field
// that needs it (VendorPayoutAccount.accountNumber), never globally, so it's obvious from
// reading the entity which field is encrypted.
@Converter
@Component
public class AesGcmStringConverter implements AttributeConverter<String, String> {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH_BYTES = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public AesGcmStringConverter(@Value("${payout.encryption-key}") String base64Key) {
        byte[] keyBytes = Base64.getDecoder().decode(base64Key);
        if (keyBytes.length != 32) {
            throw new IllegalStateException(
                    "payout.encryption-key must decode to exactly 32 bytes (AES-256) - got " + keyBytes.length
                            + ". Generate one with: openssl rand -base64 32");
        }
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    @Override
    public String convertToDatabaseColumn(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
            RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            // Store iv||ciphertext together, base64-encoded - the IV isn't secret, it just needs
            // to be unique per encryption and available again at decrypt time.
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt field", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String stored) {
        if (stored == null) return null;
        try {
            byte[] combined = Base64.getDecoder().decode(stored);
            byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
            byte[] ciphertext = new byte[combined.length - GCM_IV_LENGTH_BYTES];
            System.arraycopy(combined, 0, iv, 0, iv.length);
            System.arraycopy(combined, iv.length, ciphertext, 0, ciphertext.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt field - wrong key or corrupted data", e);
        }
    }
}
