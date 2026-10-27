import { Skel } from "@/components/ui/Skeleton";
import { DARK_CARD_BG } from "@/lib/theme";

/* Squelette de l'Accueil (2026-10-27, qualité perçue) : calqué sur le 1er rendu de TodayClient pour
   que rien ne saute à l'arrivée des données. Même fond (DARK_CARD_BG pleine page), même header
   (bandeau d'activité 49px + rangée date/profil 66px), même colonne (gouttières 16/24/32, largeur
   100%/720/1000), mêmes onglets (3 colonnes empilées sur mobile, en ligne dès 640px), anneau de
   décision 188×147 puis carte décision. Mobile : séances dans la feuille du bas (HomeSheet repliée) ;
   desktop : séance sous la carte, après le filet. Rendu serveur, CSS seul (media queries). */
const CSS = `
.skt-date{width:112px}
.skt-col{padding:14px 16px 0;max-width:100%;margin:0 auto}
.skt-tabs{display:flex;gap:4px;justify-content:center;margin-bottom:16px}
.skt-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 2px 9px;border-bottom:2px solid transparent;margin-bottom:-1px}
.skt-tab.on{border-bottom-color:#d44000}
.skt-tab-txt{display:flex;flex-direction:column;align-items:center;gap:4px}
.skt-mini-d{display:none}
.skt-block{padding-top:4px}
.skt-desk{display:none}
@media (min-width:640px){
  .skt-date{width:150px}
  .skt-col{padding:14px 24px 0;max-width:720px}
  .skt-tabs{gap:22px}
  .skt-tab{flex:0 0 auto;flex-direction:row;gap:10px;padding:12px 10px 11px}
  .skt-tab-txt{align-items:flex-start}
  .skt-mini-m{display:none}
  .skt-mini-d{display:block}
  .skt-block{padding-top:8px}
  .skt-desk{display:block}
  .skt-sheet{display:none}
}
@media (min-width:1024px){
  .skt-col{padding:14px 32px 0;max-width:1000px}
}
`;

const MINI_R = "999px 999px 8px 8px";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 100, boxSizing: "border-box" }}>
      <style>{CSS}</style>

      {/* Bandeau d'activité du sportif (ActivityStripBand + ActivityStripSkeleton). */}
      <div style={{ background: "rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.10)" }}>
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 10, minHeight: 48 }}>
          <Skel dark w={34} h={34} r="50%" />
          <Skel dark w={140} h={12} />
          <span style={{ flex: 1 }} />
          <Skel dark w={54} h={18} />
        </div>
      </div>

      {/* Rangée du header : capsule de date centrée, profil à droite. */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "14px 16px 12px" }}>
        <div className="skt-date" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", height: 36, borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Skel dark w="55%" h={12} />
        </div>
        <div style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 40 }}>
          <div style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", boxSizing: "border-box" }} />
        </div>
      </div>

      <div className="skt-col">
        {/* Onglets Aujourd'hui / Charge / Récupération (HomeTabs). */}
        <div className="skt-tabs">
          {[0, 1, 2].map(i => (
            <div key={i} className={i === 0 ? "skt-tab on" : "skt-tab"}>
              <span className="skt-mini-m"><Skel dark w={44} h={36} r={MINI_R} /></span>
              <span className="skt-mini-d"><Skel dark w={54} h={43} r={MINI_R} /></span>
              <span className="skt-tab-txt">
                <Skel dark w={i === 2 ? 78 : 62} h={11} />
                <Skel dark w={52} h={9} />
              </span>
            </div>
          ))}
        </div>

        <div className="skt-block">
          {/* Anneau de décision (DecisionRing 188 → 188×147). */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <Skel dark w={188} h={147} r="94px 94px 40px 40px" />
          </div>
          {/* Carte décision (AlertBox darkColor centrée). */}
          <div style={{ margin: "0 0 12px", padding: "12px 16px", borderRadius: 16, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
            <Skel dark w="48%" h={15} />
            <Skel dark w="86%" h={12} />
            <Skel dark w="64%" h={12} />
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Skel dark w={96} h={34} r={12} />
              <Skel dark w={110} h={34} r={12} />
            </div>
            <Skel dark w="58%" h={12} style={{ marginTop: 4 }} />
          </div>

          {/* Desktop : séance du jour sous la carte, après le filet. */}
          <div className="skt-desk" style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
            <div style={{ background: "#fff", borderRadius: 24, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <Skel w="45%" h={18} />
                <Skel w={64} h={20} r={999} />
              </div>
              <Skel h={84} r={16} />
              <Skel h={38} r={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile : feuille du bas repliée (HomeSheet), nom de la séance visible. */}
      <div className="skt-sheet" style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 180, zIndex: 40, background: "#f1f0ee", borderRadius: "24px 24px 0 0", boxShadow: "0 -18px 44px rgba(0,0,0,.45)", overflow: "hidden" }}>
        <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 42, height: 5, borderRadius: 999, background: "rgba(0,0,0,.18)" }} />
        </div>
        <div style={{ margin: "0 14px", background: "#fff", borderRadius: 24, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <Skel w="50%" h={18} />
            <Skel w={64} h={20} r={999} />
          </div>
          <Skel h={12} r={999} />
        </div>
      </div>
    </div>
  );
}
