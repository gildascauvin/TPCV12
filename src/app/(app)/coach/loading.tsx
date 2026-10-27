import { Skel } from "@/components/ui/Skeleton";
import { DARK_CARD_BG } from "@/lib/theme";

/* Squelette de Coach Control (2026-10-27, qualité perçue) : calqué sur le 1er rendu de CoachClient
   (vue Groupe, onglet Aujourd'hui). Barre des sportifs en puces (AthleteFilterBar, padding 12/16),
   rangée de date 66px sans bandeau d'activité (côté coach il vit dans la barre), onglets HomeTabs
   (colonne 600/720/1180), puis contenu pleine largeur aux gouttières 16/24/40 : salutation, texte
   d'explication, radar (ratio 560:300), bouton de revue, et la liste « À décider ». Dès 1024px, radar
   à gauche et liste à droite (1.15fr / 1fr). CSS seul. */
const CSS = `
.skc-date{width:112px}
.skc-tabwrap{max-width:600px;margin:0 auto;padding:0 16px}
.skc-tabs{display:flex;gap:4px;justify-content:center;margin-bottom:16px}
.skc-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 2px 9px;border-bottom:2px solid transparent;margin-bottom:-1px}
.skc-tab.on{border-bottom-color:#d44000}
.skc-tab-txt{display:flex;flex-direction:column;align-items:center;gap:4px}
.skc-mini-d{display:none}
.skc-body{padding:16px 16px 100px}
.skc-hello{height:15px}
.skc-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start;margin:13px 0}
.skc-p3{display:block}
@media (min-width:640px){
  .skc-date{width:150px}
  .skc-tabwrap{max-width:720px;padding:0 24px}
  .skc-tabs{gap:22px}
  .skc-tab{flex:0 0 auto;flex-direction:row;gap:10px;padding:12px 10px 11px}
  .skc-tab-txt{align-items:flex-start}
  .skc-mini-m{display:none}
  .skc-mini-d{display:block}
  .skc-body{padding:18px 24px 100px}
  .skc-hello{height:17px}
}
@media (min-width:1024px){
  .skc-tabwrap{max-width:1180px;padding:0 40px}
  .skc-body{padding:20px 40px 100px}
  .skc-grid{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
  .skc-p3{display:none}
}
`;

const MINI_R = "999px 999px 8px 8px";
const PILL = { borderRadius: 999, border: "1.5px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.07)", boxSizing: "border-box" as const, flexShrink: 0, display: "flex", alignItems: "center", gap: 7 };

function Row({ first }: { first?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "11px 16px", borderTop: first ? "none" : "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <Skel dark w="55%" h={14} />
        <Skel dark w="75%" h={11} />
        <Skel dark w={70} h={18} r={6} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ width: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Skel dark w={58} h={44} r={MINI_R} />
            <Skel dark w={46} h={8} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      <style>{CSS}</style>

      {/* Barre des sportifs (vue Groupe). */}
      <div style={{ background: "rgba(10,14,18,.72)", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, overflow: "hidden", flex: 1, minWidth: 0 }}>
            <div style={{ ...PILL, height: 36, width: 98, border: "1.5px solid transparent", background: "linear-gradient(180deg,#f04a08,#d44000)" }} />
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ ...PILL, height: 39, padding: "0 14px 0 7px" }}>
                <Skel dark w={22} h={22} r="50%" />
                <Skel dark w={44} h={10} />
              </div>
            ))}
          </div>
          <div style={{ ...PILL, height: 36, width: 86, background: "transparent", border: "1.5px dashed rgba(255,138,85,.6)" }} />
        </div>
      </div>

      {/* Rangée de date (sans bandeau d'activité côté coach). */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "14px 16px 12px" }}>
        <div className="skc-date" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", height: 36, borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Skel dark w="55%" h={12} />
        </div>
        <div style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 40 }}>
          <div style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", boxSizing: "border-box" }} />
        </div>
      </div>

      <div className="skc-tabwrap">
        <div className="skc-tabs">
          {[0, 1, 2].map(i => (
            <div key={i} className={i === 0 ? "skc-tab on" : "skc-tab"}>
              <span className="skc-mini-m"><Skel dark w={44} h={36} r={MINI_R} /></span>
              <span className="skc-mini-d"><Skel dark w={54} h={43} r={MINI_R} /></span>
              <span className="skc-tab-txt">
                <Skel dark w={i === 2 ? 78 : 62} h={11} />
                <Skel dark w={52} h={9} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="skc-body">
        <div style={{ marginBottom: 12 }}><div className="skc-hello" style={{ width: 170 }}><Skel dark w="100%" h="100%" /></div></div>
        <div className="skc-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                <Skel dark h={12} />
                <Skel dark h={12} />
                <Skel dark w="70%" h={12} />
                <span className="skc-p3"><Skel dark w="45%" h={12} /></span>
              </div>
              <Skel dark w="100%" h="auto" r={16} style={{ aspectRatio: "560 / 300" }} />
              <div style={{ display: "flex", gap: 8, padding: "12px 4px 0" }}>
                {[70, 84, 64].map((w, i) => <Skel key={i} dark w={w} h={14} />)}
              </div>
            </div>
            <Skel dark h={53} r={16} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <div>
              <Skel dark w={200} h={18} style={{ marginBottom: 9 }} />
              <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: "4px 0" }}>
                <Row first />
                <Row />
                <Row />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
