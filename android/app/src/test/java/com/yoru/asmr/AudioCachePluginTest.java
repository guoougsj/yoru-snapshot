package com.yoru.asmr;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AudioCachePluginTest {

    @Test
    public void acceptsOfficialHttpsAudioUrls() {
        assertTrue(AudioCachePlugin.isAllowedDownloadUrl("https://kiko-play-niptan.one/audio.mp3"));
        assertTrue(
            AudioCachePlugin.isAllowedDownloadUrl(
                "https://raw.kiko-play-niptan.one/audio.mp3?signature=abc"
            )
        );
        assertTrue(
            AudioCachePlugin.isAllowedDownloadUrl(
                "https://cdn.nested.kiko-play-niptan.one:443/audio.mp3"
            )
        );
        assertTrue(
            AudioCachePlugin.isAllowedDownloadUrl(
                "HTTPS://RAW.KIKO-PLAY-NIPTAN.ONE/audio.mp3"
            )
        );
    }

    @Test
    public void rejectsUnofficialOrUnsafeUrls() {
        String[] rejected = {
            null,
            "",
            "http://raw.kiko-play-niptan.one/audio.mp3",
            "ftp://raw.kiko-play-niptan.one/audio.mp3",
            "https://user:password@raw.kiko-play-niptan.one/audio.mp3",
            "https://@raw.kiko-play-niptan.one/audio.mp3",
            "https://raw.kiko-play-niptan.one:444/audio.mp3",
            "https://raw.kiko-play-niptan.one:80/audio.mp3",
            "https://raw.kiko-play-niptan.one:/audio.mp3",
            "https://kiko-play-niptan.one.evil.example/audio.mp3",
            "https://evil-kiko-play-niptan.one/audio.mp3",
            "https://raw.kiko-play-niptan.one@evil.example/audio.mp3",
            "https://raw.kiko-play-niptan.one.evil.example/audio.mp3",
            "https://localhost/audio.mp3",
            "https:///audio.mp3",
            "//raw.kiko-play-niptan.one/audio.mp3",
            "not a URL",
        };
        for (String url : rejected) {
            assertFalse("Expected URL to be rejected: " + url, AudioCachePlugin.isAllowedDownloadUrl(url));
        }
    }
}
