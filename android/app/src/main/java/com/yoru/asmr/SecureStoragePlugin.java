package com.yoru.asmr;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "yoru.secure-storage.aes-gcm";
    private static final String PREFERENCES = "yoru_secure_storage";
    private static final String ENTRY_PREFIX = "entry.";
    private static final String FORMAT_PREFIX = "v1:";
    private static final int FORMAT_VERSION = 1;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final Pattern KEY_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");
    private static final Object KEY_LOCK = new Object();

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (!isValidKey(key) || value == null) {
            call.reject("invalid secure storage arguments");
            return;
        }
        try {
            String encrypted = encrypt(value);
            if (!preferences().edit().putString(ENTRY_PREFIX + key, encrypted).commit()) {
                call.reject("secure storage write failed");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("secure storage encryption failed", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (!isValidKey(key)) {
            call.reject("invalid secure storage key");
            return;
        }
        String encrypted = preferences().getString(ENTRY_PREFIX + key, null);
        if (encrypted == null) {
            JSObject result = new JSObject();
            result.put("value", "");
            call.resolve(result);
            return;
        }
        try {
            JSObject result = new JSObject();
            result.put("value", decrypt(encrypted));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("secure storage decryption failed", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (!isValidKey(key)) {
            call.reject("invalid secure storage key");
            return;
        }
        if (!preferences().edit().remove(ENTRY_PREFIX + key).commit()) {
            call.reject("secure storage removal failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (!preferences().edit().clear().commit()) {
            call.reject("secure storage clear failed");
            return;
        }
        call.resolve();
    }

    static boolean isValidKey(String key) {
        return key != null && KEY_PATTERN.matcher(key).matches();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static SecretKey getOrCreateKey() throws GeneralSecurityException, IOException {
        synchronized (KEY_LOCK) {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                KeyGenerator generator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES,
                    KEYSTORE
                );
                generator.init(
                    new KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .setRandomizedEncryptionRequired(true)
                        .build()
                );
                generator.generateKey();
            }
            Key key = keyStore.getKey(KEY_ALIAS, null);
            if (!(key instanceof SecretKey)) {
                throw new GeneralSecurityException("secure storage key is not a secret key");
            }
            return (SecretKey) key;
        }
    }

    private static String encrypt(String value) throws GeneralSecurityException, IOException {
        byte[] iv = new byte[IV_BYTES];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_BITS, iv));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] payload = ByteBuffer.allocate(1 + IV_BYTES + encrypted.length)
            .put((byte) FORMAT_VERSION)
            .put(iv)
            .put(encrypted)
            .array();
        return FORMAT_PREFIX + Base64.encodeToString(payload, Base64.NO_WRAP);
    }

    private static String decrypt(String value) throws GeneralSecurityException, IOException {
        if (!value.startsWith(FORMAT_PREFIX)) {
            throw new GeneralSecurityException("unsupported secure storage format");
        }
        byte[] payload = Base64.decode(value.substring(FORMAT_PREFIX.length()), Base64.NO_WRAP);
        if (payload.length < 1 + IV_BYTES + TAG_BITS / 8 || payload[0] != FORMAT_VERSION) {
            throw new GeneralSecurityException("invalid secure storage payload");
        }
        byte[] iv = Arrays.copyOfRange(payload, 1, 1 + IV_BYTES);
        byte[] encrypted = Arrays.copyOfRange(payload, 1 + IV_BYTES, payload.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_BITS, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }
}
