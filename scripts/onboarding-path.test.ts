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
      expect((["ob_count", "ob_plan", "ob_decide", "ob_insight", "ob_week", "ob_invite", "ob_pay"] as StepId[]).every(s => p.includes(s)), `écrans coach présents ${tag}`);
      expect(!p.some(s => (["ob_health", "decision_2a", "ob_when", "ob_mirror", "ob_control", "ob_checkin"] as StepId[]).includes(s)), `coach : ni Santé, ni anciens écrans ${tag}`);
      expect(!p.includes("ob_notif"), `coach : rappels en feuille, plus d'écran ob_notif (08/11) ${tag}`);
      expect(p.indexOf("ob_week") < p.indexOf("ob_invite") && p.indexOf("ob_invite") < p.indexOf("ob_pay"), `coach : déclic avant l'invitation ${tag}`);
      expect(p[p.length - 1] === "ob_pay", `coach : paywall en dernier ${tag}`);
      const lastQ = Math.max(...PROGRAM_QUESTION_STEPS.map(s => p.indexOf(s)), p.indexOf("ob_count"));
      expect(lastQ < p.indexOf("ob_plan"), `coach : questions avant son programme ${tag}`);
      if (claimed) expect(!p.includes("ob_sport") && !p.includes("ob_program"), `coach claimé : pas de questions programme ${tag}`);
      continue;
    }
    if (inv) {
      expect(eq(p, ["value_intro", "account"]), `invité : inscription seule, puis l'app ${tag}`);
      continue;
    }
    // Sportif Elite
    expect(p.includes("decision_2a"), `aha montré au sportif ${tag}`);
    expect((["ob_plan", "ob_decide", "ob_insight", "ob_week", "ob_pay"] as StepId[]).every(s => p.includes(s)), `écrans de l'argumentaire présents ${tag}`);
    expect(!p.some(s => (["ob_invite", "ob_when", "ob_mirror", "ob_checkin", "ob_control"] as StepId[]).includes(s)), `sportif : ni invitation, ni anciens écrans ${tag}`);
    expect(p.includes("ob_health") === healthAvailable, `Apple Santé seulement si disponible ${tag}`);
    expect(!p.includes("ob_notif"), `rappels en feuille, plus d'écran ob_notif (08/11) ${tag}`);
    expect(p[p.length - 1] === "ob_pay", `paywall en dernier ${tag}`);
    // Les écrans Elite gardent leur ordre et viennent après toutes les questions de programme.
    const elite = p.filter(s => ELITE_STEPS.includes(s));
    expect(eq(elite, ELITE_STEPS.filter(s => elite.includes(s))), `ordre des écrans Elite ${tag}`);
    const lastQuestion = Math.max(...PROGRAM_QUESTION_STEPS.map(s => p.indexOf(s)));
    expect(lastQuestion < p.indexOf(elite[0]), `écrans Elite après les questions ${tag}`);
    expect(p.indexOf("ob_plan") < p.indexOf("ob_decide"), `programme avant la décision ${tag}`);
    if (claimed) expect(!p.includes("ob_sport") && !p.includes("ob_program"), `claimé : pas de questions programme ${tag}`);
    if (!claimed && has === "import") expect(p.includes("ob_import") && !p.includes("ob_goal"), `import : pas d'objectif/jours ${tag}`);
    if (!claimed && has === "later") expect(!p.includes("ob_goal") && !p.includes("ob_import"), `passé : aucune question de programme après ob_program ${tag}`);
  }

// Onboarding vécu (2026-11-15) : sportif direct seulement, invité et coach inchangés.
for (const claimed of bools) for (const healthAvailable of bools) for (const elite of bools) {
  const o: PathOptions = { role: "athlete", has: null, claimed, invited: false, elite, healthAvailable, vecu: true };
  const p = buildOnboardingPath(o), tag = JSON.stringify(o);
  expect(p[0] === "value_intro" && p[1] === "account", `vécu : présignup puis carte ${tag}`);
  expect(p[p.length - 1] === "ob_pay", `vécu : paiement en dernier ${tag}`);
  expect(new Set(p).size === p.length, `vécu : aucun doublon ${tag}`);
  expect(!p.some(s => (["ob_program", "ob_plan", "ob_insight", "ob_decide", "ob_week", "decision_2a"] as StepId[]).includes(s)), `vécu : aucun ancien écran ${tag}`);
  expect(p.includes("ob_sport") === !claimed && p.includes("ob_days") === !claimed, `vécu : questions sport/jours hors claim ${tag}`);
  expect(p.includes("ob_health") === healthAvailable, `vécu : Santé seulement en app ${tag}`);
  expect(p.indexOf("ob_habits") < p.indexOf("ob_sess") && p.indexOf("ob_sess") < p.indexOf("ob_fact") && p.indexOf("ob_fact") < p.indexOf("ob_trial") && !p.includes("ob_path") && !p.includes("ob_weak") && !p.includes("ob_note") && !p.includes("ob_avap"), `vécu v55 : point forme du jour, problème, déclic, essai ${tag}`);
}
expect(eq(buildOnboardingPath({ role: "athlete", has: null, claimed: false, invited: true, vecu: true, elite: true }), ["value_intro", "account"]), "vécu : invité inchangé");
{ const c = buildOnboardingPath({ role: "coach", has: null, claimed: false, invited: false, vecu: true, elite: true });
  expect(c[0] === "value_intro" && c[1] === "account" && c.includes("ob_count") && c.includes("ob_know") && c.indexOf("ob_pay") < c.indexOf("ob_invite") && !c.includes("decision_2b"), "vécu coach : présignup, groupe, miroir, déclic, offre puis invitation"); }

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
show("Vécu, sportif web", { role: "athlete", has: null, claimed: false, invited: false, elite: true, vecu: true });
show("Vécu, claimé, iOS", { role: "athlete", has: null, claimed: true, invited: false, elite: true, vecu: true, healthAvailable: true });
show("Génération ratée", { role: "athlete", has: "generate", claimed: false, invited: false, elite: true, programReady: false });

console.log(`\n${checks - failures}/${checks} vérifications OK`);
if (failures) process.exit(1);
