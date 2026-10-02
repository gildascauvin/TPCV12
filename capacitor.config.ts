import type { CapacitorConfig } from "@capacitor/cli";

/* POC iOS : la coque native charge l'app web hébergée au lieu d'embarquer un build statique
   (l'app a des routes serveur et des API, pas d'export statique possible).
   En local : CAP_SERVER_URL=http://<ip-du-mac>:3000 npx cap sync ios, iPhone sur le même wifi. */
const serverUrl = process.env.CAP_SERVER_URL || "https://go.theperfclub.com";

const config: CapacitorConfig = {
  appId: "com.theperfclub.app",
  appName: "ThePerfClub",
  webDir: "capacitor-www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    // Mode hors ligne (2026-10-02) : page locale (capacitor-www/offline.html, copie de
    // public/offline.html) affichée quand le site ne répond pas.
    errorPath: "offline.html",
  },
  /* "always" : iOS décale la page sous la barre d'état et au-dessus de la barre d'accueil, sans
     avoir à gérer les safe areas dans chaque page de l'app web. Fond assorti au fond sombre de
     l'app (#070a0d, 2026-10-02) pour que la bande sous l'heure ne se voie pas. */
  backgroundColor: "#070a0d",
  ios: {
    contentInset: "always",
    /* Mode hors ligne (2026-10-02) : nécessaire pour que le service worker fonctionne dans l'app
       (Accueil rouvert hors ligne). Domaines listés dans WKAppBoundDomains (Info.plist). */
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    // Google natif (connexion) ; Apple gardé pour Sign in with Apple, exigé par l'App Store.
    SocialLogin: { providers: { google: true, apple: true, facebook: false, twitter: false } },
  },
};

export default config;
