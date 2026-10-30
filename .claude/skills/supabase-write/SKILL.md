---
name: supabase-write
description: Règles pour toute écriture en base Supabase de ThePerfClub (insert, upsert, update, delete côté client ou API, migrations, scripts de réparation de données, requêtes de stats). À charger dès qu'on touche `supabase.from(...)`, `supabase/migrations/`, RLS, un script `scripts/*` qui écrit, ou une requête SQL d'analyse.
---

# Écrire en base sans casse

Projet Supabase : `levplovrwwsqvswmolik`. Pas de CLI Supabase liée (aucun `supabase/config.toml`) : les migrations s'appliquent via l'outil MCP Supabase (`apply_migration`), et le fichier est aussi ajouté dans `supabase/migrations/NNN_nom.sql` (numérotation continue, voir le dernier fichier).

## 1. Toujours lire `.error`
Un appel Supabase JS qui échoue (RLS, contrainte, colonne absente) **ne lève jamais d'exception** : il renvoie `{ data, error }`. Sans lecture de `error`, l'échec est invisible et l'état React local fait croire que ça marche (incident `exercise_video_library` restée vide, 18/08).
```ts
const { error } = await supabase.from("t").upsert(row, { onConflict: "user_id,date" })
if (error) { console.error("[t] upsert", error); /* remonter à l'UI ou throw */ }
```
Pour confirmer un bug d'écriture : interroger la base (MCP `execute_sql`), ne pas deviner en lisant le code.

## 2. RLS
- Toute nouvelle table : RLS activée + policies explicites (`auth.uid() = user_id`, ou lien via `coach_athletes` côté coach).
- Le coach écrit pour un sportif via les routes `src/app/api/coach/*` (client service role côté serveur), pas depuis le client.
- Après une migration : lancer `get_advisors` (sécurité et performance) sur le projet.

## 3. Scripts de données
- Dry-run par défaut, écriture uniquement avec `--apply`.
- Sauvegarde JSON avant toute écriture de masse (dans `scripts/` ou `~/Desktop/theperfclub-backups/`), et dire à Gildas où elle est.
- Avant un delete ou un overwrite, regarder les lignes ciblées et donner le nombre.

## 4. Stats et requêtes d'analyse
Exclure les comptes de Gildas partout : `email not ilike '%cauvin%' and email not ilike '%theperfclub.com%'`. Vérifier l'email complet d'un « meilleur utilisateur » avant de le citer.

## Repères de schéma
- `wellness_daily` : unique `(user_id, date)`, upsert avec `onConflict`.
- `profiles` : créé par trigger à l'inscription. `onboarding_done` posé seulement au succès du paiement ou équivalent (voir `paywall-billing`).
- `push_subscriptions` : unique sur `endpoint`.
- `sessions.notes` : exercices séparés par `\n`, sans numéros.

Pour les bonnes pratiques Supabase générales (RLS, index, Postgres), voir aussi les skills officiels `supabase/agent-skills` s'ils sont installés.
