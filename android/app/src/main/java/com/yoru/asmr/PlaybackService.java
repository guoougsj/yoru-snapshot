package com.yoru.asmr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.content.ContextCompat;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Foreground media service so playback keeps running while the WebView is
 * backgrounded or the screen is off. The React UI is the remote control.
 */
public class PlaybackService extends Service {

    public static final String ACTION_PLAY = "com.yoru.asmr.action.PLAY";
    public static final String ACTION_PAUSE = "com.yoru.asmr.action.PAUSE";
    public static final String ACTION_RESUME = "com.yoru.asmr.action.RESUME";
    public static final String ACTION_STOP = "com.yoru.asmr.action.STOP";
    public static final String ACTION_NEXT = "com.yoru.asmr.action.NEXT";
    public static final String ACTION_PREV = "com.yoru.asmr.action.PREV";
    public static final String ACTION_SELECT = "com.yoru.asmr.action.SELECT";
    public static final String ACTION_SEEK = "com.yoru.asmr.action.SEEK";
    public static final String ACTION_SET_VOLUME = "com.yoru.asmr.action.SET_VOLUME";
    public static final String ACTION_SET_REPEAT = "com.yoru.asmr.action.SET_REPEAT";

    private static final String CHANNEL_ID = "yoru_playback";
    private static final int NOTIFICATION_ID = 8801;
    private static PlaybackService instance;
    private static Listener listener;

    public interface Listener {
        void onState(boolean active, boolean playing, int index, long positionMs, long durationMs, String queueId);
        void onTime(long positionMs, long durationMs);
        void onTrack(int index, String title, String artist, String album, long durationMs);
        void onEnded(int index);
        void onError(String message);
    }

    public static void setListener(Listener value) {
        listener = value;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    public static JSONObject getStateJson() {
        PlaybackService service = instance;
        if (service == null) {
            JSONObject idle = new JSONObject();
            try {
                idle.put("active", false);
                idle.put("playing", false);
                idle.put("index", -1);
                idle.put("position", 0);
                idle.put("duration", 0);
            } catch (Exception ignored) {
                // JSONObject.put only throws for invalid keys.
            }
            return idle;
        }
        return service.currentStateJson();
    }

    private MediaPlayer player;
    private MediaSession mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private WifiManager.WifiLock wifiLock;
    private Handler handler;
    private Runnable ticker;
    private JSONArray queue;
    private String queueId = "";
    private int index = 0;
    private boolean playing = false;
    private boolean repeat = false;
    private boolean resumeOnFocus = false;
    private boolean foregroundStarted = false;
    private long durationMs = 0;
    private float volume = 0.7f;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS ||
            focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (playing) {
                resumeOnFocus = true;
                pause();
            }
        } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            if (player != null) player.setVolume(volume * 0.25f, volume * 0.25f);
        } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
            if (player != null) player.setVolume(volume, volume);
            if (resumeOnFocus) {
                resumeOnFocus = false;
                resume();
            }
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                pause();
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
        createMediaSession();
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wifiManager != null) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "YORU:playback");
            wifiLock.setReferenceCounted(false);
        }
        IntentFilter noisyFilter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        ContextCompat.registerReceiver(this, noisyReceiver, noisyFilter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_NOT_STICKY;
        String action = intent.getAction();

        if (ACTION_PLAY.equals(action)) {
            ensureForeground(buildNotification());
            handlePlay(intent);
        } else if (ACTION_PAUSE.equals(action)) {
            pause();
        } else if (ACTION_RESUME.equals(action)) {
            resume();
        } else if (ACTION_STOP.equals(action)) {
            stopPlayback();
        } else if (ACTION_NEXT.equals(action)) {
            next();
        } else if (ACTION_PREV.equals(action)) {
            previous();
        } else if (ACTION_SELECT.equals(action)) {
            playIndex(intent.getIntExtra("index", 0));
        } else if (ACTION_SEEK.equals(action)) {
            seekTo(intent.getLongExtra("position", 0));
        } else if (ACTION_SET_VOLUME.equals(action)) {
            volume = Math.max(0f, Math.min(1f, intent.getFloatExtra("volume", volume)));
            if (player != null) player.setVolume(volume, volume);
        } else if (ACTION_SET_REPEAT.equals(action)) {
            repeat = intent.getBooleanExtra("repeat", false);
            if (player != null) player.setLooping(repeat);
        }

        return START_NOT_STICKY;
    }

    private void handlePlay(Intent intent) {
        String requestedQueueId = intent.getStringExtra("queueId");
        String tracksJson = intent.getStringExtra("tracks");
        int requestedIndex = intent.getIntExtra("index", 0);
        repeat = intent.getBooleanExtra("repeat", false);
        volume = Math.max(0f, Math.min(1f, intent.getFloatExtra("volume", volume)));

        if (requestedQueueId == null) requestedQueueId = "";
        boolean sameQueue = requestedQueueId.equals(queueId) && player != null && queue != null;

        if (sameQueue) {
            if (player != null) {
                player.setLooping(repeat);
                player.setVolume(volume, volume);
            }
            resume();
            return;
        }

        queueId = requestedQueueId;
        try {
            queue = tracksJson == null ? null : new JSONArray(tracksJson);
        } catch (Exception error) {
            queue = null;
        }
        if (queue == null || queue.length() == 0) {
            sendError("播放队列为空");
            stopPlayback();
            return;
        }
        playIndex(requestedIndex);
    }

    private void playIndex(int requestedIndex) {
        if (queue == null || queue.length() == 0) return;
        index = Math.max(0, Math.min(queue.length() - 1, requestedIndex));
        releasePlayer();

        JSONObject track = queue.optJSONObject(index);
        if (track == null) {
            sendError("音轨数据无效");
            return;
        }
        String url = track.optString("url");
        if (url.isEmpty()) {
            sendError("音轨地址为空");
            return;
        }

        durationMs = 0;
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            );
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            player.setVolume(volume, volume);
            player.setLooping(repeat);

            if (url.startsWith("file://")) {
                player.setDataSource(this, Uri.parse(url));
            } else {
                Map<String, String> headers = new HashMap<>();
                headers.put("Origin", "https://asmr.one");
                headers.put("Referer", "https://asmr.one/");
                player.setDataSource(this, Uri.parse(url), headers);
            }

            player.setOnPreparedListener(mediaPlayer -> {
                long reportedDuration = mediaPlayer.getDuration();
                if (reportedDuration <= 0) {
                    JSONObject current = currentTrack();
                    reportedDuration = current == null
                        ? 0
                        : (long) (current.optDouble("duration", 0) * 1000);
                }
                durationMs = Math.max(0, reportedDuration);
                sendTrack();
                mediaPlayer.start();
                playing = true;
                resumeOnFocus = false;
                requestAudioFocus();
                acquireWifiLock();
                mediaSession.setActive(true);
                updatePlaybackState();
                updateNotification();
                startTicker();
                sendState();
            });
            player.setOnCompletionListener(mediaPlayer -> {
                if (repeat) {
                    mediaPlayer.seekTo(0);
                    mediaPlayer.start();
                    return;
                }
                if (queue != null && index + 1 < queue.length()) {
                    playIndex(index + 1);
                    return;
                }
                playing = false;
                sendState();
                sendEnded();
                stopTicker();
                releaseWifiLock();
                updatePlaybackState();
                updateNotification();
            });
            player.setOnErrorListener((mediaPlayer, what, extra) -> {
                playing = false;
                sendError("MediaPlayer 错误 " + what + "/" + extra);
                sendState();
                updatePlaybackState();
                updateNotification();
                return true;
            });
            player.prepareAsync();
            sendTrack();
            sendState();
        } catch (Exception error) {
            sendError(error.getMessage() == null ? "无法打开音轨" : error.getMessage());
            releasePlayer();
            sendState();
        }
    }

    private void start() {
        if (player == null) {
            if (queue != null && queue.length() > 0) playIndex(index);
            return;
        }
        try {
            if (durationMs > 0 && player.getCurrentPosition() >= durationMs - 1000) {
                player.seekTo(0);
            }
            player.start();
            playing = true;
            resumeOnFocus = false;
            requestAudioFocus();
            acquireWifiLock();
            mediaSession.setActive(true);
            updatePlaybackState();
            updateNotification();
            startTicker();
            sendState();
        } catch (Exception error) {
            sendError(error.getMessage() == null ? "无法继续播放" : error.getMessage());
        }
    }

    private void pause() {
        if (player != null && playing) {
            try {
                player.pause();
            } catch (Exception ignored) {
                // The player may have been released while the intent was queued.
            }
        }
        playing = false;
        resumeOnFocus = false;
        stopTicker();
        releaseWifiLock();
        updatePlaybackState();
        updateNotification();
        sendState();
    }

    private void resume() {
        start();
    }

    private void next() {
        if (queue == null || queue.length() == 0) return;
        if (index + 1 < queue.length()) {
            playIndex(index + 1);
        } else {
            playing = false;
            sendState();
            sendEnded();
            updatePlaybackState();
            updateNotification();
        }
    }

    private void previous() {
        if (player != null && player.getCurrentPosition() > 3000) {
            seekTo(0);
            return;
        }
        if (queue != null && index > 0) {
            playIndex(index - 1);
        } else {
            seekTo(0);
        }
    }

    private void seekTo(long positionMs) {
        if (player == null) return;
        try {
            player.seekTo((int) Math.max(0, positionMs));
            sendTime(player.getCurrentPosition(), durationMs);
            updatePlaybackState();
        } catch (Exception ignored) {
            // Ignore seeks after the player was released.
        }
    }

    private void stopPlayback() {
        playing = false;
        releasePlayer();
        stopTicker();
        releaseWifiLock();
        abandonAudioFocus();
        queue = null;
        queueId = "";
        index = 0;
        durationMs = 0;
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.setPlaybackState(
                new PlaybackState.Builder()
                    .setState(PlaybackState.STATE_STOPPED, 0, 0f)
                    .build()
            );
        }
        sendState();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void releasePlayer() {
        if (player == null) return;
        try {
            player.reset();
        } catch (Exception ignored) {
            // Reset is best-effort.
        }
        try {
            player.release();
        } catch (Exception ignored) {
            // Release is best-effort.
        }
        player = null;
        playing = false;
        durationMs = 0;
    }

    private void ensureForeground(Notification notification) {
        if (foregroundStarted) {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(NOTIFICATION_ID, notification);
            return;
        }
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        foregroundStarted = true;
    }

    private void updateNotification() {
        Notification notification = buildNotification();
        if (!foregroundStarted) {
            ensureForeground(notification);
            return;
        }
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification);
    }

    private Notification buildNotification() {
        String title = "YORU 夜音";
        String artist = "准备播放";
        String album = "";
        JSONObject track = currentTrack();
        if (track != null) {
            title = track.optString("title", title);
            artist = track.optString("artist", artist);
            album = track.optString("album", "");
        }

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPending = PendingIntent.getActivity(
            this,
            0,
            contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent prevPending = servicePending(ACTION_PREV, 1);
        PendingIntent togglePending = servicePending(playing ? ACTION_PAUSE : ACTION_RESUME, 2);
        PendingIntent nextPending = servicePending(ACTION_NEXT, 3);
        PendingIntent stopPending = servicePending(ACTION_STOP, 4);

        Notification.Action prevAction = new Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_media_previous),
            "上一段",
            prevPending
        ).build();
        Notification.Action toggleAction = new Notification.Action.Builder(
            Icon.createWithResource(
                this,
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play
            ),
            playing ? "暂停" : "播放",
            togglePending
        ).build();
        Notification.Action nextAction = new Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_media_next),
            "下一段",
            nextPending
        ).build();
        Notification.Action stopAction = new Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
            "停止",
            stopPending
        ).build();

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText(album)
            .setContentIntent(contentPending)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setStyle(
                new Notification.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .addAction(prevAction)
            .addAction(toggleAction)
            .addAction(nextAction)
            .addAction(stopAction)
            .build();
    }

    private PendingIntent servicePending(String action, int requestCode) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "YORU 播放",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("后台 ASMR 播放");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private void createMediaSession() {
        mediaSession = new MediaSession(this, "YORU");
        mediaSession.setFlags(
            MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                resume();
            }

            @Override
            public void onPause() {
                pause();
            }

            @Override
            public void onStop() {
                stopPlayback();
            }

            @Override
            public void onSkipToNext() {
                next();
            }

            @Override
            public void onSkipToPrevious() {
                previous();
            }

            @Override
            public void onSeekTo(long pos) {
                seekTo(pos);
            }
        });
        mediaSession.setActive(true);
    }

    private void updatePlaybackState() {
        if (mediaSession == null) return;
        long position = player == null ? 0 : player.getCurrentPosition();
        int state = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        if (player == null) state = PlaybackState.STATE_STOPPED;
        mediaSession.setPlaybackState(
            new PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY |
                    PlaybackState.ACTION_PAUSE |
                    PlaybackState.ACTION_PLAY_PAUSE |
                    PlaybackState.ACTION_STOP |
                    PlaybackState.ACTION_SKIP_TO_NEXT |
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                    PlaybackState.ACTION_SEEK_TO
                )
                .setState(state, position, playing ? 1f : 0f)
                .build()
        );
        JSONObject track = currentTrack();
        if (track != null) {
            MediaMetadata metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, track.optString("title"))
                .putString(MediaMetadata.METADATA_KEY_ARTIST, track.optString("artist"))
                .putString(MediaMetadata.METADATA_KEY_ALBUM, track.optString("album"))
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                .build();
            mediaSession.setMetadata(metadata);
        }
    }

    private JSONObject currentTrack() {
        if (queue == null || index < 0 || index >= queue.length()) return null;
        return queue.optJSONObject(index);
    }

    private void startTicker() {
        stopTicker();
        ticker = new Runnable() {
            @Override
            public void run() {
                if (player == null || !playing) return;
                long position = player.getCurrentPosition();
                sendTime(position, durationMs);
                updatePlaybackState();
                handler.postDelayed(this, 500);
            }
        };
        handler.post(ticker);
    }

    private void stopTicker() {
        if (ticker != null) {
            handler.removeCallbacks(ticker);
            ticker = null;
        }
    }

    private void requestAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    .setOnAudioFocusChangeListener(focusListener)
                    .setWillPauseWhenDucked(true)
                    .build();
            }
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(
                focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
    }

    private void acquireWifiLock() {
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    }

    private void releaseWifiLock() {
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    private JSONObject currentStateJson() {
        JSONObject data = new JSONObject();
        try {
            JSONObject track = currentTrack();
            data.put("active", true);
            data.put("playing", playing);
            data.put("index", index);
            data.put("position", (player == null ? 0 : player.getCurrentPosition()) / 1000.0);
            data.put("duration", durationMs / 1000.0);
            data.put("queueId", queueId);
            if (track != null) {
                data.put("title", track.optString("title"));
                data.put("artist", track.optString("artist"));
                data.put("album", track.optString("album"));
            }
        } catch (Exception ignored) {
            // The caller still gets a valid JSON object.
        }
        return data;
    }

    private void sendState() {
        if (listener == null) return;
        long position = player == null ? 0 : player.getCurrentPosition();
        listener.onState(true, playing, index, position, durationMs, queueId);
    }

    private void sendTrack() {
        if (listener == null) return;
        JSONObject track = currentTrack();
        if (track == null) return;
        listener.onTrack(
            index,
            track.optString("title"),
            track.optString("artist"),
            track.optString("album"),
            durationMs
        );
    }

    private void sendTime(long position, long duration) {
        if (listener != null) listener.onTime(position, duration);
    }

    private void sendEnded() {
        if (listener != null) listener.onEnded(index);
    }

    private void sendError(String message) {
        if (listener != null) listener.onError(message == null ? "播放失败" : message);
    }

    @Override
    public void onDestroy() {
        stopTicker();
        releasePlayer();
        releaseWifiLock();
        abandonAudioFocus();
        try {
            unregisterReceiver(noisyReceiver);
        } catch (Exception ignored) {
            // The receiver may already be unregistered.
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
