"use client";

import DiffGauge from "@/components/calendar/DiffGauge";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import SparkLineClient, { FORM_ZONES } from "@/components/conseils/SparkLineClient";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import { METRIC_DEFINITIONS } from "@/lib/fatigueSignature";
import type { ShareResourceType } from "@/lib/share";
import { ShareRing, ShareChip, ShareExerciseList, type ShareBehavior } from "./ShareCardParts";

/* Rendu public de /share/[id] — un snapshot figé au moment du partage (jamais un pointeur live
   vers la ligne source), aucune notion de connecté/non-connecté (décision explicite, aucune donnée
   sensible dans ces 5 types). Charge/Récupération réutilisent directement ZoneSparkline/
   SparkLineClient/ZoneBadge — les vrais composants de /conseils, pas une réinvention simplifiée :
   ce sont eux qui portent déjà les bandes de zone, labels de jour et légendes (définition au tap
   sur chaque badge), donc le partage reste lisible sans le contexte de l'app autour. "use client"
   nécessaire pour ces 3 composants (tooltips/hover). */

interface Badge { key: string; label: string; color: string }

function BadgeRow({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
      {badges.map((b, i) => (
        <ZoneBadge key={i} label={b.label} color={b.color} definition={METRIC_DEFINITIONS[b.key as keyof typeof METRIC_DEFINITIONS]} size="sm" />
      ))}
    </div>
  );
}

function Card({ children, dark, maxWidth = 460 }: { children: React.ReactNode; dark?: boolean; maxWidth?: number }) {
  return (
    <div style={{
      borderRadius: 26, padding: 22, maxWidth, margin: "0 auto",
      background: dark ? "linear-gradient(145deg,#1a1a1a,#282828)" : "#fff",
      color: dark ? "#fff" : "#171b1f",
      boxShadow: "0 24px 60px rgba(0,0,0,.14)",
      border: dark ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(0,0,0,.06)",
    }}>
      {children}
    </div>
  );
}

export default function ShareView({ resourceType, snapshot }: { resourceType: ShareResourceType; snapshot: Record<string, unknown> }) {
  const s = snapshot as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  return (
    <div style={{ minHeight: "100vh", background: "#f1f0ee", padding: "40px 16px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 22 }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(180deg,#f04a08,#d44000)" }} />
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f" }}>ThePerfClub</span>
      </div>

      {resourceType === "wellness" && (
        <Card dark>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <ShareRing score={s.score ?? null} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", color: "#ff8a55", textTransform: "uppercase", marginBottom: 4 }}>Score &amp; conseils</div>
              <div style={{ fontSize: 26, fontWeight: 1000, letterSpacing: "-0.035em" }}>{s.zoneLabel}</div>
              {Array.isArray(s.behaviors) && s.behaviors.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {s.behaviors.map((b: ShareBehavior, i: number) => <ShareChip key={i} b={b} />)}
                </div>
              )}
            </div>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "14px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", color: "#ff8a55", textTransform: "uppercase", marginBottom: 10 }}>✦ Conseils</div>
          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: "rgba(255,255,255,.6)", textTransform: "uppercase", marginBottom: 4 }}>⚡ Entraînement</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{s.trainingAdvice}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: "rgba(255,255,255,.6)", textTransform: "uppercase", marginBottom: 4 }}>🌿 Récupération</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{s.recoveryAdvice}</div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 14, textAlign: "center" }}>Partagé par {s.authorName}</div>
        </Card>
      )}

      {resourceType === "session" && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 19, fontWeight: 1000, letterSpacing: "-0.03em" }}>{s.name}</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: s.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,.1)", color: s.done ? "#2f9e44" : "#d44000" }}>
              {s.done ? "Terminé" : "Prévu"}
            </span>
          </div>
          {s.difficulty != null && <div style={{ marginBottom: 14 }}><DiffGauge value={s.difficulty} height={10} /></div>}
          <ShareExerciseList exercises={s.exercises ?? []} />
          <div style={{ fontSize: 11, color: "#9a9ea1", marginTop: 14, textAlign: "center" }}>Partagé par {s.authorName}</div>
        </Card>
      )}

      {resourceType === "charge" && (
        <Card dark>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", marginBottom: 8 }}>⚡ Charge</div>
          <BadgeRow badges={s.badges ?? []} />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5, marginBottom: 14 }}>{s.insight}</div>
          <ZoneSparkline points={s.points ?? []} dates={s.dates ?? []} loads={s.loads} monotony={s.monotony} strain={s.strain} height={168} weekLabels={s.weekLabels} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 16, textAlign: "center" }}>Partagé par {s.authorName ?? "un membre ThePerfClub"}</div>
        </Card>
      )}

      {resourceType === "recuperation" && (
        <Card dark>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", marginBottom: 8 }}>🌿 Récupération</div>
          <BadgeRow badges={s.badges ?? []} />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5, marginBottom: 14 }}>{s.insight}</div>
          <SparkLineClient
            points={s.points ?? []} dates={s.dates ?? []} color={s.color ?? "#7fa8ea"}
            maxVal={100} height={168} metricType="recovery" uid="share-recuperation" chartType="line" sequentialFill
            points2={s.points2} points2Raw={s.points2Raw} zones2={FORM_ZONES}
            weekLabels={s.weekLabels}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", fontStyle: "italic", textAlign: "right", marginTop: 4 }}>
            Dégradé bleu = récupération (clair = en forme) · Pointillé coloré = Forme
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 12, textAlign: "center" }}>Partagé par {s.authorName ?? "un membre ThePerfClub"}</div>
        </Card>
      )}

      {resourceType === "signature" && (
        <Card dark maxWidth={620}>
          {s.insight && (
            <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "13px 15px", fontSize: 14, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600, marginBottom: 20 }}>
              {s.emoji} {s.action && <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", color: "#ff8a55" }}>{s.action} — </span>}{s.insight}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", marginBottom: 8 }}>⚡ Charge</div>
          <ZoneSparkline points={s.chargePoints ?? []} dates={s.dates ?? []} loads={s.chargeLoads} monotony={s.chargeMonotony} strain={s.chargeStrain} height={150} weekLabels={s.weekLabels} />
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", margin: "20px 0 8px" }}>🌿 Récupération</div>
          <SparkLineClient
            points={s.recoveryPoints ?? []} dates={s.dates ?? []} color={s.recoveryColor ?? "#7fa8ea"}
            maxVal={100} height={150} metricType="recovery" uid="share-signature" chartType="line" sequentialFill
            points2={s.recoveryPoints2} zones2={FORM_ZONES}
            weekLabels={s.weekLabels}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 16, textAlign: "center" }}>Partagé par {s.authorName ?? "un membre ThePerfClub"}</div>
        </Card>
      )}

      {resourceType === "coach_athlete" && (
        <Card dark>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
            <ShareRing score={s.score ?? null} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", color: "#ff8a55", textTransform: "uppercase", marginBottom: 4 }}>Coach control</div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em" }}>{s.athleteName}</div>
              {Array.isArray(s.behaviors) && s.behaviors.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {s.behaviors.map((b: ShareBehavior, i: number) => <ShareChip key={i} b={b} />)}
                </div>
              )}
            </div>
          </div>
          <div style={{
            borderRadius: 14, padding: "12px 14px", marginBottom: s.topSession ? 12 : 0,
            background: s.isPriority ? "rgba(212,64,0,.16)" : "rgba(47,158,68,.14)",
            border: `1px solid ${s.isPriority ? "rgba(212,64,0,.3)" : "rgba(47,158,68,.3)"}`,
            fontSize: 13, lineHeight: 1.45, fontWeight: 600,
          }}>
            {s.isPriority ? "⚠️" : "👌"} {s.decision}
          </div>
          {s.topSession && (
            <div style={{ background: "#fff", borderRadius: 14, padding: "10px 12px", color: "#171b1f" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{s.topSession.name}</span>
                <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: s.topSession.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.1)", color: s.topSession.done ? "#2f9e44" : "#d44000" }}>
                  {s.topSession.done ? "Terminé" : "Prévu"}
                </span>
              </div>
              {s.topSession.difficulty != null && <div style={{ marginBottom: Array.isArray(s.topSession.exercises) && s.topSession.exercises.length ? 8 : 0 }}><DiffGauge value={s.topSession.difficulty} height={8} /></div>}
              {Array.isArray(s.topSession.exercises) && s.topSession.exercises.length > 0 && <ShareExerciseList exercises={s.topSession.exercises} />}
            </div>
          )}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 14, textAlign: "center" }}>Partagé par {s.authorName}</div>
        </Card>
      )}

      <div style={{ maxWidth: 460, margin: "22px auto 0" }}>
        <a
          href="/login"
          style={{
            display: "block", textAlign: "center", padding: "14px", borderRadius: 16,
            background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800,
            boxShadow: "0 10px 24px rgba(212,64,0,.22)", textDecoration: "none",
          }}
        >
          Accéder à ThePerfClub →
        </a>
      </div>
    </div>
  );
}
