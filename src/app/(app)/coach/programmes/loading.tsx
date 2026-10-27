import { Skel } from "@/components/ui/Skeleton";
import { DARK_CARD_BG } from "@/lib/theme";

/* Squelette de la bibliothèque de programmes (2026-10-27, qualité perçue) : reprend exactement le
   1er rendu de ProgramLibraryPage (standalone) pendant son propre chargement. En-tête sombre (titre
   26/30px + sous-titre, puis les 3 tuiles de création aux mêmes paddings), zone claire #f1f0ee :
   marge 32, titre 170×18, 3 cartes de 300px (86 % de large sur mobile, un tiers dès 640px), puis les
   modèles. Identique côté sportif et coach. */
const CSS = `
.skp-h1{height:26px;width:170px}
.skp-card{width:86%}
@media (min-width:640px){
  .skp-h1{height:30px;width:196px}
  .skp-card{width:calc((100% - 28px) / 3)}
}
`;

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ background: "#f1f0ee", minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      <style>{CSS}</style>
      <div style={{ background: DARK_CARD_BG }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 26px" }}>
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skp-h1"><Skel dark w="100%" h="100%" /></div>
            <Skel dark w={250} h={13} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Skel dark w={42} h={42} r={12} style={{ marginBottom: 8 }} />
                <Skel dark w="60%" h={13} style={{ marginBottom: 5 }} />
                <Skel dark w="80%" h={10} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 24px" }}>
        <div style={{ marginTop: 32 }}>
          <Skel w={170} h={18} style={{ marginBottom: 14 }} />
          <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
            {[0, 1, 2].map(i => <div key={i} className="skp-card" style={{ flexShrink: 0 }}><Skel h={300} r={16} /></div>)}
          </div>
        </div>
        <div style={{ marginTop: 32 }}>
          <Skel w={190} h={18} style={{ marginBottom: 14 }} />
          <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
            {[0, 1, 2].map(i => <div key={i} className="skp-card" style={{ flexShrink: 0 }}><Skel h={220} r={16} /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
