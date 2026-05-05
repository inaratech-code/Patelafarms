"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cleanup: (() => void) | null = null;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        // Auto-update: check for new SW periodically and reload when it takes control.
        const doUpdate = async () => {
          try {
            await reg.update();
          } catch {
            /* ignore */
          }
        };
        const interval = window.setInterval(doUpdate, 5 * 60 * 1000); // 5 min

        const onControllerChange = () => {
          // New version activated and controlling this page → hard reload to pick up new assets.
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        // If an update is found, tell it to activate immediately.
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              // If there's an existing controller, this is an update.
              if (navigator.serviceWorker.controller) {
                installing.postMessage({ type: "SKIP_WAITING" });
              }
            }
          });
        });

        cleanup = () => {
          window.clearInterval(interval);
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        };
      } catch (e) {
        // Don't block the app if SW registration fails.
        console.warn("Service worker registration failed:", e);
      }
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}

