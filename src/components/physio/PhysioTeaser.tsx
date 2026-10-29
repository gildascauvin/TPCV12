import { DARK_CARD_BG } from "@/lib/theme";

/* Teaser à l'aveugle (2026-10-14, POC variante B fond dark) : annonce en tête du point forme et du tiroir
   "Terminer la séance" que des données physiologiques existent, sans aucune valeur lisible (les
   chiffres floutés sont factices). La comparaison n'apparaît qu'après Valider. */
export default function PhysioTeaser({ label, text, chips }: { label: string; text: string; chips: string[] }) {
  return (
    <div style={{ borderRadius: 16, padding: "14px 15px", background: DARK_CARD_BG, marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6da7ec" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 5, lineHeight: 1.4 }}>{text}</div>
      <div aria-hidden="true" style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {chips.map(t => (
          <span key={t} style={{ flex: 1, borderRadius: 12, background: "rgba(255,255,255,.1)", padding: "8px 6px", textAlign: "center", fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, color: "#fff", filter: "blur(6px)", userSelect: "none" }}>{t}</span>
        ))}
      </div>
    </div>
  );
}
