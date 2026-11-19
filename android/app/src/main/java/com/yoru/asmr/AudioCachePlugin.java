package com.yoru.asmr;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

/**
 * Small Java-only audio cache. Keeping this in the app avoids a Kotlin
 * dependency in the Android build while still giving the WebView a real
 * app-private file cache for user-initiated offline listening.
 */
@CapacitorPlugin(name = "AudioCache")
public class AudioCachePlugin extends Plugin {

    private static final String ROOT = "yoru-audio";

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

        new Thread(() -> {
            File dir = new File(getContext().getFilesDir(), ROOT + "/" + safeName(workId));
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("could not create cache directory");
                return;
            }

            File target = new File(dir, safeName(fileName));
            File temp = new File(dir, target.getName() + ".part");
            HttpURLConnection connection = null;

            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(30_000);
                connection.setReadTimeout(60_000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36"
                );
                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        connection.setRequestProperty(key, headers.getString(key));
                    }
                }

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("HTTP " + status);
                    return;
                }

                long total = connection.getContentLengthLong();
                long received = 0;
                long lastProgress = 0;

                try (
                    InputStream input = connection.getInputStream();
                    FileOutputStream output = new FileOutputStream(temp)
                ) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
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
                    call.reject("could not replace existing cache file");
                    return;
                }
                if (!temp.renameTo(target)) {
                    call.reject("could not finalize cache file");
                    return;
                }

                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("size", target.length());
                call.resolve(result);
            } catch (Exception error) {
                //noinspection ResultOfMethodCallIgnored
                temp.delete();
                call.reject(error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
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
        if (safe.length() > 100) safe = safe.substring(0, 100);
        return safe.isEmpty() ? "track" : safe;
    }
}
