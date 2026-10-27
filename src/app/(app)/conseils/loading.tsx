import { Skel } from "@/components/ui/Skeleton";
import { DARK_CARD_BG } from "@/lib/theme";

/* Squelette de Performance (2026-10-27, qualité perçue) : calqué sur ConseilsClient + TestsPanel
   (onDarkPage). Header = bandeau d'activité 49px + rangée 66px (titre « Performance » centré, sans
   capsule, profil à droite). Contenu dans .page-shell (mêmes gouttières/largeurs que la vraie page),
   posé à plat sur le fond sombre : titre de section, ligne profil, filtres en puces, verdict, bouton
   « Nouveau test », puis les lignes de tests séparées par un filet (pas de cartes). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      <div style={{ background: "rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.10)" }}>
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 10, minHeight: 48 }}>
          <Skel dark w={34} h={34} r="50%" />
          <Skel dark w={140} h={12} />
          <span style={{ flex: 1 }} />
          <Skel dark w={54} h={18} />
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "14px 16px 12px" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
          <Skel dark w={112} h={16} />
        </div>
        <div style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 40 }}>
          <div style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", boxSizing: "border-box" }} />
        </div>
      </div>

      <div className="page-shell">
        <Skel dark w={210} h={11} style={{ marginBottom: 8 }} />
        <Skel dark h={38} r={12} style={{ marginBottom: 10 }} />
        <Skel dark w={150} h={9} style={{ marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, overflow: "hidden", paddingBottom: 4, marginBottom: 12 }}>
          {[56, 96, 90, 104, 84].map((w, i) => <Skel key={i} dark w={w} h={35} r={24} />)}
        </div>
        <Skel dark w="78%" h={18} style={{ marginBottom: 6 }} />
        <Skel dark w="52%" h={18} style={{ marginBottom: 10 }} />
        <Skel dark h={62} r={12} />

        <Skel dark w={136} h={42} r={12} style={{ marginTop: 28, marginBottom: 12 }} />
        <div style={{ borderTop: "1px solid rgba(255,255,255,.10)" }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.06)", padding: "13px 2px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Skel dark w={32} h={32} r={8} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7, paddingTop: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <Skel dark w="42%" h={13} />
                  <Skel dark w={24} h={24} r="50%" />
                </div>
                <Skel dark w={90} h={9} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
