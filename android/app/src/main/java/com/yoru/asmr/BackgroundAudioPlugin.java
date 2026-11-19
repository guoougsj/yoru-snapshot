package com.yoru.asmr;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundAudio",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class BackgroundAudioPlugin extends Plugin {

    private final PlaybackService.Listener playbackListener = new PlaybackService.Listener() {
        @Override
        public void onState(boolean active, boolean playing, int index, long positionMs, long durationMs, String queueId) {
            JSObject data = new JSObject();
            data.put("active", active);
            data.put("playing", playing);
            data.put("index", index);
            data.put("position", positionMs / 1000.0);
            data.put("duration", durationMs / 1000.0);
            data.put("queueId", queueId);
            notifyListeners("state", data);
        }

        @Override
        public void onTime(long positionMs, long durationMs) {
            JSObject data = new JSObject();
            data.put("position", positionMs / 1000.0);
            data.put("duration", durationMs / 1000.0);
            notifyListeners("time", data);
        }

        @Override
        public void onTrack(int index, String title, String artist, String album, long durationMs) {
            JSObject data = new JSObject();
            data.put("index", index);
            data.put("title", title);
            data.put("artist", artist);
            data.put("album", album);
            data.put("duration", durationMs / 1000.0);
            notifyListeners("track", data);
        }

        @Override
        public void onEnded(int index) {
            JSObject data = new JSObject();
            data.put("index", index);
            notifyListeners("ended", data);
        }

        @Override
        public void onError(String message) {
            JSObject data = new JSObject();
            data.put("message", message);
            notifyListeners("error", data);
        }
    };

    @Override
    public void load() {
        PlaybackService.setListener(playbackListener);
    }

    @Override
    protected void handleOnDestroy() {
        PlaybackService.setListener(null);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsCallback");
        } else {
            call.resolve();
        }
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        JSArray tracks = call.getArray("tracks");
        if (tracks == null || tracks.length() == 0) {
            call.reject("播放队列为空");
            return;
        }

        Intent intent = new Intent(getContext(), PlaybackService.class);
        intent.setAction(PlaybackService.ACTION_PLAY);
        intent.putExtra("queueId", call.getString("queueId", ""));
        intent.putExtra("tracks", tracks.toString());
        intent.putExtra("index", call.getInt("index", 0));
        intent.putExtra("repeat", Boolean.TRUE.equals(call.getBoolean("repeat", false)));
        intent.putExtra("volume", call.getFloat("volume", 0.7f));

        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        dispatchIfRunning(PlaybackService.ACTION_PAUSE, null);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        dispatchIfRunning(PlaybackService.ACTION_RESUME, null);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        dispatchIfRunning(PlaybackService.ACTION_STOP, null);
        call.resolve();
    }

    @PluginMethod
    public void next(PluginCall call) {
        dispatchIfRunning(PlaybackService.ACTION_NEXT, null);
        call.resolve();
    }

    @PluginMethod
    public void previous(PluginCall call) {
        dispatchIfRunning(PlaybackService.ACTION_PREV, null);
        call.resolve();
    }

    @PluginMethod
    public void select(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("index", call.getInt("index", 0));
        dispatchIfRunning(PlaybackService.ACTION_SELECT, intent);
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("position", Math.max(0L, call.getLong("position", 0L)));
        dispatchIfRunning(PlaybackService.ACTION_SEEK, intent);
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("volume", call.getFloat("volume", 0.7f));
        dispatchIfRunning(PlaybackService.ACTION_SET_VOLUME, intent);
        call.resolve();
    }

    @PluginMethod
    public void setRepeat(PluginCall call) {
        Intent intent = new Intent();
        intent.putExtra("repeat", Boolean.TRUE.equals(call.getBoolean("repeat", false)));
        dispatchIfRunning(PlaybackService.ACTION_SET_REPEAT, intent);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        try {
            call.resolve(new JSObject(PlaybackService.getStateJson().toString()));
        } catch (Exception error) {
            call.resolve(new JSObject());
        }
    }

    private void dispatchIfRunning(String action, Intent intent) {
        if (!PlaybackService.isRunning()) return;
        Intent serviceIntent = intent == null ? new Intent() : intent;
        serviceIntent.setClass(getContext(), PlaybackService.class);
        serviceIntent.setAction(action);
        try {
            getContext().startService(serviceIntent);
        } catch (Exception error) {
            // The service can disappear between isRunning and startService.
        }
    }
}
