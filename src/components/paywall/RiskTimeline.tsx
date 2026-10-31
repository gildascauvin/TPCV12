/* Frise sans risque de l'essai, avec les 2 bilans de semaine (2026-10-29, argumentaire avant paywall).
   Dans tous les paywalls (onboarding et app, Gildas 2026-10-30 : « le même, pas d'exception ») : sous le
   titre en mobile, dans la colonne de gauche en desktop, face à la carte Elite.
   Pas de rappel avant facturation (consigne de Gildas, PricingPriming.tsx) : seulement les jours offerts et
   l'annulation en 1 clic. 14 jours offerts sur les deux formules. */

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };

/* noAthletes (31/10) : coach sans sportif invité, pas de « leurs points forme arrivent demain ». */
export function RiskTimeline({ coach, noAthletes }: { coach?: boolean; noAthletes?: boolean }) {
  const steps = [
    { ic: "✓", t: "Aujourd'hui", s: `Accès complet, 0 €. ${coach ? "Tes sportifs sont gratuits, toujours." : "Ton premier verdict arrive ce soir."}`, now: true },
    ...(coach ? [{ ic: "☀", t: "Demain matin", s: noAthletes ? "Invite tes sportifs ce soir : demain matin, tu sais qui pousser et qui alléger." : "Les points forme de tes sportifs arrivent : qui pousser, qui alléger." }] : []),
    { ic: "📊", t: "Jour 7", s: coach ? "Ton premier bilan du groupe : qui décroche, qui force." : "Ton premier bilan de la semaine." },
    { ic: "€", t: "Jour 14", s: `${coach ? "2e bilan du groupe" : "2e bilan"}, puis premier paiement. Annulation en 1 clic avant.` },
  ];
  const dot = (x: typeof steps[number]) => <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, background: x.now ? "#f04a08" : "rgba(255,255,255,.08)", color: "#fff", position: "relative", zIndex: 1 }}>{x.ic}</span>;
  const text = (x: typeof steps[number]) => <span><b style={{ display: "block", fontSize: 14.5, color: "#fff" }}>{x.t}</b><span style={{ display: "block", fontSize: 12.5, color: "rgba(255,255,255,.58)", lineHeight: 1.4, marginTop: 2 }}>{x.s}</span></span>;
  return (
    <div>
      <div style={{ ...MONO, color: "rgba(255,255,255,.5)", marginBottom: 12 }}>14 jours offerts</div>
      {steps.map((x, i) => (
        <div key={x.t} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, paddingBottom: 14, position: "relative" }}>
          {i < steps.length - 1 && <span style={{ position: "absolute", left: 13, top: 30, bottom: 2, width: 2, background: "rgba(255,255,255,.10)" }} />}
          {dot(x)}
          {text(x)}
        </div>
      ))}
    </div>
  );
}
