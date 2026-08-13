## Technical Design

### Overview & Stack

- **Nuxt 3** — Vue 3 + Nitro server; file-based pages and `server/api` routes in one deploy unit. Vue SFC templates map 1:1 to the interactive prototype at the repo root (`qadb-prototype.html`), which is the UI source of truth — every screen, component, state, and copy string is ported from it (see "Resolved UI Decisions" and "Implementation Phases").
- **Turso** — libSQL (SQLite-wire-compatible) over network; generous free tier, edge-friendly, single small DB; local dev uses a local libSQL file.
- **Drizzle ORM** (`drizzle-orm`) with the **libSQL adapter** (`drizzle-orm/libsql`) and `@libsql/client`; schema as code; migrations via `drizzle-kit`.
- **Custom username/password auth** — `nuxt-auth-utils` for sealed session cookies; argon2id password hashing (`@node-rs/argon2`) with PBKDF2 fallback (see Assumptions).
- **Pinia** — server-less client state; primary use is the practice-session queue/store.
- **TypeScript** end to end; **zod** for request validation on server routes; **shared constants** in `shared/enums.ts` imported by both client and server.
- **Deploy: Vercel** — Nitro auto-selects the `vercel` preset; serverless functions, free Hobby tier, auto HTTPS + random `.vercel.app` domain.

### Project Structure (Nuxt 3, logical — visual design per prototype)

```
app/                       # Nuxt 4-style app/ dir (or project root under Nuxt 3 — pick the scaffold default)
  components/
    AppHeader.vue          # brand, nav, user chip + logout, theme toggle, always-visible "Random Question" button
    ui/                    # primitives ported from the prototype: Btn, Badge, Chip, Seg, Switch, Checkbox, Input, Modal, Toast, Empty, Skeleton
    FiltersPanel.vue       # difficulty/importance/category multi-select + NBD/Mastered/amount/recently-failed
    SortControl.vue        # key + asc/desc
    QuestionTable.vue      # desktop table + mobile card list; row selection, check-all (indeterminate), row actions
    QuestionEditorModal.vue# create/edit form + mastered toggle + danger zone + delete confirm
    PracticeCard.vue       # prompt, show-answer, correct/incorrect, mastered toggle, next, progress
    TrackRecord.vue        # times practiced + % + chronological list (full on detail, compact in practice)
  pages/
    index.vue             # redirect to /content (authed) or /login
    login.vue
    register.vue
    content.vue           # the content section (table + filters + sort + select + start practice)
    questions/[id].vue     # question detail; full track-record history; reversible mastered toggle
    practice.vue           # curated practice (selected subset) — reads queue from store
    practice/random.vue    # standalone random practice — builds queue from all ids, shuffle
  stores/practice.ts      # Pinia: { queue: string[], index: number, mode } mirrored to sessionStorage
  utils/shuffle.ts        # Fisher–Yates
  utils/format.ts         # relative time ("2d ago") + date/time formatting for history
shared/enums.ts           # DIFFICULTY, IMPORTANCE, CATEGORY constants + zod enums (imported both sides)
server/
  api/
    auth/register.post.ts
    auth/login.post.ts
    auth/logout.post.ts
    questions/index.get.ts        # list with filters + sort + selection context
    questions/index.post.ts      # create
    questions/[id].get.ts        # detail incl. attempts history
    questions/[id].patch.ts      # update (incl. mastered toggle)
    questions/[id].delete.ts     # delete (cascade attempts)
    questions/ids.get.ts         # lightweight list of {id} for standalone random shuffle
    attempts.post.ts             # record a correct/incorrect answer
  utils/
    db.ts          # drizzle client + Turso env wiring
    auth.ts        # getSession/requireSession wrappers over nuxt-auth-utils
    password.ts    # hashPassword/verifyPassword (argon2id or PBKDF2 fallback)
  middleware/01.session.ts       # attach session -> event.context.user
db/schema.ts                     # drizzle table definitions
drizzle.config.ts
nuxt.config.ts                  # runtimeConfig: turso url/token, session secret
.env / .env.example
vercel.json                      # (optional; Nitro preset usually auto-detects)
```

- **Visual/UX design is settled** in the interactive prototype (`qadb-prototype.html`); this section keeps the route-level contract only. `middleware/auth.global.ts` (or a `protected` route middleware) redirects unauthenticated users from `/content`, `/questions/*`, `/practice*` to `/login`.
- Pages reference data via Nuxt `useFetch`/`$fetch` to the `server/api` routes; the Pinia store owns the practice queue only.

### Data Model (Drizzle schema, libSQL/SQLite)

Three tables, integer timestamps (unix ms), text PKs (cuid/uuid generated in app).

**`users`**
- `id` text PK
- `username` text UNIQUE NOT NULL
- `password_hash` text NOT NULL
- `created_at` integer NOT NULL default (now)
- Indexes: unique on `username`.

**`questions`**
- `id` text PK
- `user_id` text NOT NULL → `users.id` ON DELETE CASCADE
- `question` text NOT NULL
- `answer_summary` text NOT NULL (short, spoken-style; Markdown source — rendered read-only in practice and detail; edited as raw Markdown in the editor; raw HTML allowed and sanitized)
- `difficulty` text NOT NULL  (app-validated: easy|medium|hard)
- `importance` text NOT NULL   (app-validated: low|mid|high)
- `category` text NOT NULL      (app-validated: HTML|CSS|JS|API|React; others added via `shared/enums.ts`)
- `link` text (nullable)        (direct GreatFrontend URL)
- `mastered` integer NOT NULL default 0  (0/1)
- `created_at` integer NOT NULL default (now)
- `updated_at` integer NOT NULL default (now)
- Indexes: on `user_id`; compound `(user_id, category)`, `(user_id, difficulty)`, `(user_id, importance)` to back filters.

**`attempts`** (track record — one row per answer event)
- `id` text PK
- `question_id` text NOT NULL → `questions.id` ON DELETE CASCADE
- `user_id` text NOT NULL → `users.id` ON DELETE CASCADE (denormalized for direct scoping; app maintains invariant `attempt.user_id == question.user_id`)
- `correct` integer NOT NULL  (0|1)
- `answered_at` integer NOT NULL default (now)
- Indexes: `(question_id, answered_at DESC)`, `(user_id, answered_at DESC)`.

**Per-question stats (computed, not stored)** — built as a Drizzle view/subquery reused by list, filter, sort, detail:
- `attempt_count` = `COUNT(attempts.*)` per `question_id` (LEFT JOIN; 0 when none).
- `correct_count` = `SUM(correct)` per `question_id` (0 when none).
- `last_answered_at` = `MAX(answered_at)`.
- `last_correct` = the `correct` value of the attempt with the greatest `answered_at` for that question, via correlated subquery: `(SELECT correct FROM attempts a WHERE a.question_id = questions.id ORDER BY a.answered_at DESC LIMIT 1)`. NULL when no attempts.
- `track_record_pct` = `correct_count * 100.0 / attempt_count` (NULL when `attempt_count = 0`; the client renders "—", and sorting treats NULL as the lowest value — equivalent to 0).
- NBD (never been done) ⇔ `attempt_count = 0`.
- Recently failed ⇔ `last_correct = 0` AND `attempt_count > 0`.

### Database Setup (Turso + Drizzle)

- Install Turso CLI; `turso db create qadb` → database URL. `turso db tokens create qadb` → auth token.
- `nuxt.config.ts` `runtimeConfig`: `tursoUrl`, `tursoToken`, `sessionPassword` (all server-only, set from Vercel env vars).
- `server/utils/db.ts`: `createClient({ url: runtimeConfig.tursoUrl, authToken: runtimeConfig.tursoToken })` from `@libsql/client`, wrapped by `drizzle(client, { schema })`.
- Local dev: `tursoUrl` can point to `file:./dev.db` (local libSQL) via `.env` to avoid network during dev.
- Schema/migrations: `drizzle-kit` — `pnpm drizzle-kit generate` to produce SQL migrations, `pnpm drizzle-kit push` for dev. Production migrations run via a one-off `npx drizzle-kit push` against the Turso DB (or a `db:migrate` script in `package.json`). *Migration strategy details unverified — confirm current `drizzle-kit` vs libSQL workflow during future setup.*

### Authentication (custom username/password)

- **Register** (`POST /api/auth/register`, body `{ username, password }` zod-validated):
  - Reject if `username` already exists (unique constraint → 409).
  - `password.ts` → `hashPassword(password)` (argon2id).
  - Insert `users` row; create a sealed session via `nuxt-auth-utils` `setUserSession` containing `{ userId, username }`; return the public user object.
  - Password rules (zod): minimum length 8; username 3–32, alphanumeric/`-`/`_`.
- **Login** (`POST /api/auth/login`, body `{ username, password }`):
  - Look up user; `verifyPassword(hash, password)`; on fail → 401 generic "Invalid credentials".
  - `setUserSession` on success.
- **Logout** (`POST /api/auth/logout`): `clearUserSession`.
- **Session** (`server/middleware/01.session.ts`): read sealed session, populate `event.context.user = { id, username }`. `server/utils/auth.ts` `requireUser(event)` throws 401 when absent; all question/attempt routes call it and scope every query by `user.id`.
- **Client protection**: Nuxt route middleware redirects unauthed users to `/login`.
- **Client 401 handling**: any API call returning 401 clears the local session and redirects to `/login?expired=1`, which shows "Your session expired — please log in again." (the prototype's login notice, wired to the real middleware redirect).
- Cookies: HTTP-only, Secure (prod), SameSite=Lax; sealed with `NUXT_SESSION_PASSWORD`.

### CRUD Endpoints (`server/api/questions/*`)

Every route calls `requireUser` and scopes by `user.id`. All bodies validated with zod using `shared/enums.ts`.

- `GET /api/questions` — the content-section fetch. Query params (all optional, AND-combined):
  - Filters (see Content Section): `difficulty[]`, `importance[]`, `category[]` — each accepts **multiple values simultaneously** (OR-combined within the filter, AND-combined with the other filters; omitted/empty array = inactive) — plus `nbd` (all|true|false), `mastered` (all|true|false), `amountOp` (gt|lt|eq) + `amountValue` (int), `recentlyFailed` (bool).
  - Sort: `sortKey` (difficulty|importance|pct|amount) + `sortDir` (asc|desc). Default `created_at asc`.
  - Response: array of `{ id, question, answer_summary, difficulty, importance, category, link, mastered, createdAt, updatedAt, stats: { attemptCount, correctCount, trackRecordPct, lastAnsweredAt, lastCorrect } }`.
  - Implementation: build the per-question stats subquery, then apply filters (enums via `IN`; `amountOp` via `HAVING`/subquery on `attemptCount`; `nbd` true → `attemptCount IS 0`, false → `> 0`; `mastered` true→1/false→0; `recentlyFailed` → `lastCorrect = 0 AND attemptCount > 0`), then `ORDER BY` (difficulty/importance mapped to int via `CASE`; pct/amount use the computed stats; NULL pct sorts as the lowest value) with `created_at, id` tiebreak.
- `GET /api/questions/[id]` — full question plus attempts history ordered `answered_at DESC` (for detail page + chronological track record).
- `POST /api/questions` — body `{ question, answer_summary, difficulty, importance, category, link? }`; `mastered` defaults 0; sets `user_id`; returns created row.
- `PATCH /api/questions/[id]` — body subset-allowing `{ question?, answer_summary?, difficulty?, importance?, category?, link?, mastered? }`; updates `updated_at`; returns updated row. This route powers the reversible mastered toggle.
- `DELETE /api/questions/[id]` — cascade deletes `attempts` (FK cascade); returns 204.
- `GET /api/questions/ids` — returns `[{ id }]` for the user's questions only (drives standalone random shuffle; minimal payload).
- `POST /api/attempts` — body `{ questionId, correct (0|1) }`; verify ownership; insert `attempts { user_id, question_id, correct, answered_at: Date.now() }`; return refreshed stats for that question (so the UI can update track record immediately).

### Content Section (`/content`, component `QuestionTable.vue`)

Layout (per prototype): sticky left sidebar `FiltersPanel` (244px) + list column with `SortControl` above `QuestionTable`; per-row checkboxes; a check-all control that selects/unselects all rows in the current filtered+sorted result (not globally), with indeterminate state when partially selected. A selection bar ("N selected", "Follow current sort/order" switch, "Start practice" button) appears only when ≥1 row is selected. Loading: table skeleton on first fetch. Empty: two distinct states — no questions at all ("Add your first question") vs. filters match nothing ("Reset filters"). Responsive: filters collapse behind a "Filters" button (≤960px); the table becomes a card list (≤720px).

- **Filters (AND-combined):**
  - `difficulty`, `importance`, `category` — each is a **multi-value filter: any number of its values can be selected simultaneously** (e.g. difficulty `{easy, hard}` + importance `{low, mid}` + category `{JS, React}` all at once). Values within one filter are OR-combined (`difficulty IN (easy, hard)`); filters are AND-combined across each other. Empty selection (no values) = that filter is inactive (all).
  - `difficulty` — multi-select among {easy, medium, hard}; empty = all.
  - `importance` — multi-select among {low, mid, high}; empty = all.
  - `category` — multi-select among {HTML, CSS, JS, API, React} (extensible via `shared/enums.ts`); empty = all.
  - `nbd` (never been done) — tri-state: all / yes (only `attempt_count = 0`) / no.
  - `mastered` — tri-state: all / yes (`mastered = 1`) / no (`mastered = 0`).
  - `track record amount` — operator (`>` / `<` / `=`) + integer value N → `attempt_count op N`.
  - `recently failed` — include-only toggle: on → only `last_correct = 0 AND attempt_count > 0`.
- **Sorting (single primary key):**
  - `difficulty` (easy → medium → hard; reverse if desc) via `CASE`-to-integer.
  - `importance` (low → mid → high; reverse if desc) via `CASE`.
  - `track record percentage` (unanswered = NULL, sorts as the lowest value); asc/desc.
  - `track record amount` (count of answers regardless of correctness; unanswered ⇒ 0); asc/desc.
  - Stable tiebreak: `created_at asc, id asc`.
- **Selection + Start Practice:**
  - Select/unselect-all targets the currently rendered filtered+sorted result set.
  - Selection is held as an **ordered array of ids matching the current table order**.
  - If filters/sort change while rows are selected, the selection is **re-anchored** to the new result set (ids no longer visible are dropped) with a toast "Selection adjusted to the current results" (prototype behavior).
  - "Start practice" + "Follow current sort/order" appear only when ≥1 selected.
  - On Start: build the queue — if checkbox checked, **copy selection order verbatim**; if unchecked, **Fisher–Yates shuffle the selection**. Write queue + `mode=curated` to the Pinia `practice` store and `sessionStorage`, then navigate to `/practice`.

### Question Editor (create/edit modal)

`QuestionEditorModal.vue` — overlay dialog (focus-trapped; Esc or overlay click closes). Opened from Content ("Add question" button, row edit icon) and Detail ("Edit").

- Create fields: `question` (textarea, required), `answer_summary` (textarea, required), `difficulty` (segmented easy/medium/hard, default medium), `importance` (segmented low/mid/high, default mid), `category` (single-value chip select, default JS), `link?` (optional URL).
- The answer field has a **Markdown/Display** segmented toggle: Markdown edits the raw source (textarea); Display renders a read-only, sanitized preview via `app/utils/markdown.ts`. The saved value is always the raw Markdown; the toggle is view-only.
- Edit mode adds: a `mastered` toggle and a danger zone — "Delete question" opens a confirm dialog warning that the question's practice history (N attempts) is deleted too (cascade).
- Submit → `POST /api/questions` (create) or `PATCH /api/questions/[id]` (edit); success closes the modal, refreshes the current view, and toasts. Client-side required-field errors inline; server validation/409 errors surface inline too.
- Delete confirm → `DELETE /api/questions/[id]`; if the current view is that question's detail page, redirect to `/content` after delete.

### Question Detail (`/questions/[id]`)

- Back link → `/content`; question prompt as h1; badge row (difficulty, importance, category); mastered toggle pill (reversible); actions: Edit (editor modal), Delete (confirm dialog), "Open original question →" (external link when present).
- Answer summary in a labeled callout — rendered as Markdown (read-only, sanitized); always visible on detail (reference view, unlike practice where it's hidden).
- Track record: summary line (times practiced, correct count, % correct — 1 decimal, color-coded) + chronological history table, **newest first** (matches `answered_at DESC`), each row date+time and ✔/✘. Empty state: "Not practiced yet" + "Practice this question" (starts a single-question curated session).

### Practice Sessions

**Shared UI** (`PracticeCard.vue`): mode label ("Practice — N questions selected" / "Random practice"); progress indicator (`n / total` + thin bar); question prompt; a "Mark as mastered" toggle **always visible under the prompt** (resolved in prototype); answer hidden behind a "Show answer" button (reveals `answer_summary`, rendered as Markdown — read-only); after reveal: "Correct" and "Incorrect" buttons (record an attempt via `POST /api/attempts`, then refresh that question's stats in place) plus a note "Only Correct / Incorrect records an attempt. Skipping with Next records nothing."; "Next" button (always enabled); `TrackRecord.vue` compact — a collapsible block with mini stats (practiced, % correct, last result) + last 8 history rows.

**Two entry modes:**

- **Curated** (`/practice`): queue = the selected subset (ordered or shuffled, per "Follow current sort/order"). The subset contains exactly the filtered+sorted result the user selected.
- **Standalone random** (`/practice/random`, launched from the always-visible "Random Question" button in `AppHeader`): `GET /api/questions/ids` once → Fisher–Yates shuffle in the Pinia store → walk the queue. "Next (random) question" advances the index.
- **Empty-bank guard:** random practice with zero questions redirects to `/content` (empty state) instead of starting an empty queue.

**No repeats & end state:** because the queue is a **permutation built once**, each question appears exactly once; advancing an index is the only progression — no dedupe logic needed. When `index === queue.length`, show a "No more questions" screen with a "Practice again" button (reshuffles the same queue and restarts) and a "Return to content" button (links to `/content`).

**Persistence:** the Pinia `practice` store mirrors `{ mode, queue, index }` to `sessionStorage` (key `qadb:practice`), so a reload within the tab resumes at the current index; closing the tab ends the session (acceptable; ephemeral by design).

**`Next` button:** disabled until an answer (correct/incorrect) is recorded for the current question? — **Design decision:** answer is optional to advance; user may skip. "Next" is always enabled (skipping records nothing and does not insert an attempt). Only "Correct"/"Incorrect" write an attempt.

**Mastered in practice:** a "Mark as mastered" toggle appears **always under the prompt** (resolved in prototype; available whether or not the answer is revealed). Toggling calls `PATCH /api/questions/[id] { mastered }`. Reversible from the question detail page (`/questions/[id]`) — the detail page shows the same toggle plus full chronological track record.

### Track Record Semantics (canonical definitions used by every filter/sort/UI)

- `attempt_count` = `COUNT(attempts)` for the question.
- `correct_count` = `SUM(correct)`.
- `track_record_pct` = `correct_count * 100 / attempt_count` (NULL when `attempt_count = 0`; client renders "—"; sort treats NULL as the lowest value).
- `last_correct` = `correct` of the most recent attempt by `answered_at` (NULL when none).
- **NBD** ⇔ `attempt_count = 0`.
- **Recently failed** ⇔ `last_correct = 0 AND attempt_count > 0`.
- Track-record display under each question: `attempt_count` (times practiced), `track_record_pct` (1 decimal, formatted client-side), and chronological list `{ answered_at (date+time), correct (✔/✘) }`.
- Each attempt stores `answered_at` as unix ms; the client formats to local date/time.

### Mastered Flag

- `questions.mastered` integer 0/1, default 0.
- Setting available: after answering in practice (toggle under the question), and reversibly on the detail page.
- Filtered by the `mastered` tri-state filter; intended to let the user filter mastered questions out of future sessions (user applies the filter at practice/selection time).

### Enums / Shared Constants (`shared/enums.ts`)

- `DIFFICULTY = ['easy','medium','hard']` with an explicit **sort order map** `{easy:1, medium:2, hard:3}`.
- `IMPORTANCE = ['low','mid','high']` with order map `{low:1, mid:2, high:3}`.
- `CATEGORY = ['HTML','CSS','JS','API','React']` (extensible; no new categories beyond adding a string here and using it — DB column is free text validated by the zod enum, so no migration).
- Export zod enums `difficultySchema`, `importanceSchema`, `categorySchema`, reused by all server routes and (optionally) the client forms.

### Styling & Theme

- Port the prototype's design tokens verbatim into a CSS variables file: oklch palette with semantic roles (accent, success, danger, mastered, difficulty scale, importance scale, category hues, neutrals), radii, spacing, shadows — including the `[data-theme="dark"]` variant.
- Theme toggle (light/dark) in `AppHeader`, persisted to `localStorage` (key `qadb_theme`), applied via `data-theme` on `<html>` (set in a layout/plugin to avoid a flash of the wrong theme).
- Component class names and responsive breakpoints (960/720) map 1:1 from the prototype (`btn`, `badge`, `chip`, `seg`, `switch`, `checkbox`, `input`, `modal`, `toast`, `empty`, `skeleton`, `qtable`, `card-list`).
- Markdown rendering: `app/utils/markdown.ts` exposes `renderMarkdown(src)` (`markdown-it` with `html: true` + `isomorphic-dompurify` sanitization, safe for `v-html` on both SSR and client). Markdown typography comes from the global `.md` content class in `tokens.css` (no scoped styles).

### Deployment (Vercel)

- `nuxt.config.ts` — no special preset needed; Nitro auto-detects Vercel when deployed via the Vercel dashboard/Git integration. `vercel build` runs `nuxt build`.
- Environment variables (Vercel project → Settings → Environment Variables, all server-side): `NUXT_TURSO_URL` (or split url/token), `TURSO_AUTH_TOKEN`, `NUXT_SESSION_PASSWORD` (≥32-char random; `openssl rand -base64 32`). Map these in `runtimeConfig`.
- First deploy creates the random `<project>.vercel.app` domain; HTTPS automatic.
- Onboard Turso first (`turso db create` + token), run `drizzle-kit push` against the Turso DB once to provision schema, then deploy.

### Tech-Decision Rationale (learning value + not overly complex)

- **Nuxt 3 + Vue 3** — explore Vue (frequent in job listings, per the user); single full-stack deploy unit; Vue SFC templates translate the delivered interactive prototype (`qadb-prototype.html`) with minimal friction.
- **Turso (libSQL)** — realistic relational schema with a managed edge DB; SQLite familiarity but networked; avoids provisioning Postgres for a single-user app while still a credible resume item.
- **Drizzle ORM** — type-safe SQL builder with schema-as-code and migrations; lighter than Prisma for serverless/libSQL and strong resume signal.
- **Custom auth** — implementing username/password register/login/logout + sealed sessions + argon2id hashing is direct full-stack learning value the user asked for; `nuxt-auth-utils` does the session plumbing without hiding the auth flow's core.
- **Pinia** — the idiomatic Nuxt state layer; minimal use here (practice queue) keeps complexity low.
- **Vercel** — free, one-click Nuxt, auto HTTPS, zero‑ops; meets the "no cost" hard requirement with a mainstream deploy story.

### Resolved UI Decisions (settled by the prototype — the implementation ports these)

- Layouts, density, breakpoints, accessibility specifics (focus trap in modals, aria labels, visible focus), and all copy — defined in `qadb-prototype.html`.
- Track-record list: table form (full on detail; compact collapsible block in practice) — settled.
- Filters: sticky left sidebar on desktop; collapsible "Filters" button on tablet; table → card list ≤720px — settled.
- Theme: light + dark variants with a header toggle, persisted — settled.
- Create/edit: modal editor; delete behind a confirm dialog with cascade warning — settled.
- Loading: table skeleton; spinner inside submit buttons; toasts for transient feedback — settled.

Still deferred (not in v1): a scope picker for the "Random Question" button (defaults to the full pool) and multi-column sorting (single primary key).

### Implementation Phases

1. **Scaffold + data + auth**: Nuxt app; Turso/Drizzle schema + migrations; `shared/enums.ts`; register/login/logout routes; session middleware; route guards; runtimeConfig env wiring.
2. **Design system + shell**: port tokens + `ui/` primitives; `AppHeader`; `Login`/`Register` pages — real API replaces the prototype's demo login (drop the demo hint).
3. **Content**: `FiltersPanel`, `SortControl`, `QuestionTable` (selection bar, re-anchoring, indeterminate check-all, empty states, skeleton, mobile card list); `GET /api/questions` filter/sort implementation.
4. **Editor + Detail**: `QuestionEditorModal` (create/edit/delete); question detail with newest-first track record; `GET/POST/PATCH/DELETE /api/questions/*`.
5. **Practice**: Pinia store + sessionStorage persistence; `PracticeCard` + `TrackRecord`; curated and random flows; end panel; empty-bank guard; `POST /api/attempts`.

Prototype gaps to fix during implementation (from prototype review):
1. Fake auth → real API; client 401 → clear session, redirect `/login?expired=1`.
2. Detail history renders **newest-first once** — the prototype duplicates the newest row (bug, do not port).
3. Editor needs inline server-error handling (the prototype cannot fail on save).
4. Random practice on an empty bank redirects to `/content` instead of showing the end panel.
5. Drop prototype artifacts: demo-hint credentials, fake "created … ago" sub-lines, dead `qadb_expired`/no-op `open-link` code.
