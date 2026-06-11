export default function ProgramNotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏃</div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: "#171b1f", marginBottom: 8 }}>
          Ce programme n&apos;est plus disponible
        </div>
        <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.6, marginBottom: 28 }}>
          Le coach a peut-être désactivé le partage, ou ce lien n&apos;est plus valide.
        </div>
        <a
          href="/register"
          style={{ display: "inline-block", padding: "13px 28px", borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 800, textDecoration: "none", fontSize: 15 }}
        >
          Créer un compte →
        </a>
      </div>
    </div>
  );
}
