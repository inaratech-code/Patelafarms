/** Farm health dose alert tone (WAV, ~2.5s four-note ascending chime). */
export const FARM_HEALTH_ALERT_SOUND_PATH = "/sounds/farm-health-alert.wav";

/** Strong vibration pattern when the device supports it (Android PWA). */
export const FARM_HEALTH_ALERT_VIBRATE: number[] = [400, 120, 400, 120, 500, 120, 600];

export const PLAY_FARM_HEALTH_SOUND_MESSAGE = "pf.playFarmHealthSound";

export function isFarmHealthNotificationAlert(tag: string, url?: string): boolean {
  if (tag.startsWith("dose:")) return true;
  if (url?.startsWith("/farm-health")) return true;
  return false;
}

/** Resolve sound URL for Notification API (absolute URL when in a document). */
export function resolveNotificationSoundUrl(path: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return path;
  try {
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

export function farmHealthNotificationSound(origin?: string): string {
  return resolveNotificationSoundUrl(FARM_HEALTH_ALERT_SOUND_PATH, origin);
}

let alertAudio: HTMLAudioElement | null = null;

function getAlertAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!alertAudio) {
    alertAudio = new Audio(FARM_HEALTH_ALERT_SOUND_PATH);
    alertAudio.preload = "auto";
  }
  return alertAudio;
}

/**
 * Unlock in-page playback (required on iOS / Safari after a user gesture).
 * Call from Settings when enabling notifications or granting permission.
 */
export async function primeFarmHealthAlertSound(): Promise<boolean> {
  const audio = getAlertAudio();
  if (!audio) return false;
  audio.volume = 1;
  const prevMuted = audio.muted;
  audio.muted = true;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    return true;
  } catch {
    return false;
  } finally {
    audio.muted = prevMuted;
  }
}

/** Play the farm health tone in the page (iOS, desktop web, foreground PWA). */
export async function playFarmHealthAlertSound(): Promise<void> {
  const audio = getAlertAudio();
  if (!audio) return;
  audio.muted = false;
  audio.volume = 1;
  audio.currentTime = 0;
  try {
    await audio.play();
  } catch {
    /* Autoplay blocked until primeFarmHealthAlertSound runs from a tap */
  }
}

export function farmHealthNotificationExtras(origin?: string): {
  sound: string;
  vibrate: number[];
} {
  return {
    sound: farmHealthNotificationSound(origin),
    vibrate: [...FARM_HEALTH_ALERT_VIBRATE],
  };
}
