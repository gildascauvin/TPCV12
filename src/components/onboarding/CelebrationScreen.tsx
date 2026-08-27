"use client";

import { useState } from "react";
import { COACH_UNLIMITED_ATHLETES_PITCH } from "@/lib/primingCopy";
import WellnessRing from "@/components/wellness/WellnessRing";
import Actions from "@/components/onboarding/Actions";

type Role = "athlete" | "coach";

/* Mêmes calculs que ProgramAssignModal.tsx (3 raccourcis identiques) — pas partagés entre les 2
   fichiers, même choix déjà fait ailleurs dans ce repo pour ce genre de petit helper de date. */
function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function getAthletePreviews(sport: string) {
  return [
    { emoji: "🏃", title: "Ta séance du jour, ajustée à ta forme" },
    { emoji: "📅", title: sport ? `Ton programme ${sport}, semaine par semaine` : "Ton programme, semaine par semaine" },
    { emoji: "📊", title: "Tes données de performance en un coup d'œil" },
  ];
}

function getCoachPreviews(sport: string) {
  return [
    { emoji: "👥", title: "Le niveau de forme de chaque sportif" },
    { emoji: "📋", title: sport ? `Un programme ${sport} prêt à assigner` : "Un programme prêt à assigner" },
    { emoji: "🎯", title: "Le lien coach-sportif centralisé" },
  ];
}

interface Props {
  role: Role;
  name: string;
  sport: string;
  claimedProgramName?: string | null;
  claimedProgramWeeks?: number | null;
  /* Sportif (claimé ou non — même écran pour les deux depuis le 2026-08-27, voir OnboardingFlow.tsx)
     — remplace le bloc score wellness (retiré, déjà montré à l'étape décision juste avant). */
  showDatePicker: boolean;
  startDate: string;
  onStartDateChange: (date: string) => void;
  /* Sportif uniquement — toggle actif par défaut, contrôlé par le parent (même pattern que
     startDate/onStartDateChange) : la vraie demande de permission (Notification.requestPermission)
     ne part qu'au clic sur le CTA principal si le toggle est encore activé à ce moment-là, jamais
     au montage — ne change jamais la destination du CTA (wellness_q reste obligatoire quoi qu'il
     arrive). undefined = rien affiché (coach). */
  pushEnabled?: boolean;
  onPushEnabledChange?: (enabled: boolean) => void;
  /* Coach uniquement — formulaire d'invitation composé dans OnboardingFlow.tsx (tout son state y
     vit déjà), inséré tel quel plutôt que de faire remonter une dizaine de props individuelles. */
  coachInviteSlot?: React.ReactNode;
  nextLabel: string;
  onSkip?: () => void;
  skipLabel?: string;
  saving: boolean;
  /* Le paiement a déjà eu lieu avant cet écran (paywall_priming/paywall_form précèdent
     désormais celebration) — ce CTA avance simplement vers l'activation, il ne déclenche plus
     le paywall. */
  onNext: () => void;
}

export default function CelebrationScreen({
  role, name, sport,
  claimedProgramName, claimedProgramWeeks,
  showDatePicker, startDate, onStartDateChange, pushEnabled, onPushEnabledChange, coachInviteSlot,
  nextLabel, onSkip, skipLabel, saving, onNext,
}: Props) {
  const previews = role === "coach" ? getCoachPreviews(sport) : getAthletePreviews(sport);
  const monNext = nextMonday();
  const dateOptions = [
    { label: "Lundi prochain", value: monNext },
    { label: "Dans 2 sem.", value: addWeeks(monNext, 2) },
    { label: "Dans 1 mois", value: addWeeks(monNext, 4) },
  ];
  const [otherOpen, setOtherOpen] = useState(() => !dateOptions.some(o => o.value === startDate));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{
        position: "relative", width: "100%", maxWidth: 420, maxHeight: "92vh",
        borderRadius: 30, boxShadow: "0 42px 120px rgba(0,0,0,.34)",
        background: "#161616",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
      <div style={{ overflowY: "auto", overflowX: "hidden", padding: 28 }}>
        <div style={{ position: "absolute", right: "-10%", top: "-10%", width: 260, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(36px)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2 }}>
          {/* Header */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", color: "#ff6b2b", textTransform: "uppercase", marginBottom: 14 }}>
            ✦ Bienvenue
          </div>
          <div style={{ fontSize: 26, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.15, marginBottom: 22 }}>
            {name ? `Bienvenue, ${name} ! 🎉` : "Bienvenue ! 🎉"}
          </div>

          {/* Choix de date de départ (sportif, claimé ou non) — remplace le score wellness, déjà
              montré à l'étape décision juste avant. Même mécanisme que ProgramAssignModal en
              self-assign, l'écriture réelle part à la fin de wellness_q (voir OnboardingFlow.tsx,
              finishAthleteActivation). */}
          {showDatePicker && (
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 15px", marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 3 }}>Choisis ton départ</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 13 }}>
                Tu pourras toujours changer cette date depuis ton programme.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7, marginBottom: 9 }}>
                {dateOptions.map(opt => {
                  const selected = !otherOpen && startDate === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setOtherOpen(false); onStartDateChange(opt.value); }}
                      style={{
                        appearance: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "center",
                        borderRadius: 12, padding: "9px 6px 8px",
                        border: selected ? "1.5px solid #f04a08" : "1.5px solid rgba(255,255,255,0.14)",
                        background: selected ? "rgba(240,74,8,0.14)" : "rgba(255,255,255,0.04)",
                        color: "#fff",
                      }}
                    >
                      <span style={{ display: "block", fontSize: 11, fontWeight: 800, marginBottom: 2 }}>{opt.label}</span>
                      <span style={{ display: "block", fontSize: 10, color: selected ? "rgba(255,197,163,0.9)" : "rgba(255,255,255,0.5)" }}>{fmtDate(opt.value)}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setOtherOpen(o => !o)}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11.5, fontWeight: 700, textAlign: "left", padding: "6px 2px",
                  color: "rgba(255,255,255,0.6)", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.25)", textUnderlineOffset: 2,
                }}
              >
                {otherOpen ? "Utiliser une date suggérée" : "Choisir une autre date"}
              </button>
              {otherOpen && (
                <input
                  type="date"
                  value={startDate}
                  onChange={e => onStartDateChange(e.target.value)}
                  style={{
                    width: "100%", marginTop: 8, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.16)",
                    borderRadius: 10, padding: "9px 10px", color: "#fff", fontFamily: "inherit", fontSize: 13, colorScheme: "dark",
                  }}
                />
              )}
            </div>
          )}

          {/* Rappel notif (sportif) — toggle actif par défaut (voir pushEnabled dans OnboardingFlow),
              même style que NotificationToggle.tsx (/profil). Un seul bouton affirmatif sans façon
              de dire "non" pouvait donner l'impression d'être obligatoire, même si ignorer le
              bouton fonctionnait déjà (retour de Gildas, 2026-08-27) — le toggle rend le refus
              aussi visible/facile que l'acceptation. */}
          {onPushEnabledChange && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "11px 14px", marginBottom: 18 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>🔔</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.8)", flex: 1 }}>Reçois un rappel chaque jour</span>
              <button
                type="button"
                onClick={() => onPushEnabledChange(!pushEnabled)}
                aria-pressed={!!pushEnabled}
                style={{
                  width: 46, height: 28, borderRadius: 999, border: "none", flexShrink: 0, cursor: "pointer",
                  padding: 3, background: pushEnabled ? "#f04a08" : "rgba(255,255,255,0.14)",
                  transition: "background .2s", position: "relative",
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                  transform: pushEnabled ? "translateX(18px)" : "translateX(0)", transition: "transform .2s",
                }} />
              </button>
            </div>
          )}

          {/* Capacité illimitée (coach) */}
          {role === "coach" && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
              <WellnessRing dark infinite score={null} size={64} strokeWidth={6} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Sportifs illimités</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                  {COACH_UNLIMITED_ATHLETES_PITCH}
                </div>
              </div>
            </div>
          )}

          {/* Formulaire d'invitation (coach) — composé dans OnboardingFlow.tsx */}
          {coachInviteSlot}

          {/* Programme claimé */}
          {claimedProgramName && (
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
                Ton programme
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.35 }}>
                {claimedProgramName}
              </div>
              {claimedProgramWeeks && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                  {claimedProgramWeeks} semaines, prêt à démarrer
                </div>
              )}
            </div>
          )}

          {/* Aperçus */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
              Ton espace est prêt
            </div>
            <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, overflow: "hidden" }}>
              {previews.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                  <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: "center" }}>{p.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.82)", lineHeight: 1.35 }}>{p.title}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

        {/* CTA */}
        <Actions variant="modal-dark" onNext={onNext} nextDisabled={saving} nextLabel={nextLabel} onSkip={onSkip} skipLabel={skipLabel} />
      </div>
    </div>
  );
}
