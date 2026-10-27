import { Skel } from "@/components/ui/Skeleton";
import { DARK_CARD_BG } from "@/lib/theme";

/* Squelette du Planning coach (2026-10-27, qualité perçue) : calqué sur le 1er rendu de
   CoachPlanningClient, qui ouvre sur un sportif sélectionné (1er de la liste ou ?athlete=). Barre du
   sportif = « ‹ Groupe » + bandeau d'activité (padding 6/16, 48px), rangée de date 66px (bascule de
   vue à gauche, semaine au centre, profil à droite). Mobile (< 640px) : vue colonne (560 max, marges
   16) ; dès 640px : grille 7 × var(--wk-col), marges 24, écart 12. Cartes-jours = DayColumn. */
const CSS = `
.skl-week{display:none;grid-template-columns:repeat(7,var(--wk-col,280px));gap:12px;overflow:hidden;padding:14px 24px 18px}
.skl-col{max-width:560px;margin:0 auto;padding:8px 16px 24px}
@media (min-width:640px){
  .skl-week{display:grid}
  .skl-col{display:none}
}
`;

function DayCard() {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 24, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <Skel w={30} h={9} />
          <Skel w={34} h={24} r={6} />
        </div>
        <Skel w={58} h={58} r="50%" />
      </div>
      <Skel w={90} h={9} style={{ marginBottom: 10 }} />
      <Skel h={62} r={16} style={{ marginBottom: 12 }} />
      <Skel w={70} h={8} style={{ marginBottom: 9 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Skel h={92} r={16} />
        <Skel h={33} r={12} />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      <style>{CSS}</style>

      {/* Barre du sportif sélectionné (AthleteFilterBar, mode sportif). */}
      <div style={{ background: "rgba(10,14,18,.72)", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "6px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48 }}>
          <div style={{ height: 34, width: 86, borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1.5px solid rgba(255,255,255,.12)", boxSizing: "border-box", flexShrink: 0 }} />
          <Skel dark w={34} h={34} r="50%" />
          <Skel dark w={140} h={12} style={{ flexShrink: 1 }} />
          <span style={{ flex: 1 }} />
          <Skel dark w={54} h={18} />
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "14px 16px 12px" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 172, height: 36, borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Skel dark w="62%" h={12} />
        </div>
        <div style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 40 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", boxSizing: "border-box" }} />
          <div style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", boxSizing: "border-box" }} />
        </div>
      </div>

      <div className="skl-week">
        {Array.from({ length: 7 }, (_, i) => <DayCard key={i} />)}
      </div>

      <div className="skl-col">
        <div style={{ padding: "6px 2px 6px", borderBottom: "1px solid rgba(255,255,255,.1)", marginBottom: 8 }}>
          <Skel dark w={110} h={11} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <DayCard />
          <DayCard />
        </div>
      </div>
    </div>
  );
}
