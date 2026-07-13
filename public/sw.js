const CACHE = "theperfclub-v2";
const PRECACHE_URLS = ["/today", "/week", "/offline"];
const STATIC_ASSET_RE = /^\/_next\/static\/|\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const pathname = new URL(event.request.url).pathname;

  /* Fichiers statiques versionnés (hash dans le nom de fichier à chaque build) :
     cache-first sans risque d'obsolescence, un contenu différent a toujours une URL différente. */
  if (STATIC_ASSET_RE.test(pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  /* Pages et API : network-first — toujours la version la plus fraîche, le cache ne sert
     que de secours hors-ligne. Un cache-first ici servait indéfiniment une page/réponse figée
     dès qu'elle avait été visitée une fois, même après déploiement (bug réel constaté en
     usage quotidien, pas seulement en dev). */
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/offline")))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "ThePerfClub (erreur payload)", body: String(err) };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "ThePerfClub", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag ?? "wellness",
      renotify: true,
      data: { url: data.url ?? "/today" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin)) return c.focus();
      }
      return clients.openWindow(event.notification.data?.url ?? "/today");
    })
  );
});
