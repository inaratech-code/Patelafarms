import {
  BROADCAST_FARM_HEALTH_SOUND_MESSAGE,
  farmHealthNotificationExtras,
  isFarmHealthNotificationAlert,
  playFarmHealthAlertSound,
} from "@/lib/notificationSounds";

const PREF_KEY = "pf.browserNotifications.v1";

export type BrowserNotificationPrefs = {
  enabled: boolean;
};

export function isBrowserNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPrefs(): BrowserNotificationPrefs {
  if (typeof window === "undefined") return { enabled: false };
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { enabled: true };
    const parsed = JSON.parse(raw) as BrowserNotificationPrefs;
    return { enabled: parsed.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

export function setBrowserNotificationPrefs(prefs: BrowserNotificationPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isBrowserNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export type ShowNotificationInput = {
  title: string;
  body: string;
  tag: string;
  url?: string;
  /** Custom alert tone; defaults to farm-health chime for dose / farm-health URLs. */
  sound?: string;
};

function farmHealthExtrasForInput(input: ShowNotificationInput) {
  if (input.sound) {
    return { sound: input.sound, vibrate: undefined as number[] | undefined };
  }
  if (isFarmHealthNotificationAlert(input.tag, input.url)) {
    return farmHealthNotificationExtras();
  }
  return null;
}

/** Show a system notification (service worker when available, else Notification constructor). */
export async function showBrowserNotification(input: ShowNotificationInput) {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!getBrowserNotificationPrefs().enabled) return;

  const farmExtras = farmHealthExtrasForInput(input);
  const options: NotificationOptions & { renotify?: boolean } = {
    body: input.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: input.tag,
    data: { url: input.url ?? "/alerts" },
    renotify: true,
    ...(farmExtras?.sound ? { sound: farmExtras.sound } : {}),
    ...(farmExtras?.vibrate ? { vibrate: farmExtras.vibrate } : {}),
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(input.title, options);
        if (farmExtras) await notifyOpenClientsFarmHealthSound(reg);
        return;
      }
    }
  } catch {
    /* fall through */
  }

  if (farmExtras) void playFarmHealthAlertSound();

  const n = new Notification(input.title, options);
  n.onclick = () => {
    window.focus();
    const url = input.url ?? "/alerts";
    window.location.assign(url);
    n.close();
  };
}

async function notifyOpenClientsFarmHealthSound(reg: ServiceWorkerRegistration) {
  try {
    const sw = reg.active;
    if (sw) {
      sw.postMessage({ type: BROADCAST_FARM_HEALTH_SOUND_MESSAGE });
      return;
    }
  } catch {
    /* ignore */
  }
  void playFarmHealthAlertSound();
}
