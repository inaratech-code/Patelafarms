/* eslint-disable no-restricted-globals */
const CACHE_NAME = "patela-farms-pwa-v2";
const OFFLINE_URL = "/offline";
const CORE_ASSETS = ["/", "/manifest.json", "/logo.png", OFFLINE_URL];

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
    await self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    });
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
  return [".png", ".jpg", ".jpeg", ".webp", ".svg", ".css", ".js"].some((ext) => url.pathname.endsWith(ext));
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

  // For navigation requests, try network first, fallback to cache.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || (await caches.match("/"));
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

