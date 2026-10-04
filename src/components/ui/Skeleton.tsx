import { DARK_CARD_BG } from "@/lib/theme";

/* Fantômes animés pendant les temps de chargement (2026-10-04, demande de Gildas : partout dans
   l'app). `Skel` = un bloc qui scintille ; `PageSkeleton` = la silhouette d'une page entière, rendue
   par les loading.tsx de chaque route (affichée tout de suite à la navigation, pendant que le serveur
   prépare la page). Rendu serveur, sans JS : animation 100 % CSS (tpc-skel sombre / tpc-skel-light clair). */

export function Skel({ w = "100%", h = 14, r = 8, dark = false, style }: { w?: number | string; h?: number | string; r?: number | string; dark?: boolean; style?: React.CSSProperties }) {
  return <div className={dark ? "tpc-skel" : "tpc-skel-light"} style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

/** Quelques lignes de texte fantômes (listes, tiroirs). */
export function SkelLines({ lines = 3, dark = false }: { lines?: number; dark?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
      {Array.from({ length: lines }, (_, i) => <Skel key={i} dark={dark} w={i === lines - 1 ? "60%" : "100%"} h={12} />)}
    </div>
  );
}

function Header({ dark }: { dark: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 16px 12px", position: "relative" }}>
      <Skel dark={dark} w={40} h={40} r="50%" />
      <Skel dark={dark} w={140} h={36} r={999} style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }} />
      <Skel dark={dark} w={110} h={42} r={999} />
    </div>
  );
}

function Card({ dark, h, children }: { dark: boolean; h?: number; children?: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 24, padding: 16, minHeight: h,
      background: dark ? "rgba(255,255,255,.055)" : "#fff", border: `1px solid ${dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.07)"}`,
      display: "flex", flexDirection: "column", gap: 12,
    }}>{children}</div>
  );
}

export type PageSkeletonVariant = "today" | "week" | "list" | "tests" | "programmes";

export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  const dark = variant !== "programmes";
  const wrap: React.CSSProperties = dark
    ? { background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }
    : { background: "#f1f0ee", minHeight: "100vh", marginBottom: -132, paddingBottom: 132 };
  const col: React.CSSProperties = { maxWidth: 1000, margin: "0 auto", padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 14 };

  if (variant === "programmes") {
    return (
      <div style={wrap} aria-busy="true" aria-label="Chargement">
        {/* En-tête sombre, comme la vraie page (titre + 3 tuiles de création). */}
        <div style={{ background: DARK_CARD_BG }}>
          <div style={{ ...col, maxWidth: 1100, padding: "22px 20px 26px" }}>
            <Skel dark w={190} h={30} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
              {[0, 1, 2].map(i => <Skel key={i} dark h={104} r={16} />)}
            </div>
          </div>
        </div>
        <div style={{ ...col, maxWidth: 1100, padding: "0 20px 24px" }}>
          <Skel w={160} h={18} style={{ marginTop: 18 }} />
          <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
            {[0, 1, 2].map(i => <Skel key={i} w="min(320px, 86%)" h={280} r={16} />)}
          </div>
          <Skel w={160} h={18} style={{ marginTop: 18 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {Array.from({ length: 8 }, (_, i) => <Skel key={i} h={130} r={20} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap} aria-busy="true" aria-label="Chargement">
      <Header dark />
      <div style={col}>
        {variant === "today" && <>
          <div style={{ display: "flex", gap: 8 }}>{[0, 1, 2, 3].map(i => <Skel key={i} dark w={80} h={30} r={999} />)}</div>
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}><Skel dark w={188} h={188} r="50%" /></div>
          <Card dark><Skel dark w="55%" h={18} /><Skel dark h={12} /><Skel dark w="80%" h={12} /></Card>
          <Card dark h={200}><Skel dark w="45%" h={18} /><Skel dark h={11} /><Skel dark h={11} /><Skel dark w="70%" h={11} /><Skel dark h={46} r={12} style={{ marginTop: "auto" }} /></Card>
        </>}
        {variant === "week" && <>
          <Skel dark w="50%" h={16} />
          <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ flex: "0 0 240px" }}>
                <Card dark h={420}><Skel dark w={60} h={60} r="50%" /><Skel dark w="70%" h={16} /><Skel dark h={90} r={16} /><Skel dark h={90} r={16} /><Skel dark h={36} r={12} /></Card>
              </div>
            ))}
          </div>
        </>}
        {variant === "list" && <>
          <div style={{ display: "flex", gap: 8 }}>{[0, 1, 2, 3, 4].map(i => <Skel key={i} dark w={84} h={34} r={999} />)}</div>
          <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
            {[0, 1, 2].map(i => <div key={i} style={{ flex: "0 0 300px" }}><Card dark h={340}><Skel dark w={150} h={150} r="50%" style={{ alignSelf: "center" }} /><Skel dark w="60%" h={16} /><Skel dark h={70} r={16} /><Skel dark h={36} r={12} /></Card></div>)}
          </div>
          {[0, 1, 2].map(i => <Card key={i} dark><div style={{ display: "flex", gap: 12, alignItems: "center" }}><Skel dark w={44} h={44} r="50%" /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Skel dark w="40%" h={14} /><Skel dark w="75%" h={11} /></div></div></Card>)}
        </>}
        {variant === "tests" && <>
          <Card dark><Skel dark w="50%" h={18} /><Skel dark h={12} /><Skel dark w="70%" h={12} /></Card>
          {[0, 1, 2, 3, 4].map(i => <Card key={i} dark><div style={{ display: "flex", justifyContent: "space-between" }}><Skel dark w="45%" h={15} /><Skel dark w={70} h={22} r={999} /></div><Skel dark h={12} r={999} /></Card>)}
        </>}
      </div>
    </div>
  );
}
