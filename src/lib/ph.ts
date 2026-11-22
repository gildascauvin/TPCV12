/* PostHog chargé après l'ouverture (22/11, temps de lancement de l'app) : posthog-js pesait ~300 Ko de JS
   exécutés avant l'affichage de chaque page. Le code n'en utilise que des envois (capture, identify,
   setPersonProperties, register, reset) : ils sont mis en file avec leur heure réelle, puis rejoués dans l'ordre
   une fois la bibliothèque chargée, une fois la page affichée. Importer `posthog` d'ici, jamais de "posthog-js". */
import type { PostHog } from "posthog-js";
import { Capacitor } from "@capacitor/core";

type Call = (ph: PostHog) => void;
let client: PostHog | null = null;
let queue: Call[] | null = [];
const enabled = typeof window !== "undefined" && process.env.NODE_ENV !== "development";

function run(fn: Call) {
  if (!enabled) return;
  if (client) { fn(client); return; }
  queue?.push(fn);
}

async function load() {
  const { default: ph } = await import("posthog-js");
  ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "https://eu.i.posthog.com",
    person_profiles: "always",
    capture_pageview: false,
  });
  // Support d'où vient chaque event : app iOS/Android (Capacitor), PWA installée ou navigateur.
  // $os ne suffit pas : Safari sur iPhone et l'app iOS remontent tous deux "iOS".
  const native = Capacitor.isNativePlatform();
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const platform = native ? `${Capacitor.getPlatform()}_app` : standalone ? "pwa" : "web";
  ph.register({ platform });
  ph.setPersonProperties({ last_platform: platform }, native ? { used_native_app: true } : undefined);
  client = ph;
  const pending = queue ?? [];
  queue = null;
  pending.forEach(fn => fn(ph));
}

if (enabled) {
  const start = () => setTimeout(() => { load().catch(() => { queue = null; }); }, 0);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

type Props = Record<string, unknown>;
const posthog = {
  capture(event: string, props?: Props) {
    const timestamp = new Date();
    run(ph => { ph.capture(event, props, { timestamp }); });
  },
  identify(id: string, props?: Props) { run(ph => { ph.identify(id, props); }); },
  setPersonProperties(set?: Props, setOnce?: Props) { run(ph => { ph.setPersonProperties(set, setOnce); }); },
  register(props: Props) { run(ph => { ph.register(props); }); },
  reset() { run(ph => { ph.reset(); }); },
};

export default posthog;
