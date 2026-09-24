import { registerSW } from "virtual:pwa-register";

const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Keeps an installed app from running an old version for days: the service
 * worker is asked for a newer build when the app is opened, whenever it comes
 * back to the foreground, and hourly while it stays open. With registerType
 * "autoUpdate" the page reloads by itself as soon as the new version takes over,
 * so an old client never sits in front of a newer server (or the other way round).
 */
export function keepAppUpToDate(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Offline (or the server is unreachable): ignore, the next check tries again.
      const check = () => void registration.update().catch(() => {});
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}
