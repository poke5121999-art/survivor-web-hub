# Hub shared player database — setup runbook

This folder defines the **one shared database** the web hub uses for player accounts and saves.
It is the foundation for the hub sign-in gate (C2) and the game-side save layer (C3/C4).

> **What is automated vs what you do**: these files (schema, policies, keep-alive) are committed and
> ready. Creating the actual Supabase project and pasting your keys is a **one-time manual step** — a
> static site cannot create a project or hold a secret. Follow the steps below once.

Files here:

| File | What it is | When you run it |
|---|---|---|
| `schema.sql` | Table definitions (`profiles`, `game_saves`) + triggers | Once, first |
| `policies.sql` | Row Level Security (owner-only access) | Once, right after `schema.sql` |
| `../.github/workflows/supabase-keepalive.yml` | Twice-weekly ping so the free project never pauses | Runs itself after you set two secrets |

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> → **New project** (Free plan).
2. Pick a name, a strong database password (store it in your password manager), and a region close to you.
3. Wait for it to finish provisioning (~2 minutes).

## 2. Create the tables and access rules

1. In the project: **SQL Editor → New query**.
2. Paste the entire contents of **`schema.sql`**, run it. Expect "Success. No rows returned".
3. New query → paste the entire contents of **`policies.sql`**, run it. Expect the same.
4. Verify: **Table Editor** shows `profiles` and `game_saves`, and each shows a **green "RLS enabled"**
   badge. **Authentication → Policies** lists the owner-only policies.

## 3. Get your keys (and understand which is which)

**Settings → API.** You need two values, and it is critical you know which key is which:

| Key | Where it may go | Rule |
|---|---|---|
| **Project URL** | client JS, CI secret | Public — safe to expose |
| **anon / publishable key** | client JS (C2 sign-in), the keep-alive CI secret | **Public — safe.** It can only read/write what the RLS policies allow. |
| **service_role / secret key** | a trusted server only (we have none) | **NEVER.** It **bypasses all RLS** — a leak = full database access. Never put it in client JS, never commit it, never paste it into GitHub. |

> If you ever paste a key into hub code, it must be the **anon** key. There is no server in this project,
> so the `service_role` key should never leave the Supabase dashboard.

## 4. Turn on the keep-alive (so the free project does not pause)

A Supabase free project **pauses after 7 days with no database activity**. The included GitHub Actions
workflow prevents that by querying the DB twice a week.

1. Make sure `../.github/workflows/supabase-keepalive.yml` is present at the **root** of the published hub
   repo (`survivor-web-hub`) as `.github/workflows/supabase-keepalive.yml`.
2. In that repo: **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your **anon** key (public — fine to store here)
3. **Actions** tab → run **Supabase keep-alive** once manually (`Run workflow`) to confirm it goes green.

> GitHub disables scheduled workflows after 60 days of repo inactivity; a push or a manual run resets it.

---

## Verify it works (acceptance)

- Running `schema.sql` then `policies.sql` on a fresh project succeeds with no error, and both tables show
  **RLS enabled**. *(AC-1, AC-2)*
- After a test sign-up (available once C2 lands), a matching row appears in `profiles`. *(AC-3)*
- With RLS on and no session, `select * from game_saves` via the anon key returns **0 rows** — data is not
  publicly readable. *(AC-2, deny-by-default)*
- The keep-alive workflow run shows a green check. *(AC-4)*

## Design notes

- **One database, many games.** A save is keyed by `(user_id, game_id)`. Adding a second game (e.g.
  Kingfall) is a new `game_id` string — no schema change.
- **Payload cap ~100 KB per save** (`game_saves_payload_max_size`). Generous for a save blob, and it stops
  one player from exhausting the shared free-tier 500 MB database.
- **Not anti-cheat.** Values still come from the client; RLS enforces *who can touch which row*, not
  whether the values are honest. That is the same trade-off the project already accepted when it dropped
  the game server.
- **Next steps** (later patches): C2 wires the hub sign-in UI to this using the anon key over plain `fetch` (no library, done in phase-5.3-patch-2);
  C3/C4 add the game-side load/store bridge. The local save stays the single owner during play; the cloud
  copy is a sync layer on top.

## Sources

- Supabase RLS — <https://supabase.com/docs/guides/database/postgres/row-level-security>
- RLS production best practices — <https://makerkit.dev/blog/tutorials/supabase-rls-best-practices>
- API key & RLS pitfalls (CVE-2025-48757) — <https://vibeappscanner.com/best-practices/supabase>
- Free project pausing — <https://supabase.com/docs/guides/platform/free-project-pausing>
