/* Frise du déroulé de l'essai (31/10, Gildas) : réassurance seulement (0 €, annulable, 1er paiement). La
   valeur (Ajuste / Comprends / Anticipe) vit dans la carte Elite (ValuePath, PricingPriming.tsx).
   Dans tous les paywalls (onboarding et app) : sous le titre en mobile, dans la colonne de gauche en desktop.
   Pas de rappel avant facturation : on n'en envoie pas, donc on ne le promet pas. */

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };

export function RiskTimeline({ coach }: { coach?: boolean }) {
  const steps = [
    { ic: "✓", t: "Aujourd'hui", s: coach ? "0 €. Tes sportifs sont gratuits, toujours." : "0 €", now: true },
    { ic: "✓", t: "Pendant l'essai", s: "Annulable en 1 clic" },
    { ic: "€", t: "Jour 14", s: "1er paiement" },
  ];
  return (
    <div>
      <div style={{ ...MONO, color: "rgba(255,255,255,.5)", marginBottom: 12 }}>14 jours offerts</div>
      {steps.map((x, i) => (
        <div key={x.t} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, paddingBottom: 12, position: "relative", alignItems: "center" }}>
          {i < steps.length - 1 && <span style={{ position: "absolute", left: 13, top: 28, bottom: -2, width: 2, background: "rgba(255,255,255,.10)" }} />}
          <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, background: x.now ? "#f04a08" : "rgba(255,255,255,.08)", color: "#fff", position: "relative", zIndex: 1 }}>{x.ic}</span>
          <span style={{ fontSize: 14, lineHeight: 1.35 }}>
            <b style={{ color: "#fff" }}>{x.t}</b>
            <span style={{ color: "rgba(255,255,255,.62)" }}> · {x.s}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
