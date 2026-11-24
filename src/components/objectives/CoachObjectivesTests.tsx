"use client";

/* Fiche Performance d'un sportif côté coach (23/11/2026) : même mise en page Objectifs que le sportif
   (ses objectifs en carrousel, ses tests en grille, fiche plein écran). Objectifs et données de mesure
   lus et écrits via /api/coach/objectives ; les tests restent ceux de TestsPanel (vue coach). */

import { useEffect, useMemo, useState } from "react";
import { buildSandboxObjectives, buildTestFixture } from "@/lib/sandboxFixtures";
import ObjectivesHub from "@/components/objectives/ObjectivesHub";
import TestsPanel from "@/components/tests/TestsPanel";
import { Skel } from "@/components/ui/Skeleton";
import type { ObjectiveData, ObjectiveItem } from "@/lib/objectives";
import type { Sexe } from "@/lib/testNorms";

export default function CoachObjectivesTests({ coachId, athlete, locked, onUnlock, sandbox = false }: {
  coachId: string; sandbox?: boolean;
  athlete: { id: string; user_id: string | null; name: string; sport: string | null; sexe?: Sexe | null; poids_kg?: number | null };
  locked: boolean; onUnlock: () => void;
}) {
  const [state, setState] = useState<{ items: ObjectiveItem[]; data: ObjectiveData } | null>(null);
  const [failed, setFailed] = useState(false);
  const [rev, setRev] = useState(0);
  /* Sandbox : tests factices + 2 objectifs déjà suivis, rien n'est écrit. */
  const demo = useMemo(() => {
    if (!sandbox) return null;
    const fixture = buildTestFixture();
    return { fixture, ...buildSandboxObjectives(fixture) };
  }, [sandbox]);
  useEffect(() => {
    if (sandbox) return;
    let alive = true;
    fetch(`/api/coach/objectives?athleteId=${encodeURIComponent(athlete.id)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => { if (alive) setState({ items: j.items, data: j.data }); })
      .catch(e => { console.error("[objectifs coach] lecture", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [athlete.id, rev, sandbox]);

  const panel = (objectives?: Parameters<typeof TestsPanel>[0]["objectives"]) => (
    <TestsPanel
      layout={objectives ? "objectives" : "list"} objectives={objectives}
      ownerId={coachId} subject={{ subjectCoachAthleteId: athlete.id }} linkedUserId={athlete.user_id}
      emptyHint={`Aucun test enregistré pour ${athlete.name}.`}
      sport={athlete.sport} sexe={athlete.sexe ?? null} poidsKg={athlete.poids_kg ?? null}
      onDarkPage
      lockedAnalysis={locked ? { onUnlock } : null}
    />
  );
  if (demo) return (
    <ObjectivesHub initial={demo.initial} sport={athlete.sport} data={demo.data} sexe={athlete.sexe ?? null} poidsKg={athlete.poids_kg ?? null} persist={false} coach={{ athleteId: athlete.id }}>
      {api => (
        <TestsPanel layout="objectives" objectives={api} ownerId="sandbox" subject={{ subjectCoachAthleteId: athlete.id }}
          sport={athlete.sport} sexe={athlete.sexe ?? null} poidsKg={athlete.poids_kg ?? null} fixture={demo.fixture} onDarkPage />
      )}
    </ObjectivesHub>
  );
  if (failed) return panel();
  if (!state) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[0, 1, 2].map(i => <Skel key={i} dark h={i ? 64 : 200} r={24} />)}</div>;
  return (
    <ObjectivesHub key={rev} initial={state.items} sport={athlete.sport} data={state.data} sexe={athlete.sexe ?? null} poidsKg={athlete.poids_kg ?? null} locked={locked} coach={{ athleteId: athlete.id }}>
      {api => panel({ ...api, onDataChanged: () => setRev(v => v + 1) })}
    </ObjectivesHub>
  );
}
