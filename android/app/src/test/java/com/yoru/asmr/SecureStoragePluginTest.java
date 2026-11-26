package com.yoru.asmr;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SecureStoragePluginTest {

    @Test
    public void acceptsBoundedStorageKeys() {
        assertTrue(SecureStoragePlugin.isValidKey("yoru.asmr-daily-token"));
        assertTrue(SecureStoragePlugin.isValidKey("Key_1.with-dashes"));
        assertTrue(SecureStoragePlugin.isValidKey(repeat("a", 128)));
    }

    @Test
    public void rejectsUnsafeStorageKeys() {
        String[] rejected = {
            null,
            "",
            ".hidden",
            "../token",
            "token/key",
            "token\\key",
            "token key",
            "token:key",
            "token\n",
            repeat("a", 129),
        };
        for (String key : rejected) {
            assertFalse("Expected key to be rejected: " + key, SecureStoragePlugin.isValidKey(key));
        }
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < count; index += 1) result.append(value);
        return result.toString();
    }
}
