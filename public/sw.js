const CACHE_NAME = "fintrack-shell-v1";
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/pwa-icon?size=192",
  "/pwa-icon?size=512",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "FinTrack", body: event.data.text() };
  }
  const title = payload.title || "FinTrack";
  const options = {
    body: payload.body || "",
    tag: payload.tag,
    data: { url: payload.url || "/", ...(payload.data || {}) },
    icon: "/pwa-icon?size=192",
    badge: "/pwa-icon?size=192",
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      // Focus an existing tab if open on the same origin.
      for (const client of clientsArr) {
        try {
          const target = new URL(url, self.location.origin);
          const current = new URL(client.url);
          if (current.origin === target.origin) {
            return client.focus().then(() => client.navigate(target.href));
          }
        } catch {
          // ignore parse errors
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          (await caches.match(request, { ignoreSearch: true })) ||
          caches.match("/offline")
        );
      })
    );

    return;
  }

  if (
    ["font", "image", "manifest", "script", "style", "worker"].includes(
      request.destination
    ) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkRequest = fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response.clone());
              });
            }

            return response;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkRequest;
      })
    );
  }
});
