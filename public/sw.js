const CACHE = "theperfclub-v4";
/* Mode hors ligne (2026-10-02) : /offline.html est la page affichée quand une page ne peut pas
   se charger sans réseau (séances de la semaine + file d'attente, voir public/offline.html). */
const PRECACHE_URLS = ["/offline.html"];
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
            /* .catch() : un fetch annulé (navigation/fermeture avant la fin du téléchargement)
               ou une extension qui coupe le flux de la réponse fait échouer cache.put() —
               écriture en cache best-effort, jamais critique pour l'affichage réel de la page,
               ne doit donc jamais remonter comme une exception non gérée dans la console. */
            caches.open(CACHE).then((cache) => cache.put(event.request, clone)).catch(() => {});
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
  /* Navigation (ouverture d'une page) : sans réseau, toujours la page hors ligne — une ancienne
     version en cache d'une page de l'app ne fonctionnerait pas sans serveur. */
  /* Vraie app hors ligne sur l'Accueil (2026-10-02) : chaque ouverture de /today avec réseau est
     gardée ; sans réseau, l'Accueil (ou la racine, page de démarrage de l'app iOS) est servi tel qu'à
     la dernière ouverture — TodayClient rejoue les actions en attente et la séance se fait hors ligne.
     Les autres pages renvoient sur l'écran hors ligne de secours. */
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (pathname === "/today" && response.ok && !response.redirected && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/today", clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          if (pathname === "/" || pathname === "/today") {
            const today = await caches.match("/today");
            if (today) return today;
          }
          return caches.match("/offline.html");
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
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
