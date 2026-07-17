/* public/sw.js — V11 M2/M3 service worker.
 *
 * DELIBERATELY MINIMAL. This is a LIVE MARKET DATA app: caching quotes, candles,
 * or signals would be actively dangerous — a trader acting on a silently-served
 * stale price is a real-money bug. So there is NO offline mode and NO data
 * caching here, on purpose. Its only jobs are:
 *   1. Exist, so the app is installable to the home screen.
 *   2. Receive Web Push and show the notification (M3).
 *
 * On iOS, push ONLY works when installed to the home screen — which is exactly
 * why the PWA step had to land before push.
 */

const VERSION = "kronos-v11";

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache from a previous version. We keep none, but a stale cache
      // left by an earlier build must not be allowed to serve old app shell.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// No fetch handler on purpose. Registering a pass-through fetch listener would
// add a hop to every request and buy nothing — absence means the browser just
// does its normal thing.

// ── M3: PUSH ────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || "KRONOS";
  const options = {
    body: data.body || "New signal",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // `tag` collapses repeats for the same instrument so a chatty engine can't
    // stack twelve notifications for one ticker.
    tag: data.tag || "kronos-signal",
    renotify: true,
    // Signals are time-sensitive; don't let the OS quietly drop it.
    requireInteraction: false,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an already-open tab instead of spawning a duplicate.
      for (const c of all) {
        if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(target); return; }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
