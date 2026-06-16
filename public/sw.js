/* eslint-disable no-restricted-globals */
const CACHE_NAME = "patela-farms-pwa-v7";
const OFFLINE_URL = "/offline";
const OFFLINE_HTML = "/offline.html";
const FARM_HEALTH_ALERT_SOUND = "/sounds/farm-health-alert.wav";
const FARM_HEALTH_VIBRATE = [400, 120, 400, 120, 500, 120, 600];
const PLAY_FARM_HEALTH_SOUND_MESSAGE = "pf.playFarmHealthSound";
const BROADCAST_FARM_HEALTH_SOUND_MESSAGE = "pf.broadcastFarmHealthSound";
const CORE_ASSETS = ["/", "/manifest.json", "/logo.png", OFFLINE_URL, OFFLINE_HTML, FARM_HEALTH_ALERT_SOUND];

function isFarmHealthPayload(payload, url) {
  return (
    (typeof payload.tag === "string" && payload.tag.startsWith("dose:")) ||
    (typeof url === "string" && url.startsWith("/farm-health"))
  );
}

async function notifyOpenClientsFarmHealthSound() {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: PLAY_FARM_HEALTH_SOUND_MESSAGE });
    }
  } catch {
    /* ignore */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(CORE_ASSETS);
      } catch {
        // Ignore cache population failures (offline-first may still function).
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return undefined;
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data?.type === BROADCAST_FARM_HEALTH_SOUND_MESSAGE) {
    event.waitUntil(notifyOpenClientsFarmHealthSound());
  }
});

// ---- Optional capabilities for store checkers (PWABuilder) ----
// Background sync (one-shot).
self.addEventListener("sync", (event) => {
  // Apps can register tags and handle them here.
  if (!event?.tag) return;
  event.waitUntil(Promise.resolve());
});

// Periodic background sync.
self.addEventListener("periodicsync", (event) => {
  if (!event?.tag) return;
  event.waitUntil(Promise.resolve());
});

// Push notifications.
self.addEventListener("push", (event) => {
  const show = async () => {
    let payload = {};
    try {
      payload = event?.data ? event.data.json() : {};
    } catch {
      payload = { title: "Patela Farm", body: event?.data?.text?.() ?? "" };
    }
    const title = payload.title || "Patela Farm";
    const body = payload.body || "You have an update.";
    const url = payload.url || "/";
    const isFarmHealth = isFarmHealthPayload(payload, url);
    const sound = isFarmHealth
      ? new URL(FARM_HEALTH_ALERT_SOUND, self.location.origin).href
      : undefined;
    await self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      ...(sound ? { sound } : {}),
      ...(isFarmHealth ? { vibrate: FARM_HEALTH_VIBRATE } : {}),
    });
    if (isFarmHealth) await notifyOpenClientsFarmHealthSound();
  };
  event.waitUntil(show());
});

self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
  const targetUrl = event?.notification?.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          try {
            await c.navigate(targetUrl);
          } catch {
            // ignore
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

function shouldHandleAsAsset(url) {
  // Keep this intentionally simple: cache static assets; don't cache API/data.
  if (url.pathname.startsWith("/_next/")) return true;
  if (url.pathname.startsWith("/assets/")) return true;
  return [".png", ".jpg", ".jpeg", ".webp", ".svg", ".css", ".js", ".wav", ".mp3", ".ogg"].some((ext) =>
    url.pathname.endsWith(ext),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first while online, cached app shell while offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cachedRequest = await caches.match(req);
          if (cachedRequest) return cachedRequest;
          const cachedShell = await caches.match("/");
          if (cachedShell) return cachedShell;
          return (
            (await caches.match(OFFLINE_HTML)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })(),
    );
    return;
  }

  if (!shouldHandleAsAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached;
      }
    })(),
  );
});

