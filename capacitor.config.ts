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
  },
  /* "always" : iOS décale la page sous la barre d'état et au-dessus de la barre d'accueil, sans
     avoir à gérer les safe areas dans chaque page de l'app web. Fond assorti à la page (#f1f0ee)
     pour que la bande sous l'heure ne se voie pas. */
  backgroundColor: "#f1f0ee",
  ios: {
    contentInset: "always",
  },
};

export default config;
