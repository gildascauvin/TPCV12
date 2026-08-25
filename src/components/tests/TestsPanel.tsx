"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listTests, listOwnResults, fetchAthleteOwnTests, fetchCoachTestsForAthlete, mergeTests,
  type TestResultRow, type TestSubject, type MergedTest,
} from "@/lib/testResults";
import TestEvolutionChart from "@/components/tests/TestEvolutionChart";

const MONTH_FR = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];
function formatLong(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`;
}

const TIME_UNITS = new Set(["s", "min"]);
/* Même heuristique que testSummary.ts (badge "dernier test" côté liste) — pas mutualisée en import
   direct pour rester côté client sans dépendance croisée avec le module serveur, 5 lignes. */
function trendInfo(prevRaw: number, lastRaw: number, unit: string): { deltaPct: number | null; improved: boolean | null } {
  const prev = Number(prevRaw), last = Number(lastRaw);
  if (prev === last) return { deltaPct: 0, improved: null };
  if (prev === 0) return { deltaPct: null, improved: null };
  const deltaPct = Math.round(((last - prev) / prev) * 100);
  const wentUp = last > prev;
  return { deltaPct, improved: TIME_UNITS.has(unit) ? !wentUp : wentUp };
}

/* Panneau "tests de performance" — grille de KPI cards (une par test, cliquable) + graphe
   d'évolution du test sélectionné, inspiré d'un POC UX fourni par Gildas (voir SectionTabs.tsx pour
   le contexte). Fusionné DANS LES DEUX SENS ("un sportif qui édite doit être visible par un coach
   et inversement") :
   - /conseils (subject = le sportif lui-même) : `mergeCoach` fusionne ce que SON coach a enregistré
     pour lui (owner_id=coach, lu via /api/athlete/coach-tests — RLS bloque toute lecture directe
     cross-owner, y compris en lecture seule).
   - /coach/athletes (subject = un coach_athlete précis) : `linkedUserId` (le vrai user_id lié, pas
     un démo) fusionne ce que CE sportif a enregistré lui-même (owner_id=sportif, lu via
     /api/coach/athlete-tests).
   Les deux routes admin vérifient l'appartenance avant de lire quoi que ce soit.
   Lecture seule dans cette passe : éditer/supprimer un résultat se fait depuis la carte d'exercice
   où il a été saisi, pas ici. */
export default function TestsPanel({ ownerId, subject, linkedUserId, mergeCoach, emptyHint }: {
  ownerId: string;
  subject: TestSubject;
  linkedUserId?: string | null;
  mergeCoach?: boolean;
  emptyHint?: string;
}) {
  const isCoachView = "subjectCoachAthleteId" in subject;
  const [merged, setMerged] = useState<MergedTest[] | null>(null);
  const [ownResults, setOwnResults] = useState<TestResultRow[]>([]);
  const [otherResults, setOtherResults] = useState<TestResultRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const coachAthleteId = isCoachView && "subjectCoachAthleteId" in subject ? subject.subjectCoachAthleteId : null;
    const otherFetch = isCoachView && linkedUserId && coachAthleteId
      ? fetchAthleteOwnTests(coachAthleteId)
      : !isCoachView && mergeCoach
        ? fetchCoachTestsForAthlete()
        : Promise.resolve({ tests: [], results: [] });

    Promise.all([listTests(ownerId), listOwnResults(subject), otherFetch]).then(([ownTests, ownRes, other]) => {
      if (cancelled) return;
      setOwnResults(ownRes);
      setOtherResults(other.results);
      // Ordre fixe (coachTests, athleteTests) quel que soit le sens : côté coach, "own"=coach,
      // "other"=sportif ; côté sportif, "own"=sportif, "other"=coach — voir doc de mergeTests.
      const m = isCoachView ? mergeTests(ownTests, other.tests) : mergeTests(other.tests, ownTests);
      setMerged(m);
      setSelectedKey(prev => prev ?? m[0]?.name_key ?? null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, linkedUserId, mergeCoach, isCoachView, JSON.stringify(subject)]);

  // Tous les résultats déjà en mémoire (2 fetch uniques, jamais un par test) — un seul passage pour
  // regrouper par test fusionné, sert à la fois aux KPI cards (toutes) et au graphe (le sélectionné).
  const resultsByKey = useMemo(() => {
    const byTestId = new Map<string, TestResultRow[]>();
    for (const r of [...ownResults, ...otherResults]) {
      if (!byTestId.has(r.test_id)) byTestId.set(r.test_id, []);
      byTestId.get(r.test_id)!.push(r);
    }
    const out = new Map<string, TestResultRow[]>();
    for (const t of merged ?? []) {
      const rows = [
        ...(t.coachTestId ? byTestId.get(t.coachTestId) ?? [] : []),
        ...(t.athleteTestId ? byTestId.get(t.athleteTestId) ?? [] : []),
      ].sort((a, b) => a.date.localeCompare(b.date));
      out.set(t.name_key, rows);
    }
    return out;
  }, [merged, ownResults, otherResults]);

  if (merged === null) {
    return <div style={{ fontSize: 13, color: "#8a8f94", padding: "8px 2px" }}>Chargement…</div>;
  }

  if (merged.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, padding: "8px 2px" }}>
        {emptyHint ?? "Aucun test enregistré pour l'instant — marque une ligne d'exercice comme test (menu ⋯ d'une séance) pour commencer."}
      </div>
    );
  }

  const selected = merged.find(t => t.name_key === selectedKey) ?? merged[0];
  const results = resultsByKey.get(selected.name_key) ?? [];
  const last = results[results.length - 1];
  const prev = results[results.length - 2];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(128px, 1fr))`, gap: 10 }}>
        {merged.map(t => {
          const rows = resultsByKey.get(t.name_key) ?? [];
          const tLast = rows[rows.length - 1];
          const tPrev = rows[rows.length - 2];
          const isActive = t.name_key === selected.name_key;
          const trend = tLast && tPrev ? trendInfo(tPrev.value, tLast.value, tLast.unit) : null;
          return (
            <button
              key={t.name_key}
              onClick={() => setSelectedKey(t.name_key)}
              style={{
                textAlign: "left", cursor: "pointer", background: isActive ? "#fff5f0" : "#fff",
                border: isActive ? "1.5px solid rgba(212,64,0,.4)" : "1.5px solid rgba(0,0,0,.08)",
                borderRadius: 12, padding: "12px 12px 10px",
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8a8f94", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
              {tLast ? (
                <>
                  <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.01em", color: "#171b1f", marginTop: 2 }}>{tLast.value} {tLast.unit}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: trend === null ? "#8a8f94" : trend.improved === true ? "#2f9e44" : trend.improved === false ? "#d10000" : "#8a8f94" }}>
                    {trend === null ? "Premier résultat" : trend.deltaPct === 0 ? "→ stable" : `${trend.improved ? "↑" : "↓"} ${trend.deltaPct! > 0 ? "+" : ""}${trend.deltaPct}%`}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "#c7c9cb", marginTop: 4 }}>—</div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 6px 18px rgba(0,0,0,.045)", padding: 18, marginTop: 14 }}>
        {results.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5 }}>Aucun résultat encore pour « {selected.name} ».</div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7b7f82" }}>Évolution — {selected.name}</div>
            {results.length >= 2 ? (
              <div style={{ marginTop: 12 }}>
                <TestEvolutionChart points={results.map(r => ({ date: r.date, value: r.value }))} />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#8a8f94", marginTop: 8 }}>Un seul résultat pour l'instant — le graphe apparaît dès le 2ᵉ.</div>
            )}

            {results.length > 1 && prev && last && (
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <span style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.05)", borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#5b5f62" }}>
                  Premier : <b style={{ color: "#171b1f" }}>{results[0].value} {results[0].unit}</b>
                </span>
                <span style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.05)", borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#5b5f62" }}>
                  Dernier : <b style={{ color: "#171b1f" }}>{last.value} {last.unit}</b>
                </span>
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#7b7f82", margin: "18px 2px 8px" }}>Historique</div>
            <div>
              {[...results].reverse().map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid rgba(0,0,0,.05)", fontSize: 13.5 }}>
                  <span style={{ color: "#7b7f82", width: 90, flexShrink: 0 }}>{formatLong(r.date)}</span>
                  <span style={{ fontWeight: 800, flex: 1 }}>{r.value} {r.unit}</span>
                  {r.video_url && <span style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(212,64,0,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>🎥</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
