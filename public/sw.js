/* En local (localhost), ce service worker se désinstalle tout seul (25/11) : les fichiers JS du serveur de
   développement gardent le même nom d'une version à l'autre et le cache-first servait du code figé. Le
   navigateur revérifie sw.js à chaque visite : cette version remplace l'ancienne, vide les caches, se
   désinscrit et recharge les onglets ouverts. Sans effet en production. */
const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname) || self.location.hostname.endsWith(".localhost");
if (IS_LOCAL) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
    })());
  });
}

/* v5 (27/11) : le cache v4 gardait toutes les réponses sans jamais rien effacer (chaque préchargement de page
   `?_rsc=…` a une adresse unique) ; sur les comptes les plus actifs, l'Accueil de l'app iOS attendait 6 à 9 s ses
   fichiers (mesure app_boot_timing du 25-27/11, retirée depuis). Changer le nom vide l'ancien cache ; trimCache le borne désormais. */
const CACHE = "theperfclub-v5";
const MAX_ENTRIES = 300;
const KEEP = new Set(["/today", "/offline.html"]);

async function trimCache() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const extra = keys.filter((r) => !KEEP.has(new URL(r.url).pathname)).slice(0, Math.max(0, keys.length - MAX_ENTRIES));
  for (const r of extra) await cache.delete(r);
}
let trimTimer = null;
function scheduleTrim() {
  if (trimTimer) return;
  trimTimer = setTimeout(() => { trimTimer = null; trimCache().catch(() => {}); }, 10000);
}
function putInCache(request, response) {
  caches.open(CACHE).then((cache) => cache.put(request, response)).then(scheduleTrim).catch(() => {});
}
/* Mode hors ligne (2026-10-02) : /offline.html est la page affichée quand une page ne peut pas
   se charger sans réseau (séances de la semaine + file d'attente, voir public/offline.html). */
const PRECACHE_URLS = ["/offline.html"];
const STATIC_ASSET_RE = /^\/_next\/static\/|\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/;

if (!IS_LOCAL) self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

if (!IS_LOCAL) self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => trimCache().catch(() => {}))
      .then(() => self.clients.claim())
  );
});

if (!IS_LOCAL) self.addEventListener("fetch", (event) => {
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
            putInCache(event.request, clone);
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

  /* Données de page de Next (préchargements et navigations internes) : jamais en cache, adresse unique à chaque
     fois et inutiles hors ligne (une navigation sans réseau tombe sur la page hors ligne). */
  if (event.request.headers.get("RSC") || new URL(event.request.url).searchParams.has("_rsc")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          putInCache(event.request, response.clone());
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
