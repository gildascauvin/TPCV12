import { Skel } from "@/components/ui/Skeleton";
import { DARK_CARD_BG } from "@/lib/theme";

/* Squelette de Performance côté coach (2026-10-27, qualité perçue) : calqué sur le 1er rendu
   d'AthletesClient (vue Groupe). Barre des sportifs en puces puis rangée de date 66px, toutes deux
   centrées sur contentMaxWidth (600/720/1000) ; liste dans .page-shell : une carte translucide par
   sportif (rayon 16, padding 18, liseré gauche 3px), anneau 52px + nom, puis l'encart verdict. */
const CSS = `
.ska-max{max-width:600px;margin:0 auto}
.ska-date{width:112px}
@media (min-width:640px){.ska-max{max-width:720px}.ska-date{width:150px}}
@media (min-width:1024px){.ska-max{max-width:1000px}}
`;

const PILL = { borderRadius: 999, border: "1.5px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.07)", boxSizing: "border-box" as const, flexShrink: 0, display: "flex", alignItems: "center", gap: 7 };

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      <style>{CSS}</style>

      <div style={{ background: "rgba(10,14,18,.72)", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "12px 16px" }}>
        <div className="ska-max" style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

      <div className="ska-max" style={{ position: "relative", display: "flex", alignItems: "center", padding: "14px 16px 12px" }}>
        <div className="ska-date" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", height: 36, borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Skel dark w="55%" h={12} />
        </div>
        <div style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 40 }}>
          <div style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", boxSizing: "border-box" }} />
        </div>
      </div>

      <div className="page-shell">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderLeft: "3px solid #8a8f94", borderRadius: 16, padding: 18, boxShadow: "0 10px 26px rgba(0,0,0,.22)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <Skel dark w={52} h={52} r="50%" />
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <Skel dark w="38%" h={16} />
                  <Skel dark w={38} h={14} r={999} />
                </div>
                <Skel dark w={10} h={14} r={4} />
              </div>
              <Skel dark h={58} r={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
