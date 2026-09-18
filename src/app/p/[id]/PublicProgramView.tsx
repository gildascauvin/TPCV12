"use client";

import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import type { Program, SessionTemplate, WeekTemplate } from "@/types";
import { SessionTemplateCard, avgWeekRpe, loadBarColor } from "@/components/programs/SessionTemplateCard";
import { loadRule, ruleTagColors } from "@/lib/loadRule";
import AlertBox from "@/components/calendar/AlertBox";
import { computeAutoregSuggestion, suggestionSeverityColor, autoregHeadline, autoregAdvice, formatAutoregPct } from "@/lib/autoregulation";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { WELLNESS_RAMP } from "@/lib/wellness";
import WellnessRing from "@/components/wellness/WellnessRing";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_NAMES: Record<string, string> = { Lun: "Lundi", Mar: "Mardi", Mer: "Mercredi", Jeu: "Jeudi", Ven: "Vendredi", Sam: "Samedi", Dim: "Dimanche" };
// Même rampe que WellnessRing/wellnessColor (wellness.ts) — la jauge horizontale du simulateur
// reste visuellement identique au ring, jamais une couleur dupliquée à l'œil.
const WELLNESS_TRACK_GRADIENT = `linear-gradient(to right, ${WELLNESS_RAMP.map(s => `${s.hex} ${s.stop * 100}%`).join(", ")})`;

interface Props {
  program: Program;
  coachName: string | null;
}

export default function PublicProgramView({ program, coachName }: Props) {
  const { isMd } = useBreakpoint();
  const [weekIdx, setWeekIdx] = useState(0);
  const [userMode, setUserMode] = useState<"coach" | "athlete" | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Repli manuel si le copier-coller échoue — arrive systématiquement dans les iframes WordPress
  // (Clipboard API bloquée par la Permissions Policy tant que l'iframe n'a pas `allow="clipboard-write"`,
  // ce qui n'est jamais posé côté WP). L'ancien code avalait l'erreur (`.catch(() => {})`) et affichait
  // quand même "✓ Copié" — faux positif signalé par Gildas, rien n'était réellement copié dans ce cas.
  const [linkCopyFallback, setLinkCopyFallback] = useState(false);
  /* Aperçu autorégulation touchable (2026-09) — remplace le bandeau statique envisagé un temps
     (callout scientifique, abandonné) : un seul slider pilote TOUS les jours de la semaine
     affichée, via la vraie computeAutoregSuggestion() (autoregulation.ts) — aucun jour choisi à
     l'avance, exactement les mêmes seuils/paliers que /today, Coach Control et Planning. 72 =
     valeur de départ neutre ("Normal"), pas un score réel (visiteur anonyme, aucun historique). */
  const [simScore, setSimScore] = useState(72);
  const [sliderTracked, setSliderTracked] = useState(false);

  async function handleCopyLink() {
    posthog.capture("program_cta_clicked", {
      program_id: program.id,
      program_name: program.name,
      cta: "copy_share_link",
      is_embedded: isEmbedded,
    });
    const url = window.location.href;
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch { /* Permissions Policy bloquée (iframe) ou API absente — repli ci-dessous */ }
    if (!copied) {
      // execCommand est déprécié mais reste le seul mécanisme de copie fiable dans une iframe
      // cross-origin sans `allow="clipboard-write"` (pas soumis à la même Permissions Policy).
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { /* voir repli manuel ci-dessous */ }
    }
    if (copied) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } else {
      // Ni l'API moderne ni execCommand n'ont fonctionné — on ne prétend plus avoir copié quoi que
      // ce soit, on affiche le lien en clair, sélectionné, pour un copier-coller manuel (Ctrl/Cmd+C).
      setLinkCopyFallback(true);
    }
  }

  useEffect(() => {
    let embedded = false;
    try { embedded = window.self !== window.top; } catch { embedded = true; }
    setIsEmbedded(embedded);
    posthog.capture("program_page_viewed", {
      program_id: program.id,
      program_name: program.name,
      is_embedded: embedded,
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("mode").eq("user_id", user.id).single();
      if (data?.mode) setUserMode(data.mode as "coach" | "athlete");
    });
  }, []);

  async function handleClaimConnected() {
    posthog.capture("program_cta_clicked", {
      program_id: program.id,
      program_name: program.name,
      cta: "add_to_library",
      is_embedded: isEmbedded,
    });
    setClaiming(true);
    try {
      const res = await fetch("/api/programs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: program.id }),
      });
      if (res.ok) {
        posthog.capture("program_claimed", {
          program_id: program.id,
          program_name: program.name,
          user_mode: userMode,
          is_embedded: isEmbedded,
        });
        setClaimed(true);
        setTimeout(() => {
          const dest = userMode === "coach" ? "/coach/planning" : "/today";
          if (isEmbedded) window.open(dest, "_blank");
          else window.location.href = dest;
        }, 1200);
      }
    } finally {
      setClaiming(false);
    }
  }

  function handleClaimGuest() {
    posthog.capture("program_cta_clicked", {
      program_id: program.id,
      program_name: program.name,
      cta: "personalize",
      is_embedded: isEmbedded,
    });
    if (typeof window !== "undefined") {
      localStorage.setItem("claim_program_id", program.id);
    }
    /* claim aussi passé en query param (pas seulement localStorage) : quand isEmbedded ouvre la
       destination dans un nouvel onglet (window.open), ce nouvel onglet est un contexte de storage
       potentiellement différent (repéré sur Safari iOS via une iframe WordPress) — le localStorage
       posé ci-dessus peut ne jamais y être visible. OnboardingFlow.tsx lit déjà ?claim= en priorité
       (même mécanisme que le CTA flottant WP) et le reporte lui-même en localStorage une fois là.
       Plus de ?role= : le choix du rôle se fait désormais sur l'écran dédié de l'onboarding
       (voir OnboardingFlow.tsx) — le pré-remplir depuis ce lien convertissait nettement moins bien
       que le demander explicitement, mesuré sur ce même canal (34,6% vs 65,0%). */
    const dest = `/register?claim=${encodeURIComponent(program.id)}`;
    if (isEmbedded) window.open(dest, "_blank");
    else window.location.href = dest;
  }

  const weekAvgLoads = program.template.weeks.map(w => avgWeekRpe(w as WeekTemplate));
  const maxAvgLoad = Math.max(...weekAvgLoads, 0.01);
  const week = program.template.weeks[weekIdx] ?? {};
  const isLocked = weekIdx > 0 && userMode === null;

  /* Baseline synthétique (2026-09) — même fonction que TOUTES les autres surfaces démo/fictives de
     l'app (sandbox, sportifs démo coach, onboarding) : construit un historique de 42 jours
     convergeant vers le score simulé, pour disposer du vrai vocabulaire de zone ("Fatigué/
     Équilibré/Frais", relativeZoneLabel) et du vrai seuil critique Z_SEVERE dans
     computeAutoregSuggestion — pas seulement le garde-fou absolu score<40. `program.id` sert
     d'ownerId (aucun effet fonctionnel, juste un seed stable par programme). */
  const simBaseline = syntheticBaselineFor(simScore, program.id);
  const simDisplayScore = simBaseline?.relativeScore ?? simScore;
  const simZoneLabel = relativeZoneLabel(simBaseline);

  /* Une évaluation par jour, sur la séance la plus dure du jour (même convention que /today —
     "séance non terminée à la plus haute difficulté prévue") — jamais un jour choisi à l'avance.
     Recalculé à chaque déplacement du slider, sur la semaine actuellement affichée (weekIdx). */
  const daySuggestions = DAYS.map(day => {
    const daySessions = (week[day] ?? []) as SessionTemplate[];
    if (!daySessions.length) return { day, targetSession: null, suggestion: null };
    const targetSession = daySessions.reduce((a, b) => (b.target_difficulty ?? 0) > (a.target_difficulty ?? 0) ? b : a);
    const suggestion = computeAutoregSuggestion(simScore, targetSession.target_difficulty ?? null, simBaseline);
    return { day, targetSession, suggestion };
  });
  const impactedDays = daySuggestions.filter((d): d is typeof d & { suggestion: NonNullable<typeof d.suggestion> } => !!d.suggestion);

  function handleSliderChange(v: number) {
    setSimScore(v);
    if (!sliderTracked) {
      setSliderTracked(true);
      posthog.capture("program_preview_slider_used", { program_id: program.id, program_name: program.name, is_embedded: isEmbedded });
    }
  }

  /* Bandeau autorégulation — déplacé dans la zone scrollable, sous les onglets de semaine/barres de
     charge (2026-09, retour explicite : "sur mobile on voit pas le programme car la zone du haut
     sticky est trop grande"). N'est plus fixé en permanence au-dessus du calendrier (Topbar + onglets
     restent seuls fixes) — défile avec les jours plutôt que de leur manger de la hauteur d'écran. */
  const autoregBanner = (
    <div style={{ margin: "10px 16px 14px", background: "linear-gradient(135deg,#161616,#282828 64%,#111)", borderRadius: 18, padding: "14px 16px", color: "#fff", position: "relative", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", right: -40, top: -40, width: 130, height: 130, borderRadius: "50%", background: "rgba(212,64,0,.16)", filter: "blur(24px)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: isMd ? "row" : "column", alignItems: isMd ? "center" : "stretch", gap: isMd ? 20 : 14 }}>

        {/* Pitch — 50/50 avec le simulateur en desktop. */}
        <div style={{ flex: isMd ? "1 1 50%" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.01em" }}>Programme autorégulé</h3>
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>
            Chaque jour, ThePerfClub compare ta forme à la séance prévue et te propose de l&apos;ajuster pour progresser mieux, plus longtemps et loin des blessures.
          </div>
        </div>

        {/* Simulateur — encadré (comme le POC), ring + vrai vocabulaire de zone (Fatigué/
            Équilibré/Frais), titre à gauche / score à droite (hiérarchie du POC Grok). */}
        <div style={{ flex: isMd ? "1 1 50%" : undefined, minWidth: 0, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "13px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,.65)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Simule ta forme
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{simZoneLabel}</div>
              <WellnessRing score={simDisplayScore} size={50} strokeWidth={5} dark />
            </div>
          </div>

          <input
            type="range" min={0} max={100} value={simScore}
            onChange={e => handleSliderChange(parseInt(e.target.value, 10))}
            className="tpc-autoreg-slider"
            style={{ width: "100%", height: 7, borderRadius: 4, WebkitAppearance: "none", appearance: "none", background: WELLNESS_TRACK_GRADIENT, outline: "none", cursor: "pointer" }}
          />
          <style>{`
            .tpc-autoreg-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #d44000; box-shadow: 0 2px 6px rgba(0,0,0,.3); cursor: grab; }
            .tpc-autoreg-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #d44000; box-shadow: 0 2px 6px rgba(0,0,0,.3); cursor: grab; }
          `}</style>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <span>Fatigué</span>
            <span>Frais</span>
          </div>

          <div style={{ marginTop: 9, fontSize: 12.5, color: "rgba(255,255,255,.9)", lineHeight: 1.45 }}>
            {!impactedDays.length ? (
              "Aucun écart marqué : la semaine reste comme prévu."
            ) : (
              <>
                {impactedDays.some(d => d.suggestion.icon === "🚨") ? "🚨" : impactedDays[0].suggestion.icon}{" "}
                {impactedDays[0].suggestion.dir === "low" ? "Alléger" : "Augmenter la charge"} recommandé sur{" "}
                {impactedDays.map((d, i) => (
                  <span key={d.day}>{i > 0 && ", "}<b>{DAY_NAMES[d.day]}</b></span>
                ))}.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f1f0ee", display: "flex", flexDirection: "column" }}>

      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isEmbedded && <a href="/" style={{ color: "#8a8f94", fontSize: 20, textDecoration: "none", padding: "4px 6px" }}>←</a>}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {program.name}
            </div>
            {coachName && (
              <div style={{ fontSize: 11, color: "#8a8f94", lineHeight: 1 }}>par {coachName}</div>
            )}
          </div>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={handleCopyLink}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              padding: "7px 12px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${linkCopied ? "#d44000" : "rgba(0,0,0,.10)"}`,
              background: linkCopied ? "rgba(212,64,0,0.06)" : "#fff",
              color: linkCopied ? "#d44000" : "#8a8f94", fontSize: 13, fontWeight: 700,
            }}
          >
            {linkCopied ? "✓ Copié" : "🔗 Partager"}
          </button>
          {linkCopyFallback && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 20, background: "#fff", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.18)", padding: 12, width: 260 }}>
              <div style={{ fontSize: 11, color: "#8a8f94", marginBottom: 6 }}>Copie manuelle (Ctrl/Cmd+C) :</div>
              <input
                readOnly
                value={typeof window !== "undefined" ? window.location.href : ""}
                onFocus={e => e.currentTarget.select()}
                autoFocus
                style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid rgba(0,0,0,.10)", borderRadius: 8, padding: "6px 8px", fontSize: 12, color: "#171b1f" }}
              />
              <button
                onClick={() => setLinkCopyFallback(false)}
                style={{ marginTop: 8, background: "none", border: "none", color: "#8a8f94", fontSize: 11, cursor: "pointer", padding: 0 }}
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Week tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", padding: "0 18px", display: "flex", alignItems: "flex-end", height: 56, gap: 0, overflowX: "auto", flexShrink: 0 }}>
        {program.template.weeks.map((_, i) => {
          const avg = weekAvgLoads[i];
          const barH = Math.max(4, Math.round((avg / maxAvgLoad) * 26));
          const isActive = i === weekIdx;
          return (
            <div
              key={i}
              onClick={() => setWeekIdx(i)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, padding: "0 4px 8px", borderBottom: isActive ? "2.5px solid #d44000" : "2.5px solid transparent", flexShrink: 0, cursor: "pointer" }}
            >
              <div style={{ width: 18, height: barH, borderRadius: "2px 2px 0 0", background: loadBarColor(avg), opacity: isActive ? 1 : 0.55 }} />
              <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 500, color: isActive ? "#171b1f" : "#8a8f94", padding: "0 4px" }}>S{i + 1}</span>
            </div>
          );
        })}
      </div>

      {/* 7-column grid — same layout as planning. Bandeau autorégulation + grille des jours dans un
          même wrapper vertical scrollable (le bandeau défile avec le contenu, seule la grille elle-
          même scrolle horizontalement pour les 7 colonnes). */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <div style={{ height: "100%", overflowY: "auto", scrollbarWidth: "thin" }}>
      {autoregBanner}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, var(--wk-col, 240px))",
        alignItems: "start",
        gap: 10,
        overflowX: "auto",
        padding: "0 16px 18px",
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
        filter: isLocked ? "blur(7px)" : "none",
        pointerEvents: isLocked ? "none" : "auto",
        userSelect: isLocked ? "none" : "auto",
      }}>
        {DAYS.map((day, dayIdx) => {
          const daySessions = (week[day] ?? []) as SessionTemplate[];
          const prevSess = (week[DAYS[dayIdx - 1]] ?? []) as SessionTemplate[];
          const nextSess = (week[DAYS[dayIdx + 1]] ?? []) as SessionTemplate[];
          const ctx = {
            prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
            nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
          };
          const rule = loadRule(daySessions.map(s => ({ target_difficulty: s.target_difficulty })), ctx);
          const tagColor = ruleTagColors[rule.cls];
          const { suggestion, targetSession } = daySuggestions[dayIdx];
          const severityColor = suggestion ? suggestionSeverityColor(suggestion) : null;
          return (
            <div key={day} style={{ background: "#fff", borderRadius: 26, border: "1px solid rgba(0,0,0,.08)", padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.05)", scrollSnapAlign: "start" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>{day}</div>
              </div>

              {suggestion && targetSession ? (
                <AlertBox
                  variant="light"
                  alert={{
                    border: `${severityColor}40`, glow: severityColor!,
                    text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, targetSession.target_difficulty ?? 6)}`,
                  }}
                />
              ) : (daySessions.length > 0 || rule.cls !== "rest") && (
                <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>{rule.tag}</div>
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
                </div>
              )}

              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
                Séances · {daySessions.length}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {daySessions.length === 0 && (
                  <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
                    Repos / libre
                  </div>
                )}
                {daySessions.map((s, sIdx) => {
                  const isTarget = suggestion && s === targetSession;
                  return (
                    <SessionTemplateCard
                      key={sIdx}
                      session={s}
                      gaugeOverride={isTarget ? adjustDifficulty(s.target_difficulty ?? 6, suggestion.reco) : undefined}
                      badgeOverride={isTarget ? { label: formatAutoregPct(suggestion.reco), bg: `${severityColor}22`, color: severityColor! } : undefined}
                      renderExerciseLine={isTarget ? (line, li) => {
                        const modified = parseAndApply(line, suggestion.reco);
                        const changed = modified !== line;
                        return (
                          <div style={{ padding: "6px 9px", borderTop: li > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                            {changed && (
                              <div style={{ fontSize: 9.5, lineHeight: 1.3, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1 }}>
                                {line}
                              </div>
                            )}
                            <div style={{ fontSize: 11, lineHeight: 1.4, color: changed ? "#d44000" : "#2c3236", fontWeight: changed ? 800 : 600 }}>
                              {modified}
                            </div>
                          </div>
                        );
                      } : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {isLocked && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(241,240,238,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "22px 26px", maxWidth: 300, textAlign: "center", boxShadow: "0 12px 32px rgba(0,0,0,.14)", border: "1px solid rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1.3, marginBottom: 16 }}>
              Obtenir le programme complet et le personnaliser
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => handleClaimGuest()}
                style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.20)" }}
              >
                Personnaliser ce programme →
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Bottom CTA */}
      <div style={{ background: "#fff", borderTop: "1px solid rgba(0,0,0,.08)", padding: "12px 18px 20px", display: "flex", justifyContent: "center", gap: 10, flexShrink: 0 }}>
        {claimed ? (
          <div style={{ flex: 1, textAlign: "center", padding: "14px 0", fontSize: 15, fontWeight: 800, color: "#2f9e44" }}>
            ✓ Programme ajouté à ta bibliothèque !
          </div>
        ) : userMode !== null ? (
          <button
            onClick={handleClaimConnected}
            disabled={claiming}
            style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: claiming ? "#e8e4df" : "linear-gradient(180deg,#f04a08,#d44000)", color: claiming ? "#aaa" : "#fff", fontWeight: 700, fontSize: 13, cursor: claiming ? "not-allowed" : "pointer", boxShadow: claiming ? "none" : "0 4px 12px rgba(212,64,0,.20)" }}
          >
            {claiming ? "Ajout en cours…" : "📚 Ajouter à ma bibliothèque →"}
          </button>
        ) : (
          <div style={{ width: isMd ? undefined : "100%", display: "flex", flexDirection: isMd ? "row" : "column", alignItems: "center", justifyContent: "center", gap: isMd ? 16 : 10 }}>
            <div style={{ maxWidth: isMd ? 380 : undefined, fontSize: 12.5, color: "#8a8f94", lineHeight: 1.4, textAlign: isMd ? "left" : "center" }}>
              <b style={{ display: "block", color: "#171b1f", marginBottom: 1 }}>Progresse mieux, loin des blessures.</b>
              Personnalise ce programme et active l&apos;autorégulation.
            </div>
            <button
              onClick={() => handleClaimGuest()}
              style={{ width: isMd ? undefined : "100%", flexShrink: 0, padding: "13px 20px", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.20)", whiteSpace: "nowrap" }}
            >
              Personnaliser ce programme →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
