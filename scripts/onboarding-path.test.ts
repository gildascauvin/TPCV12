/* Matrice des parcours d'onboarding (src/lib/onboardingPath.ts).
   Lancer : node scripts/run-onboarding-path-test.mjs */
import { buildOnboardingPath, ELITE_STEPS, PROGRAM_QUESTION_STEPS, type ObHas, type PathOptions, type Role, type StepId } from "../src/lib/onboardingPath";

let failures = 0, checks = 0;
function expect(cond: boolean, msg: string) {
  checks++;
  if (!cond) { failures++; console.error("✗ " + msg); }
}
const eq = (a: StepId[], b: StepId[]) => a.length === b.length && a.every((s, i) => s === b[i]);

// 1. Interrupteur coupé : exactement le parcours d'avant (copie de l'ancien getPath).
function legacy(r: Role, has: ObHas, claimed: boolean, invited: boolean): StepId[] {
  if (invited && r === "athlete") return ["value_intro", "account"];
  const base: StepId[] = ["value_intro", r === "coach" ? "decision_2b" : "decision_2a", "account"];
  const post: StepId[] = [];
  if (!claimed) {
    post.push("ob_sport", "ob_program");
    if (has === "import") post.push("ob_import");
    else if (has !== "later") post.push("ob_goal", "ob_weak", "ob_days");
  }
  if (r === "coach") post.push("ob_invite");
  return [...base, ...post];
}

const roles: Role[] = ["athlete", "coach"];
const hasValues: ObHas[] = [null, "generate", "import", "later"];
const bools = [false, true];

for (const role of roles) for (const has of hasValues) for (const claimed of bools) for (const invited of bools)
  for (const coachPaying of bools) for (const healthAvailable of bools) for (const pushAvailable of bools) for (const programReady of [undefined, true, false]) {
    const o: PathOptions = { role, has, claimed, invited, coachPaying, healthAvailable, pushAvailable, programReady };
    const tag = JSON.stringify(o);
    expect(eq(buildOnboardingPath({ ...o, elite: false }), legacy(role, has, claimed, invited)), `interrupteur coupé ≠ ancien parcours ${tag}`);

    const p = buildOnboardingPath({ ...o, elite: true });
    const inv = invited && role === "athlete";
    // Invariants communs
    expect(p[0] === "value_intro", `commence par value_intro ${tag}`);
    expect(p.includes("account"), `contient account ${tag}`);
    expect(new Set(p).size === p.length, `aucun écran en double ${tag}`);
    const accountIdx = p.indexOf("account");
    expect(p.slice(accountIdx + 1).every(s => s.startsWith("ob_")), `après account : seulement des écrans ob_ ${tag}`);

    if (role === "coach") {
      expect(p.includes("decision_2b"), `aha coach ${tag}`);
      expect(p.includes("ob_count") && p.includes("ob_when") && p.includes("ob_mirror") && p.includes("ob_control") && p.includes("ob_invite") && p.includes("ob_pay"), `écrans coach présents ${tag}`);
      expect(!p.some(s => ["ob_health", "ob_checkin", "ob_week", "decision_2a"].includes(s)), `coach : ni Santé, ni check-in, ni semaine ${tag}`);
      expect(p.includes("ob_notif") === pushAvailable, `coach : notifs seulement si activables ${tag}`);
      expect(p.indexOf("ob_control") < p.indexOf("ob_invite") && p.indexOf("ob_invite") < p.indexOf("ob_pay"), `coach : déclic avant l'invitation, paywall en dernier ${tag}`);
      expect(p[p.length - 1] === "ob_pay", `coach : paywall en dernier ${tag}`);
      const lastQ = Math.max(...PROGRAM_QUESTION_STEPS.map(s => p.indexOf(s)), p.indexOf("ob_count"));
      expect(lastQ < p.indexOf("ob_when"), `coach : questions avant le cadrage ${tag}`);
      if (claimed) expect(!p.includes("ob_sport") && !p.includes("ob_program"), `coach claimé : pas de questions programme ${tag}`);
      continue;
    }
    // Sportif Elite
    expect(p.includes("decision_2a"), `aha montré au sportif ${tag}`);
    expect(p.includes("ob_checkin"), `check-in toujours présent ${tag}`);
    expect(!p.includes("ob_invite"), `pas d'invitation côté sportif ${tag}`);
    expect(p.includes("ob_health") === healthAvailable, `Apple Santé seulement si disponible ${tag}`);
    expect(p.includes("ob_notif") === pushAvailable, `notifs seulement si activables ${tag}`);
    expect(p.includes("ob_pay") === !(inv && coachPaying), `paywall sauf invité d'un coach payant ${tag}`);
    // Les écrans Elite gardent leur ordre et viennent après toutes les questions de programme.
    const elite = p.filter(s => ELITE_STEPS.includes(s));
    expect(eq(elite, ELITE_STEPS.filter(s => elite.includes(s))), `ordre des écrans Elite ${tag}`);
    const lastQuestion = Math.max(...(["ob_sport", "ob_program", "ob_import", "ob_goal", "ob_weak", "ob_days"] as StepId[]).map(s => p.indexOf(s)));
    expect(lastQuestion < p.indexOf(elite[0]), `écrans Elite après les questions ${tag}`);
    if (inv) {
      expect(!p.some(s => ["ob_sport", "ob_program", "ob_import", "ob_goal", "ob_weak", "ob_days", "ob_when", "ob_mirror", "ob_week"].includes(s)), `invité : ni questions, ni cadrage, ni semaine ${tag}`);
    } else {
      expect(p.includes("ob_when") && p.includes("ob_mirror"), `cadrage présent ${tag}`);
      const hasProgram = claimed || has !== "later";
      expect(p.includes("ob_week") === (hasProgram && programReady !== false), `semaine seulement avec un programme prêt ${tag}`);
      if (claimed) expect(!p.includes("ob_sport") && !p.includes("ob_program"), `claimé : pas de questions programme ${tag}`);
      if (!claimed && has === "import") expect(p.includes("ob_import") && !p.includes("ob_goal"), `import : pas d'objectif/jours ${tag}`);
      if (!claimed && has === "later") expect(!p.includes("ob_goal") && !p.includes("ob_import"), `passé : aucune question de programme après ob_program ${tag}`);
    }
  }

// Cas lisibles, pour l'œil.
const show = (label: string, o: PathOptions) => console.log(label.padEnd(44), buildOnboardingPath(o).join(" → "));
show("Sportif direct, généré, iOS", { role: "athlete", has: "generate", claimed: false, invited: false, elite: true, healthAvailable: true, pushAvailable: true });
show("Sportif direct, importé, web", { role: "athlete", has: "import", claimed: false, invited: false, elite: true, pushAvailable: true });
show("Sportif direct, passé, ordinateur sans push", { role: "athlete", has: "later", claimed: false, invited: false, elite: true });
show("Sportif claimé, iOS", { role: "athlete", has: null, claimed: true, invited: false, elite: true, healthAvailable: true, pushAvailable: true });
show("Invité, coach payant, iOS", { role: "athlete", has: null, claimed: false, invited: true, coachPaying: true, elite: true, healthAvailable: true, pushAvailable: true });
show("Invité, coach gratuit, web", { role: "athlete", has: null, claimed: false, invited: true, coachPaying: false, elite: true, pushAvailable: true });
show("Coach direct, généré, iOS", { role: "coach", has: "generate", claimed: false, invited: false, elite: true, pushAvailable: true });
show("Coach claimé, ordinateur", { role: "coach", has: null, claimed: true, invited: false, elite: true });
show("Génération ratée", { role: "athlete", has: "generate", claimed: false, invited: false, elite: true, programReady: false });

console.log(`\n${checks - failures}/${checks} vérifications OK`);
if (failures) process.exit(1);
