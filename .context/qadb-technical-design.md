## Technical Design

Describes the app as it is. Vocabulary: [`docs/glossary.md`](../docs/glossary.md). Decisions behind
the generic model: [`docs/superpowers/specs/2026-11-26-generic-scenarios-design.md`](../docs/superpowers/specs/2026-11-26-generic-scenarios-design.md).
Setup and commands: [`README.md`](../README.md).

### Overview and stack

A generic question-and-answer bank with practice sessions and a track record. Each user creates
**scenarios** and defines their **attributes** and **options**; question, answer, link, mastered flag
and attempts are the same in every scenario.

- **Nuxt 4** (Vue 3 + Nitro): pages and `server/api` routes in one deploy unit.
- **libSQL** (Turso when deployed, `sqld` locally) through **Drizzle ORM** and the HTTP-only client
  (`@libsql/client/http`, `drizzle-orm/libsql/http`). The native client cannot be bundled for the
  serverless target, so `file:` URLs are not supported.
- **Auth:** `nuxt-auth-utils` sealed session cookies; argon2id hashing (`@node-rs/argon2`) with a
  PBKDF2 fallback.
- **Pinia** for the practice session. **zod** for request validation. **TypeScript** throughout.
- **Deploy:** Vercel (Nitro preset auto-detected).

### Project structure

```
app/
  components/        AppHeader, ScenarioSwitcher, FiltersPanel, SortControl, QuestionTable,
                     IncompleteBanner, BulkEditDialog, QuestionEditorModal, AttributeField,
                     AttributeBadges, PracticeSession, PracticeCard, TrackRecord, ConfirmDialog
    scenario/        ScenarioForm, AttributeCard, OptionRow, ColorPicker,
                     ResolveChangesDialog, DeleteScenarioDialog
    ui/              primitives (Btn, Badge, Chip, Seg, Switch, Checkbox, Input, Modal, ...)
  composables/       useApi, useScenario, useTheme, useToast, keepFocus
  pages/             see "Screens"
  stores/practice.ts
  utils/             format, markdown, shuffle, scenario-form, scenario-route
  assets/tokens.css  design tokens, including the option color palette (light and dark)
shared/
  scenario/          types, schema (zod), values, diff, bulk, query, colors
  types/             wire types
server/
  api/               routes: parse the request, call a service
  services/          scenarios, questions, bulk, incomplete
  middleware/01.session.ts
  utils/             db, auth, password
db/schema.ts         Drizzle tables, mirroring the migrations
db/migrations/       the baseline SQL
scripts/db/          migrate, migrations/, reset-local, seed-demo, guard (local-URL check)
tests/               unit/, api/, e2e/, flows/, support/
```

`shared/scenario/` holds the rules both sides apply, so the client can show what the server will
decide: validation, default and missing values, what an edit takes away, what a bulk edit changes,
and the question list's query string.

### Data model

IDs are text (cuid2), timestamps unix milliseconds.

| Table | Columns |
|---|---|
| `users` | `id`, `username` (unique), `password_hash`, `created_at` |
| `scenarios` | `id`, `user_id` → users, `name`, `created_at`, `updated_at` |
| `attributes` | `id`, `scenario_id` → scenarios, `name`, `selection_mode` (`single`/`multiple`), `ordered`, `required`, `position` |
| `options` | `id`, `attribute_id` → attributes, `label`, `color` (palette key), `position`, `is_default` |
| `questions` | `id`, `scenario_id` → scenarios, `question`, `answer` (Markdown), `link`, `mastered`, `created_at`, `updated_at` |
| `question_options` | `question_id` → questions, `option_id` → options; primary key on both; index on `option_id` |
| `attempts` | `id`, `question_id` → questions, `user_id` → users, `correct` (0/1), `answered_at` |
| `_migrations` | `id`, `applied_at` |

- Every foreign key cascades on delete, so deleting a scenario, attribute, option or question
  removes what depends on it. Tests prove this on `sqld`.
- A question has no `user_id`: ownership comes from its scenario.
- The app enforces what the database cannot: at most one option for a single-mode attribute, and
  only options of the question's own scenario.
- Multi-row writes are one `db.batch` transaction. Where a concurrent change could invalidate what
  was checked, a guard statement in the same batch inserts an invalid row to fail it; the service
  then reports the problem (404, 409 or 422).

### Migrations and local data

- `scripts/db/migrate.mjs` is the only way to change the schema. It applies each pending migration
  and records it in `_migrations` in one transaction. A database that already has the baseline tables
  is only marked. Remote addresses need `--allow-remote`. `drizzle-kit push` must not be used: it
  can drop data.
- `0001-scenarios` replaced the fixed difficulty, importance and category columns: it creates a
  "Front-end interview questions" scenario for each user with questions, converts the values to
  `question_options`, removes five named test accounts, and verifies counts, option sets and foreign
  keys before committing. Any unmapped value or failed check changes nothing.
- `reset-local.mjs` restores the local database from a backup. `seed-demo.mjs` creates the two demo
  scenarios for one user, on local databases only.

### Scenario rules

- Name required, unique per user ignoring case. Zero or more attributes with unique names.
- An attribute has at least 2 options with unique labels. Only single selection can be ordered.
- Default options (one in single mode, any number in multiple) preselect new questions only.
- Required attributes must be filled on new questions and when values are edited.
- The editor saves the whole scenario in one request. Changes that affect questions need a choice,
  or the server answers 409 with the conflicts and their counts:

| Change | Choice |
|---|---|
| Delete an option in use | Move its questions to another option, or leave them empty |
| Delete an attribute in use | Confirm |
| Multiple → single with questions holding several | Confirm; each keeps the first in option order |

Everything else (rename, recolor, reorder, add, turn "required" on, single → multiple) applies
directly. Deleting a scenario requires its name and removes its questions and attempts.

### Authentication

- `POST /api/auth/register` (username 3–32 of `A-Za-z0-9_-`, password at least 8; 409 when taken),
  `POST /api/auth/login` (401 "Invalid credentials"), `POST /api/auth/logout`.
- The session middleware sets `event.context.user`; every other route calls `requireUser`.
- Everything is scoped to the user; anything owned by someone else answers 404.
- The client sends unauthenticated visitors to `/login?expired=1`, as does any 401.

### API

| Route | Purpose |
|---|---|
| `GET /api/scenarios` | List with question and incomplete counts, oldest first |
| `POST /api/scenarios` | Create (409 on a taken name) |
| `GET /api/scenarios/[sid]` | Definition, per-option and per-attribute usage, counts |
| `PUT /api/scenarios/[sid]` | `{ scenario, resolutions }`: replace atomically |
| `DELETE /api/scenarios/[sid]` | `{ confirmName }` → 204 |
| `GET /api/scenarios/[sid]/questions` | List with filters and sort |
| `POST /api/scenarios/[sid]/questions` | `{ question, answer, link?, values }` |
| `GET /api/scenarios/[sid]/questions/ids` | IDs for random practice |
| `PATCH /api/scenarios/[sid]/questions/bulk` | `{ questionIds, attributeId, action, optionIds }` |
| `GET /api/questions/[id]` | Question with attempts, newest first |
| `PATCH /api/questions/[id]` | Any of `question`, `answer`, `link`, `values`, `mastered` |
| `DELETE /api/questions/[id]` | 204 |
| `POST /api/attempts` | `{ questionId, correct }` → the question with new stats |
| `POST /api/format-answer` | `{ content }` → Markdown formatted by the AI service |

A question on the wire is `{ id, scenarioId, question, answer, link, mastered, created_at,
updated_at, values, incomplete, stats }`. `values` maps every attribute ID to its chosen option IDs
in option order. Updating `values` replaces all of them; other updates do not revalidate them.

Bulk actions: **set** and **clear** (optional attributes only) in single mode; **add**, **replace**
and **remove** in multiple mode. A request naming a foreign question or option, or one that would
leave a required attribute empty anywhere, is rejected as a whole (422 with `reason` and `count`).
Only changed questions get a new `updated_at`.

### Filtering and sorting

Query parameters: repeated `option` and `none` (attribute IDs), `incomplete`, `nbd`, `mastered`,
`amountOp` (`gt`/`lt`/`eq`) with `amountValue`, `recentlyFailed`, `q`, `sortKey`
(`attr:<id>`, `pct`, `amount`), `sortDir`.

- Options of one attribute, "None" included, combine with OR; attributes and other filters with AND.
- Search requires every word to occur in the question text, ignoring case.
- Only ordered attributes can be sorted by. Empty values sort last in both directions. `pct` treats
  never practiced as lowest. Ties keep creation order.
- IDs that are not in the scenario are ignored.

### Incomplete questions

A question is incomplete when a required attribute has no option on it. The content page shows a
banner with the count and a filter for them, marks the rows, and shows "—" for empty values. The
editor highlights what is missing and requires it on save. Practice, grading and mastered work as
usual.

### Track record

Computed from `attempts`, never stored: `attemptCount`, `correctCount`, `trackRecordPct` (null
without attempts), `lastAnsweredAt`, `lastCorrect`. **Never been done** means no attempts;
**recently failed** means the latest attempt was incorrect.

### Screens

| Route | Screen |
|---|---|
| `/` | Last opened scenario (cookie `qadb_scenario`), or the only one, otherwise the list |
| `/login`, `/register` | Auth |
| `/scenarios` | List; create, edit, delete |
| `/scenarios/new`, `/scenarios/[sid]/edit` | Scenario editor |
| `/scenarios/[sid]/content` | Table, filters, sort, selection, bulk editing, question editor |
| `/scenarios/[sid]/questions/[id]` | Detail with the full track record |
| `/scenarios/[sid]/practice`, `.../practice/random` | Selected and random practice |

Columns, filters, sort choices, editor fields, badges and practice metadata are generated from the
scenario's attributes, in their order. The header has a scenario switcher; Random Question applies to
the current scenario and is hidden outside one.

- **Content:** a selection follows the filtered and sorted result and is trimmed when it changes
  (with a toast). Selected rows can be practiced, in table order or shuffled, or edited in bulk. On
  narrow screens (960px, 720px) filters collapse and the table becomes cards.
- **Editor:** a segmented control for single mode with up to 4 options, otherwise chips. Answers are
  Markdown with a sanitized preview and an AI "Format" button.

### Practice sessions

The Pinia store holds `{ mode, queue, index, scenarioId }`, mirrored to `sessionStorage`
(`qadb:practice`), so a reload resumes. A session of another scenario is not resumed. The queue is
built once, so no question repeats; the end screen offers to reshuffle and start again. Only
Correct and Incorrect record an attempt; Next records nothing. Metadata stays blurred until clicked.
Questions deleted meanwhile are dropped from the queue.

### AI formatting

`/api/format-answer` calls the chat completions endpoint in `runtimeConfig.opencodeUrl`
(overridable with `NUXT_OPENCODE_URL`) with the key from `NUXT_OPENCODE_API_KEY` or
`OPENCODE_API_KEY`. It asks for formatting only, with no change of wording. 503 without a key, 502
when the service fails or returns nothing.

### Configuration and deployment

Server-only variables: `NUXT_TURSO_URL`, `TURSO_AUTH_TOKEN` (or `NUXT_TURSO_TOKEN`),
`NUXT_SESSION_PASSWORD` (32 characters or more), `OPENCODE_API_KEY`. Cookies are HTTP-only,
SameSite=Lax, and Secure in production.

A release that includes a migration needs the owner's explicit approval: back up, migrate, deploy in
the same window, verify. Rollback is restoring the backup and redeploying the previous version.

### Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | Shared rules, practice store, utilities, password hashing |
| API | Vitest on a throwaway `sqld` | Every route, ownership, filtering, sorting, cascades, database scripts |
| End-to-end | Playwright | Every user flow, with a stubbed AI service |

Server, shared, utility and store code must keep at least 90% line coverage. `tests/flows/` holds
page-driving steps without assertions, reusable by recording scripts. End-to-end runs use their own
ports and a fresh database, and refuse a database that is not local.

### Visual design

Design tokens (oklch, light and dark) in `app/assets/tokens.css`, ported from the prototype
`qadb-prototype.html`, which remains the reference for look and feel. The theme is stored in
`localStorage` (`qadb_theme`). Markdown is rendered with `markdown-it` and sanitized with
`isomorphic-dompurify`.
