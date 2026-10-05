(function () {
  var EXCLUDED_PATHS = ['/', '/coach-suivi-charge-wellness-sportifs/']; // ajoute d'autres chemins ici si besoin, ex: '/', '/autre-page/'
  if (EXCLUDED_PATHS.indexOf(window.location.pathname) !== -1) return;

  var iframe = document.querySelector('iframe[data-src*="go.theperfclub.com/p/"]')
    || document.querySelector('iframe[src*="go.theperfclub.com/p/"]');
  if (!iframe) return;

  var src = iframe.getAttribute('data-src') || iframe.src;
  var match = src.match(/\/p\/([a-f0-9-]+)/);
  if (!match) return;

  var programId = match[1];
  var ctaUrl = 'https://go.theperfclub.com/register?claim=' + programId;

  var style = document.createElement('style');
  style.textContent = '#tpc-floating-wrap{position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:10px 20px 28px;background:linear-gradient(180deg,transparent 0%,rgba(255,255,255,.95) 38%,#fff 60%);transform:translateY(110%);transition:transform .35s ease;pointer-events:none}#tpc-floating-wrap.tpc-visible{transform:translateY(0);pointer-events:auto}#tpc-floating-cta{display:block;text-align:center;background:#D44000;color:#fff;font-weight:800;font-size:16px;padding:15px 24px;border-radius:12px;text-decoration:none;box-shadow:0 8px 24px rgba(212,64,0,.28),0 2px 8px rgba(212,64,0,.14);transition:background .15s ease}#tpc-floating-cta:hover{background:#BB3800}';
  document.head.appendChild(style);

  var wrap = document.createElement('div');
  wrap.id = 'tpc-floating-wrap';
  wrap.innerHTML = '<a id="tpc-floating-cta" href="' + ctaUrl + '">Personnaliser ce programme →</a>';
  document.body.appendChild(wrap);

  var shown = false;
  function onScroll() {
    if (!shown && window.scrollY > 100) {
      shown = true;
      wrap.classList.add('tpc-visible');
      window.removeEventListener('scroll', onScroll);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var staticCta = document.getElementById('tpc-cta');
  if (staticCta) staticCta.href = ctaUrl;

  var floatLink = document.getElementById('tpc-floating-cta');
  if (floatLink) floatLink.addEventListener('click', function () {
    if (window.posthog) posthog.capture('program_wp_cta_clicked', { program_id: programId, cta: 'floating' });
  });
  if (staticCta) staticCta.addEventListener('click', function () {
    if (window.posthog) posthog.capture('program_wp_cta_clicked', { program_id: programId, cta: 'static' });
  });
})();

/* ThePerfClub — iframes de programme + images de la bibliothèque (2026-10-05).
   1. Iframes go.theperfclub.com/p/ : pleine largeur d'écran et hauteur au contenu (la page /p/
      envoie sa hauteur par postMessage). N'agit que sur les iframes de programme, rien d'autre.
   2. Cartes avec data-bg (bibliothèque) : le script de chargement différé n'est servi qu'aux admins
      connectés, on pose donc l'image nous-mêmes pour les visiteurs.
   Aucun double et-commercial dans ce script : WordPress le corrompt. */
(function () {
  var APP = "https://go.theperfclub.com";

  function programFrames() {
    return document.querySelectorAll('iframe[src*="go.theperfclub.com/p/"], iframe[data-src*="go.theperfclub.com/p/"]');
  }

  // Les encadrés autour de l'iframe (overflow hidden, bordure, coins arrondis) coupaient tout ce qui
  // dépasse de la colonne : on les libère jusqu'au corps de page (html/body exclus).
  function unclip(f) {
    var el = f.parentElement, depth = 0;
    while (el) {
      if (el === document.body || el === document.documentElement) break;
      var cs = window.getComputedStyle(el);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") el.style.overflow = "visible";
      if (depth === 0) {
        el.style.border = "none";
        el.style.borderRadius = "0";
        el.style.boxShadow = "none";
      }
      el = el.parentElement;
      depth++;
    }
  }

  function stretch(f) {
    var parent = f.parentElement;
    if (!parent) return;
    unclip(f);
    var pageW = document.documentElement.clientWidth;
    var left = parent.getBoundingClientRect().left;
    f.style.display = "block";
    f.style.maxWidth = "none";
    f.style.width = pageW + "px";
    f.style.marginLeft = (-left) + "px";
    f.style.borderRadius = "0";
  }

  function ask(f) {
    try {
      if (f.contentWindow) f.contentWindow.postMessage({ type: "tpc-program-height-request" }, APP);
    } catch (e) {}
  }

  function setup() {
    var frames = programFrames();
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      var real = f.getAttribute("data-src");
      // Le chargement différé n'est servi qu'aux admins : pour un visiteur, l'iframe garde
      // une image vide en src. On charge donc la vraie page nous-mêmes.
      if (real) {
        if (f.getAttribute("src") !== real) f.setAttribute("src", real);
        f.classList.remove("lazyload");
      }
      stretch(f);
      if (!f.getAttribute("data-tpc-watched")) {
        f.setAttribute("data-tpc-watched", "1");
        f.addEventListener("load", (function (fr) { return function () { ask(fr); }; })(f));
      }
      ask(f);
    }
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== APP) return;
    var d = e.data;
    if (!d || d.type !== "tpc-program-height" || !d.id) return;
    var frames = programFrames();
    for (var i = 0; i < frames.length; i++) {
      var src = frames[i].getAttribute("data-src") || frames[i].getAttribute("src") || "";
      if (src.indexOf("/p/" + d.id) !== -1) frames[i].style.height = Math.ceil(d.height) + "px";
    }
  });

  function showLazyBackgrounds() {
    var cards = document.querySelectorAll("[data-bg]");
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      if (el.getAttribute("data-tpc-bg")) continue;
      el.setAttribute("data-tpc-bg", "1");
      el.classList.remove("lazyload");
      // data-bg contient déjà le fond complet (dégradé, url, center/cover) : on le pose tel quel.
      el.style.background = el.getAttribute("data-bg");
    }
  }

  function run() { setup(); showLazyBackgrounds(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  window.addEventListener("load", run);
  window.addEventListener("resize", setup);
  // Les iframes Elementor se chargent en différé : on repasse quelques fois.
  var n = 0, t = setInterval(function () { setup(); showLazyBackgrounds(); n++; if (n > 10) clearInterval(t); }, 1000);
})();
