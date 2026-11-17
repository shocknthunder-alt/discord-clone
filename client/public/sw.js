/* ШмиркаТа service worker: makes the site installable and shows push notifications.
   No offline caching on purpose — the app is always loaded fresh from the network (the update
   banner relies on that). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ШмиркаТа", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ШмиркаТа";
  event.waitUntil(
    (async () => {
      // Someone is looking at the app right now → it shows its own notice, skip the push.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === "visible" && w.focused)) return;
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // An open app jumps there itself (no reload — keeps the voice call going).
        open.postMessage({ type: "push-open", url });
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
