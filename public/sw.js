/*
 * Venkat Sai Global service worker: phone job alerts (Web Push) only. No fetch handler and no caching, so pages
 * always come from the network. Payload (src/modules/push): { title, body, url, tag, icon, badge }.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function sameOriginPath(url) {
  try {
    const target = new URL(url || "/", self.location.origin);
    return target.origin === self.location.origin ? target.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Venkat Sai Global";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: data.icon || "/icon",
      badge: data.badge || "/icon",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url: sameOriginPath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOriginPath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
