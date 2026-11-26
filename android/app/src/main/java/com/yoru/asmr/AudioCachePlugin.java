package com.yoru.asmr;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Iterator;
import java.util.Locale;

/**
 * Small Java-only audio cache. Keeping this in the app avoids a Kotlin
 * dependency in the Android build while still giving the WebView a real
 * app-private file cache for user-initiated offline listening.
 */
@CapacitorPlugin(name = "AudioCache")
public class AudioCachePlugin extends Plugin {

    private static final String ROOT = "yoru-audio";
    private static final String OFFICIAL_AUDIO_SUFFIX = ".kiko-play-niptan.one";
    private static final String OFFICIAL_AUDIO_HOST = "kiko-play-niptan.one";
    private static final int MAX_REDIRECTS = 5;
    private static final long MAX_DOWNLOAD_BYTES = 2L * 1024 * 1024 * 1024;

    static boolean isAllowedDownloadUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) return false;
        try {
            URI uri = new URI(rawUrl);
            if (
                uri.isOpaque() ||
                !"https".equalsIgnoreCase(uri.getScheme()) ||
                uri.getRawUserInfo() != null
            ) {
                return false;
            }
            String host = uri.getHost();
            if (host == null) return false;
            int port = uri.getPort();
            if (port != -1 && port != 443) return false;
            String authority = uri.getRawAuthority();
            if (authority != null && authority.endsWith(":")) return false;
            host = host.toLowerCase(Locale.ROOT);
            return host.equals(OFFICIAL_AUDIO_HOST) || host.endsWith(OFFICIAL_AUDIO_SUFFIX);
        } catch (Exception error) {
            return false;
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String workId = call.getString("workId");
        final String fileName = call.getString("fileName");
        final JSObject headers = call.getObject("headers");

        if (url == null || url.isEmpty() || workId == null || fileName == null) {
            call.reject("missing download arguments");
            return;
        }
        if (!isAllowedDownloadUrl(url)) {
            call.reject("download URL is not allowed");
            return;
        }

        new Thread(() -> {
            File dir = new File(getContext().getFilesDir(), ROOT + "/" + safeName(workId));
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("could not create cache directory");
                return;
            }

            File target = new File(dir, safeName(fileName));
            File temp = new File(dir, target.getName() + ".part");

            try {
                URL currentUrl = new URL(url);
                for (int redirects = 0; ; redirects += 1) {
                    if (!isAllowedDownloadUrl(currentUrl.toString())) {
                        throw new IOException("redirect URL is not allowed");
                    }
                    HttpURLConnection connection = (HttpURLConnection) currentUrl.openConnection();
                    try {
                        connection.setConnectTimeout(30_000);
                        connection.setReadTimeout(60_000);
                        connection.setInstanceFollowRedirects(false);
                        connection.setRequestProperty("Accept-Encoding", "identity");
                        connection.setRequestProperty(
                            "User-Agent",
                            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36"
                        );
                        applyHeaders(connection, headers);

                        int status = connection.getResponseCode();
                        if (isRedirect(status)) {
                            if (redirects >= MAX_REDIRECTS) {
                                throw new IOException("too many download redirects");
                            }
                            String location = connection.getHeaderField("Location");
                            if (location == null || location.trim().isEmpty()) {
                                throw new IOException("missing download redirect location");
                            }
                            URL nextUrl = new URL(currentUrl, location);
                            if (!isAllowedDownloadUrl(nextUrl.toString())) {
                                throw new IOException("redirect URL is not allowed");
                            }
                            currentUrl = nextUrl;
                            continue;
                        }
                        if (status < 200 || status >= 300) {
                            throw new IOException("HTTP " + status);
                        }

                        long total = connection.getContentLengthLong();
                        if (total > MAX_DOWNLOAD_BYTES) {
                            throw new IOException("audio file exceeds 2 GiB limit");
                        }
                        long received = 0;
                        long lastProgress = 0;

                        try (
                            InputStream input = connection.getInputStream();
                            FileOutputStream output = new FileOutputStream(temp)
                        ) {
                            byte[] buffer = new byte[64 * 1024];
                            int read;
                            while ((read = input.read(buffer)) != -1) {
                                if (read > MAX_DOWNLOAD_BYTES - received) {
                                    throw new IOException("audio file exceeds 2 GiB limit");
                                }
                                output.write(buffer, 0, read);
                                received += read;
                                long now = System.currentTimeMillis();
                                if (now - lastProgress > 400) {
                                    final JSObject progress = new JSObject();
                                    progress.put("url", url);
                                    progress.put("bytes", received);
                                    progress.put("contentLength", total);
                                    if (getActivity() != null) {
                                        getActivity().runOnUiThread(
                                            () -> notifyListeners("progress", progress)
                                        );
                                    }
                                    lastProgress = now;
                                }
                            }
                        }

                        if (target.exists() && !target.delete()) {
                            throw new IOException("could not replace existing cache file");
                        }
                        if (!temp.renameTo(target)) {
                            throw new IOException("could not finalize cache file");
                        }

                        JSObject result = new JSObject();
                        result.put("path", target.getAbsolutePath());
                        result.put("size", target.length());
                        call.resolve(result);
                        return;
                    } finally {
                        connection.disconnect();
                    }
                }
            } catch (Exception error) {
                //noinspection ResultOfMethodCallIgnored
                temp.delete();
                call.reject(error.getMessage(), error);
            }
        }).start();
    }

    private static boolean isRedirect(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM ||
            status == HttpURLConnection.HTTP_MOVED_TEMP ||
            status == HttpURLConnection.HTTP_SEE_OTHER ||
            status == 307 ||
            status == 308;
    }

    private static void applyHeaders(HttpURLConnection connection, JSObject headers) throws IOException {
        if (headers == null) return;
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String normalized = key.toLowerCase(Locale.ROOT);
            if (
                !normalized.equals("accept") &&
                !normalized.equals("accept-language") &&
                !normalized.equals("origin") &&
                !normalized.equals("referer")
            ) {
                continue;
            }
            String value = headers.getString(key);
            if (value == null) continue;
            if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
                throw new IOException("invalid download header value");
            }
            connection.setRequestProperty(key, value);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("missing path");
            return;
        }
        File file = new File(path);
        if (!isInsideCache(file)) {
            call.reject("refusing to delete outside the cache directory");
            return;
        }
        if (file.exists() && !file.delete()) {
            call.reject("could not delete cache file");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        File root = new File(getContext().getFilesDir(), ROOT);
        deleteRecursive(root);
        call.resolve();
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            call.resolve();
            getActivity().finish();
        });
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    private boolean isInsideCache(File file) {
        try {
            File root = new File(getContext().getFilesDir(), ROOT).getCanonicalFile();
            return file.getCanonicalPath().startsWith(root.getAbsolutePath() + File.separator);
        } catch (Exception error) {
            return false;
        }
    }

    private void deleteRecursive(File file) {
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursive(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static String safeName(String value) {
        String safe = value.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safe.equals(".") || safe.equals("..")) return "track";
        if (safe.length() > 100) safe = safe.substring(0, 100);
        return safe.isEmpty() ? "track" : safe;
    }
}
