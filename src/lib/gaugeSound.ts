/* Son d'une jauge qu'on règle (2026-11-06, POC « Le curseur est le formulaire ») : chaque cran est le
   cliquet d'une molette, un peu plus clair vers le « mieux » ; la validation est le « clac » sourd d'une
   molette qui se cale. Rien si l'utilisateur a demandé moins d'animations. */

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let noise: AudioBuffer | null = null;

function quiet() {
  return typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
function audio(): Ctx | null {
  if (quiet()) return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
    if (!noise) {
      const n = Math.round(ctx.sampleRate * 0.03), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
      noise = b;
    }
    return ctx;
  } catch { return null; }
}
function click(a: Ctx, t: number, f: number, q: number, g: number, dur: number) {
  if (!noise) return;
  const s = a.createBufferSource(); s.buffer = noise;
  const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
  const gn = a.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(gn).connect(a.destination); s.start(t); s.stop(t + dur + 0.01);
}

/* Un cran. `better` : 1 (moins bien) à 10 (mieux), règle la hauteur du clic. */
export function gaugeTick(better: number) {
  const a = audio(); if (!a) return;
  try {
    const t = a.currentTime, k = Math.max(1, Math.min(10, better)), f = 1500 + k * 45;
    click(a, t, f, 6, 0.5, 0.018); click(a, t + 0.011, f * 0.72, 5, 0.22, 0.02);
    const o = a.createOscillator(), gn = a.createGain();
    o.type = "triangle"; o.frequency.value = 340 + k * 8;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.02, t + 0.002); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.05);
  } catch { /* son facultatif */ }
}

/* Réponse validée : la molette se cale. */
export function gaugeLock() {
  const a = audio(); if (!a) return;
  try {
    const t = a.currentTime;
    click(a, t, 900, 2.5, 0.7, 0.05); click(a, t + 0.004, 2400, 8, 0.3, 0.03);
    const o = a.createOscillator(), gn = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.09);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.09, t + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.16);
  } catch { /* son facultatif */ }
}
