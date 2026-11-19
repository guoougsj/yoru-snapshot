import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeTrack {
  id?: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface NativePlaybackState {
  active: boolean;
  playing: boolean;
  index: number;
  position: number;
  duration: number;
  queueId?: string;
  title?: string;
  artist?: string;
  album?: string;
}

interface NativeTimeEvent {
  position: number;
  duration: number;
}

interface NativeTrackEvent {
  index: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

interface NativeErrorEvent {
  message: string;
}

interface BackgroundAudioPlugin {
  play(options: {
    queueId: string;
    tracks: NativeTrack[];
    index: number;
    repeat: boolean;
    volume: number;
  }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  select(options: { index: number }): Promise<void>;
  /** Position is in milliseconds for the native bridge. */
  seek(options: { position: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setRepeat(options: { repeat: boolean }): Promise<void>;
  getState(): Promise<NativePlaybackState>;
  requestNotifications(): Promise<void>;
  addListener(
    eventName: "state",
    listener: (state: NativePlaybackState) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "time",
    listener: (time: NativeTimeEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "track",
    listener: (track: NativeTrackEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "ended",
    listener: (event: { index: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "error",
    listener: (event: NativeErrorEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>("BackgroundAudio");
let notificationsRequested = false;

export function isBackgroundAudioSupported(): boolean {
  return (
    Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("BackgroundAudio")
  );
}

export async function playNative(options: {
  queueId: string;
  tracks: NativeTrack[];
  index: number;
  repeat: boolean;
  volume: number;
}): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  if (!notificationsRequested) {
    notificationsRequested = true;
    void BackgroundAudio.requestNotifications().catch(() => {
      /* Playback still works; only the notification may be hidden. */
    });
  }
  await BackgroundAudio.play(options);
}

export async function pauseNative(): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.pause().catch(() => undefined);
}

export async function resumeNative(): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.resume().catch(() => undefined);
}

export async function stopNative(): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.stop().catch(() => undefined);
}

export async function nextNative(): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.next().catch(() => undefined);
}

export async function previousNative(): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.previous().catch(() => undefined);
}

export async function selectNative(index: number): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.select({ index }).catch(() => undefined);
}

export async function seekNative(seconds: number): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.seek({ position: Math.max(0, Math.round(seconds * 1000)) }).catch(
    () => undefined,
  );
}

export async function setNativeVolume(volume: number): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.setVolume({
    volume: Math.min(1, Math.max(0, volume)),
  }).catch(() => undefined);
}

export async function setNativeRepeat(repeat: boolean): Promise<void> {
  if (!isBackgroundAudioSupported()) return;
  await BackgroundAudio.setRepeat({ repeat }).catch(() => undefined);
}

export async function getNativeState(): Promise<NativePlaybackState | null> {
  if (!isBackgroundAudioSupported()) return null;
  try {
    return await BackgroundAudio.getState();
  } catch {
    return null;
  }
}

export function addNativeListener<T>(
  event: "state" | "time" | "track" | "ended" | "error",
  listener: (data: T) => void,
): Promise<{ remove: () => Promise<void> }> {
  // The Capacitor proxy exposes the same listener registration for all events.
  return (BackgroundAudio.addListener as unknown as (
    eventName: string,
    callback: (data: T) => void,
  ) => Promise<{ remove: () => Promise<void> }>)(event, listener);
}
