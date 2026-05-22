"use client";

import { useEffect } from "react";
import { PLAY_FARM_HEALTH_SOUND_MESSAGE, playFarmHealthAlertSound } from "@/lib/notificationSounds";

/**
 * Plays the farm health alert in open app windows when the service worker fires a notification
 * (iOS / desktop often ignore Notification.sound; in-page audio still works when the app is open).
 */
export function FarmHealthSoundBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === PLAY_FARM_HEALTH_SOUND_MESSAGE) {
        void playFarmHealthAlertSound();
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
