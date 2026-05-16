"use client";

interface Props {
  onClose: () => void;
}

export default function ReviewCompleteModal({ onClose }: Props) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 30, padding: 32, width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "linear-gradient(135deg,#eef8f1,#d4f0dc)",
          border: "1.5px solid rgba(47,158,68,.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
          fontSize: 30, color: "#2f9e44", fontWeight: 900,
        }}>
          ✓
        </div>
        <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 12, lineHeight: 1.2 }}>
          Revue terminée
        </div>
        <div style={{ fontSize: 15, color: "#687075", lineHeight: 1.6, marginBottom: 28 }}>
          Vous avez passé en revue tous les athlètes ayant eu besoin d'attention aujourd'hui.
        </div>
        <button
          onClick={onClose}
          style={{ width: "100%", height: 52, borderRadius: 16, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
        >
          Retour au Mission Control
        </button>
      </div>
    </div>
  );
}
