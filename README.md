# Taskflow

A multi-user task management system for small teams. Kanban board, sprints,
automated time tracking, workload capacity, reporting and a full admin console
— all backed by PostgreSQL through Supabase, with Row Level Security doing the
real authorization work.

Every user gets their own login. There is no shared or demo account, and no
data is kept in the browser.

---

## Stack

| Layer     | Choice                                                     |
| --------- | ---------------------------------------------------------- |
| Frontend  | React 18 + TypeScript + Vite + Tailwind CSS                |
| Routing   | React Router (code-split, one chunk per screen)            |
| Board     | dnd-kit (drag and drop)                                     |
| Charts    | Recharts                                                    |
| Backend   | Supabase (PostgreSQL + Auth + Realtime)                    |
| Hosting   | Vercel (static build, SPA rewrites)                        |
| Free tier | Yes — designed to stay inside Supabase + Vercel free plans |

---

## 1. Create the database

1. Create a free project at <https://supabase.com/dashboard>.
2. Open **SQL Editor** and run each file in `supabase/migrations/` in
   filename order. They are numbered, so running them top to bottom is correct:

   | Order | File                                              | What it does                                        |
   | ----- | ------------------------------------------------- | --------------------------------------------------- |
   | 1     | `20240101000000_0001_core_schema.sql`              | Tables, enums, indexes, constraints, base triggers   |
   | 2     | `20240101000100_0002_business_logic.sql`           | Task keys, timer engine, audit trail, metrics        |
   | 3     | `20240101000200_0003_rls_policies.sql`             | Row Level Security + realtime publication           |
   | 4     | `20240101000300_0004_seed_org_structure.sql`       | Starting departments, first-user-is-admin            |
   | 5     | `20240101000400_0005_correctness_and_security.sql` | Correctness and privilege fixes                     |
   | 6     | `20240101000500_0006_pending_invites.sql`          | Admin invitations applied at sign-up                 |

   Re-running 1–4 is safe (they are written with `if not exists`); 5 and 6 use
   `create or replace` and are also safe to re-run.

3. Under **Authentication → Providers → Email**, enable Email sign-in.
   Turn **Confirm email** off while you are getting set up; turn it back on
   before you hand the app to a real team.
4. Under **Authentication → URL Configuration**, set the Site URL and add
   `/reset-password` to the redirect allow-list so recovery links work.

## 2. Configure the app

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Fill in `.env` from **Supabase Dashboard → Project Settings → API**:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

> Only the **anon / publishable** key belongs here. Never put the
> `service_role` key in this file, in Git, or in any Vercel environment
> variable that ships to the browser — it bypasses every security rule.

```bash
npm run dev      # http://localhost:5173
```

## 3. First sign-in

The **first person to register automatically becomes System Admin**
(`0004_seed_org_structure.sql`). Everyone after that starts as an Employee.

Typical rollout:

1. Register yourself first, then open **Administration → Users & roles**.
2. Invite each colleague, choosing their role and department. The invitation is
   stored in PostgreSQL and applied automatically the first time they sign up
   with that email address.
3. Send them the sign-in link from the invite dialog. They choose their own
   password — Taskflow never handles it.

---

## Roles

| Role              | Can do                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| `ADMIN`           | Everything, including users, departments, system settings, all audit logs and deletes |
| `DEPARTMENT_HEAD` | Manage their department's tasks and sprints                                          |
| `EMPLOYEE`        | Create tasks, update work assigned to them, track time, comment                       |

These are enforced by RLS policies, not by the interface. A hidden button is
convenience; the database is the boundary.

---

## How the important parts work

**Task IDs are permanent.** `TF-1042` is generated inside the database from an
identity column at insert time, so two people creating tasks at the same moment
can never collide, and a failed save never burns an ID.

**Time tracking is automatic.** Moving a task to *In Progress* opens a work
segment, *Blocked* opens a blocked segment, and any move out of those states
closes it. Actual hours are recomputed from the stored timestamps, never typed
in by hand. Unassigning a task stops the previous owner's clock.

**Concurrent edits are safe.** Every task carries a `version`. A save includes
the version it was based on; if someone else changed the task first the update
matches zero rows and the user is told to reload rather than silently
overwriting a colleague.

**Everyone converges on the same state.** Any mutation publishes a realtime
event, and every open browser re-reads the authoritative rows from PostgreSQL.
A periodic refresh and a browser online/offline handler cover the cases
realtime can miss (a sleeping laptop, a dropped connection).

**The audit trail is append-only.** A database trigger records who changed
what and when. Only the database can write to it — the app has no code path
that inserts an audit row, and the `write_audit` function is revoked from all
client roles so nobody can forge history through the API.

---

## Scripts

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run preview     # serve the production build locally
npm run typecheck   # tsc only
npm run lint        # eslint
```

---

## Deploying to Vercel

```bash
npm i -g vercel
vercel
```

Or import the repository at <https://vercel.com/new> — the included
`vercel.json` already sets the build command, output directory and SPA
rewrites.

Add these as environment variables in the Vercel project:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ALLOWED_ORIGINS=https://your-app.vercel.app
```

Then add your Vercel domain to the Supabase **Redirect URLs** allow-list.

---

## Local verification checklist

1. Register two accounts in two different browsers (or one normal + one
   private window).
2. Log in as the admin, invite the second account with a chosen role and
   department, and confirm both are applied after they sign up.
3. Create a task; confirm both browsers show it within a second or two.
4. Drag it to *In Progress* and start a timer; confirm the running timer
   appears for the assignee and that `actual_hours` grows.
5. Move it to *Blocked*, then *Done*; confirm the segment closes and blocked
   hours are tracked separately.
6. Open the same task in both windows, edit in one, then try to save the
   other — confirm the conflict message appears instead of overwriting.
7. Sign in as the employee and try to open Administration, reassign a task to
   someone else, and edit the audit log. All three must be refused by the
   database, not merely hidden in the UI.

---

## Troubleshooting

**"Database not connected"** — `.env` is missing or the variables are wrong.
Restart the dev server after editing it; Vite only reads env at startup.

**Sign-up succeeds but the page hangs** — the migrations were not all run, or
`handle_new_user` is missing. Confirm 0002 and 0006 both applied.

**Realtime never updates** — check the tables are in the
`supabase_realtime` publication (0003 does this), and that
`VITE_ALLOWED_ORIGINS` includes the origin you are serving from.

**"Could not create the task"** — read the detail message. Row Level Security
rejections are shown verbatim so you can see which rule blocked it.
