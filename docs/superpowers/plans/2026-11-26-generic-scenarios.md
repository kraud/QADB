# Generic Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn QADB into a generic Q&A app where users define scenarios with their own attributes and options, with existing data migrated and a full test suite.

**Architecture:** Scenario rules are pure functions in `shared/`, used by client and server. Server logic lives in `server/services/` (takes a `db` argument); route files stay thin. A hand-written, atomic migration moves current data into normalized tables.

**Tech Stack:** Nuxt 4, Vue 3, Pinia, Drizzle + libSQL (HTTP), zod 3, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-generic-scenarios-design.md` (vocabulary: `docs/glossary.md`)

## Global Constraints

- Run package commands with pnpm 11 (`/opt/homebrew/bin/pnpm`); pnpm 9 fails on `pnpm-workspace.yaml`.
- Never connect to the remote database. `.env.remote` is not read by any code, script or test.
- Every database server binds to `127.0.0.1` (`sqld` directly, never `turso dev`).
- `drizzle-kit push` is never run for this change.
- No hardcoded difficulty, importance or category knowledge in app code once Task 10 ends (migration, seed and tests excepted).
- IDs are cuid2 text; timestamps are unix milliseconds.
- Every route is scoped to the signed-in user; others' resources return 404.
- Terms in code and UI follow the glossary: scenario, attribute, option, selection mode, ordered, required, default, incomplete.
- Light and dark themes and the 960px / 720px breakpoints stay.
- Controls are located by role and label; no `data-testid` unless no accessible name exists.
- Work on branch `generic-scenarios`. Never merge to `main` (Task 14 gates that).
- Unit and API tests pass at the end of every task. End-to-end tests pass after Tasks 1–2, are expected to fail during Tasks 5–9, and pass again from Task 10 on.

## Review Focus

1. Filter or sort parameters naming an attribute or option that was since deleted: ignored, never an error or an unexplained empty list (Task 7).
2. A resumed practice session pointing at a deleted question or scenario: the question is skipped, or the user lands on the scenario list, never a blank screen (Task 10).
3. Option, attribute or question IDs from another scenario or user, in create, update, bulk or move-to: 422/404 and nothing written (Tasks 6–8).
4. A scenario saved from a stale editor tab: rejected with conflicts when it would drop options or attributes in use (Task 6).
5. Names that are blank, padded, over-long, or differ only by case (including non-ASCII): rejected with a field-level message (Task 4).

---

### Task 1: Test harness and authentication baseline

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`, `tests/support/db-server.ts`, `tests/support/test-user.ts`, `tests/support/ai-stub.mjs`, `tests/support/global-setup.ts`, `tests/flows/auth.ts`, `tests/e2e/auth.spec.ts`, `tests/unit/utils.test.ts`, `tests/unit/password.test.ts`, `db/migrations/0000_baseline.sql`
- Modify: `package.json`, `.gitignore`, `nuxt.config.ts`, `server/api/format-answer.post.ts`

**Interfaces — Produces:**
- `startDbServer(port?: number): Promise<{ url: string; stop(): Promise<void> }>` — spawns `sqld --no-welcome -d <fresh temp dir> --http-listen-addr 127.0.0.1:<port>`, waits for `/health`; random free port when omitted.
- `loadTestUser(): { username: string; password: string }` — reads `.env.testuser` (`TEST_USER_USERNAME`, `TEST_USER_PASSWORD`); creates it (mode 0600, random 32-char password, `claude_test`) if absent.
- `signIn(page, user)`, `register(page, user)`, `signOut(page)` in `tests/flows/auth.ts`. Flow files import no `expect`.
- `runtimeConfig.opencodeUrl` (default `https://opencode.ai/zen/go/v1/chat/completions`, override `NUXT_OPENCODE_URL`).
- Scripts: `test` (`vitest run`), `test:coverage`, `test:e2e` (`playwright test`).

- [ ] **Step 1:** `git switch -c generic-scenarios`, then commit the existing uncommitted changes (`.env.example`, `.gitignore`, `package.json`, `docs/`) as `chore: local database setup, spec and plan`. `.claude/` stays ignored.
- [ ] **Step 2:** Add dev dependencies `vitest@^4.1`, `@vitest/coverage-v8@^4.1`, `@playwright/test@^1.64`, `h3@1.15.11`; run `pnpm exec playwright install chromium`.
- [ ] **Step 3:** Write `0000_baseline.sql` from the current schema (`sqlite3 -readonly ~/Documents/Backups/QADB/*.db .schema`), schema only, no data.
- [ ] **Step 4:** Write unit tests, run `pnpm test`, expect FAIL (no config), then add `vitest.config.ts` (aliases `~` → `app`, `#shared` → `shared`; coverage include `server/**`, `shared/**`, `app/utils/**`, `app/stores/**`; no threshold yet) and expect PASS.

```ts
it('shuffle returns a permutation without mutating input')          // sorted(out) equals sorted(in); in unchanged
it('rel formats now, minutes, hours, days, weeks')                  // 'now', '5m ago', '3h ago', '2d ago', '1w ago' with fake timers
it('fmtDT formats as "Aug 12, 2026 · 16:20"')
it('renderMarkdown strips script tags and keeps bold')
it('hashPassword verifies the right password and rejects others')    // prefix argon2$ ; malformed stored value → false
```

- [ ] **Step 5:** Configure Playwright: `testDir: tests/e2e`, `workers: 1`, base URL `http://localhost:3100`, trace on failure. `webServer` (never reuse): `sqld` on `127.0.0.1:8180` with a directory wiped at start; AI stub on 8190 (returns `**stub** <input>`); `pnpm build && node .output/server/index.mjs` with `PORT=3100`, `NUXT_TURSO_URL=http://127.0.0.1:8180`, empty `TURSO_AUTH_TOKEN` and `NUXT_TURSO_TOKEN`, a fixed test `NUXT_SESSION_PASSWORD`, `NUXT_SESSION_COOKIE_SECURE=false`, `NUXT_OPENCODE_URL=http://127.0.0.1:8190`, `OPENCODE_API_KEY=stub`. `global-setup.ts` throws unless the database host is `127.0.0.1` or `localhost`, applies `0000_baseline.sql`, and registers the test user.
- [ ] **Step 6:** Write `auth.spec.ts`:

```ts
test('register creates an account and lands on /content')
test('register rejects a taken username')              // "That username is already taken"
test('register validates fields')                      // "At least 8 characters", "Passwords don't match."
test('login with wrong password')                      // "Invalid credentials"
test('login, then log out, then /content redirects')   // URL /login?expired=1
test('an expired session shows the notice')            // clear cookies, act → "Your session expired — please log in again."
test('theme toggle persists across reload')            // html[data-theme=dark]
```

- [ ] **Step 7:** Run `pnpm test:e2e`; expect 7 passed. Confirm `git status` shows no `.env.testuser`, report or result folders.
- [ ] **Step 8:** Commit `test: add Vitest and Playwright harness with auth baseline`.

---

### Task 2: End-to-end baseline for current behavior

**Files:**
- Create: `tests/flows/questions.ts`, `tests/flows/practice.ts`, `tests/support/reset.ts`, `tests/e2e/{content,editor,detail,practice,layout}.spec.ts`
- Modify: `app/pages/content.vue` (`resetFilters`)

**Interfaces — Produces:** `addQuestion(page, input)`, `openEditor(page, text)`, `startSelectedPractice(page, texts, followOrder)`, `answerCurrent(page, correct)`; `resetUserData(request)` deletes all the test user's questions through the API. Each spec calls it in `beforeEach` and seeds through the API.

- [ ] **Step 1:** Write the specs. Assertions use today's exact copy.

```ts
// content
test('empty bank shows "No questions yet"')
test('each filter narrows the list')            // difficulty, importance, category, never done, mastered, amount > = <, recently failed
test('values OR within a filter and AND across filters')
test('search matches every word')
test('sort by difficulty, importance, % and amount in both directions')
test('select all, then filtering shows "Selection adjusted to the current results"')
test('no matches shows "No questions match these filters"')
test('Reset filters shows every question again, including never practiced ones')
// editor
test('add shows "Question added"'); test('required fields show errors'); test('edit shows "Question updated"')
test('delete warns with the attempt count, then "Question deleted"')
test('closing with typed changes asks "Discard changes?"')
test('Display tab renders Markdown'); test('Format replaces the answer with the stub result')
// detail
test('shows track record newest first'); test('mastered toggle persists'); test('unknown id shows the 404 panel')
// practice
test('curated practice follows table order when the switch is on')
test('grading records an attempt; Next records none'); test('end screen offers Practice again')
test('reload resumes at the same index'); test('random practice visits every question once')
test('random practice on an empty bank returns to content')
// layout, viewport 390x844
test('cards replace the table and Filters opens the panel')
```

- [ ] **Step 2:** Run `pnpm test:e2e`. Expect exactly one failure: the Reset filters test, because `resetFilters` sets `filters.op = '>'`.
- [ ] **Step 3:** Set it to `'all'`. Run again; expect all pass. Any other failure: investigate; fix the test if it misreads current behavior, otherwise report the bug to the user before changing app code.
- [ ] **Step 4:** Commit `test: baseline end-to-end suite; fix reset filters hiding unpracticed questions`.

---

### Task 3: Migration

**Files:**
- Create: `scripts/db/migrate.mjs`, `scripts/db/guard.mjs`, `scripts/db/migrations/0001-scenarios.mjs`, `scripts/db/reset-local.mjs`, `tests/api/migration.test.ts`, `tests/support/legacy-fixture.ts`
- Modify: `package.json` (`db:migrate`, `db:reset-local`)

**Interfaces — Produces:**
- `isLocalUrl(url: string): boolean` — hosts `127.0.0.1`, `localhost`, `::1`.
- `migrate(client, opts?: { log?: (s: string) => void }): Promise<string[]>` — applies pending migrations in order, records them in `_migrations`; a database that already has `users` is marked as having `0000`.
- CLI: reads `NUXT_TURSO_URL`; refuses non-local URLs without `--allow-remote`.
- `db:reset-local [backup.db]` — stops if port 8080 is in use; recreates `.localdb/dbs/default/data` from the given file, default the newest in `~/Documents/Backups/QADB/`.

Target tables (snake_case):
`scenarios(id, user_id→users CASCADE, name, created_at, updated_at)`;
`attributes(id, scenario_id→scenarios CASCADE, name, selection_mode, ordered, required, position)`;
`options(id, attribute_id→attributes CASCADE, label, color, position, is_default)`;
`questions(id, scenario_id→scenarios CASCADE, question, answer, link, mastered, created_at, updated_at)`;
`question_options(question_id→questions CASCADE, option_id→options CASCADE, PK both)`;
indexes on every foreign key column; `attempts` unchanged. Booleans are integer 0/1, positions start at 0.

Seeded scenario "Front-end interview questions":

| Attribute | mode, ordered, required | Options : color (default **bold**) |
|---|---|---|
| Difficulty | single, 1, 1 | Easy:blue-1, **Medium**:blue-2, Hard:blue-3 |
| Importance | single, 1, 1 | Low:gray-1, **Mid**:gray-2, High:gray-3 |
| Category | multiple, 0, 1 | HTML:orange, CSS:cyan, **JS**:yellow, API:violet, React:green, Domain:pink |

Removed accounts: `qadb-verify-0817`, `uitest`, `fuzzsearch_test_2026`, `verif_ta_814`, `smoketest_260815`.

**Approach (verified on sqld 0.24):** read and validate in JavaScript, then send every write in one `client.migrate([...])` call, which runs one transaction with foreign keys **off**. Consequences: dropping the old `questions` table keeps `attempts`; cascades do **not** fire, so the test accounts' attempts, questions and user rows are deleted explicitly. Verification is part of the same transaction: for each check, `create table _guard(ok integer check(ok = 1))`, `insert into _guard select (<condition>)`, `drop table _guard`, so a failed check rolls everything back.

- [ ] **Step 1:** Write `migration.test.ts` against `startDbServer()` with a fixture of the legacy schema: `kraud` with 4 questions covering every option, a two-category question, a mastered one and 5 attempts; one removed account with a question and attempt; one other account with no questions.

```ts
it('creates one scenario with the attributes, options, colors and defaults above')
it('keeps question ids, text, link, mastered and timestamps, with answer_summary as answer')
it('writes exactly the options each question had')
it('keeps every attempt of remaining users unchanged')
it('removes the named test accounts and their rows; keeps accounts without questions, with no scenario')
it('leaves no foreign key violations and cascades still delete afterwards')
it.each(['difficulty "extreme"', 'category "Vue"', 'category "not json"', 'category "[]"'])
  ('aborts and changes nothing for %s')              // schema and row counts identical, error names the question id
it('rolls back when a verification guard fails')     // inject an extra false condition
it('does nothing on a second run')
it('applies cleanly to an empty database')
it('isLocalUrl rejects libsql:// remote hosts')
```

- [ ] **Step 2:** Run `pnpm test`; expect FAIL (module not found).
- [ ] **Step 3:** Implement. `0001` exports `{ id: '0001-scenarios', up(client, { extraGuards? }) }`. Guards: per-user question and attempt counts equal the source, per-option row counts equal values computed from the source, total `question_options` equals the computed total, `pragma_foreign_key_check` is empty.
- [ ] **Step 4:** Run `pnpm test`; expect PASS.
- [ ] **Step 5:** Rehearse: `pnpm db:reset-local`, start `pnpm db:local`, `NUXT_TURSO_URL=http://127.0.0.1:8080 pnpm db:migrate`. Check with queries: `kraud` has 314 questions and 284 attempts; with the 2026-11-25 backup, difficulty is Easy 152, Medium 113, Hard 49. Then `pnpm db:reset-local` again.
- [ ] **Step 6:** Commit `feat: migrate data into scenarios`.

---

### Task 4: Shared scenario rules

**Files:**
- Create: `shared/scenario/{types,colors,schema,values,bulk,query}.ts`, `tests/unit/{scenario-schema,values,bulk,query}.test.ts`

**Interfaces — Produces:**

```ts
type SelectionMode = 'single' | 'multiple'
interface Option { id: string; label: string; color: ColorKey; position: number; isDefault: boolean }
interface Attribute { id: string; name: string; selectionMode: SelectionMode; ordered: boolean; required: boolean; position: number; options: Option[] }
interface Scenario { id: string; name: string; attributes: Attribute[] }   // arrays sorted by position
type AttributeValues = Record<string /* attributeId */, string[] /* optionIds, option order */>
const COLOR_KEYS = ['blue-1','blue-2','blue-3','gray-1','gray-2','gray-3','orange','cyan','yellow','violet','green','pink','red'] as const
const colorVar = (key: ColorKey) => `var(--c-${key})`
// schema.ts — positions come from array order; `ref` names a not-yet-saved option
const scenarioInputSchema   // { name, attributes: { id?, name, selectionMode, ordered, required, options: { id?, ref?, label, color, isDefault }[] }[] }
type ScenarioInput = z.infer<typeof scenarioInputSchema>
// values.ts
defaultValues(s: Scenario): AttributeValues
missingAttributeIds(s: Scenario, v: AttributeValues): string[]            // required and empty
validateValues(s: Scenario, v: AttributeValues, opts: { requireAll: boolean }): { path: ['values', string]; message: string }[]
// bulk.ts
type BulkAction = 'set' | 'clear' | 'add' | 'replace' | 'remove'
planBulk(attr: Attribute, items: { id: string; values: AttributeValues }[], action: BulkAction, optionIds: string[]):
  { ok: true; changes: { id: string; optionIds: string[] }[] } | { ok: false; reason: 'invalid' | 'would-empty'; count: number }
// query.ts
type SortKey = '' | 'pct' | 'amount' | `attr:${string}`
interface Filters { options: string[]; none: string[]; incomplete: boolean; nbd: 'all'|'yes'|'no'; mastered: 'all'|'yes'|'no'; op: 'all'|'>'|'<'|'='; n: number; recent: boolean; q: string }
emptyFilters(): Filters
buildQuestionQuery(f: Filters, sortKey: SortKey, sortDir: 'asc'|'desc'): string   // params: option, none, incomplete, nbd, mastered, amountOp (gt|lt|eq), amountValue, recentlyFailed, q, sortKey, sortDir
parseQuestionQuery(raw: Record<string, unknown>): { filters: Filters; sortKey: SortKey; sortDir: 'asc'|'desc' }
countActiveFilters(f: Filters): number
```

Limits: names 1–80 and labels 1–40 characters after trimming; uniqueness compares `trim().toLocaleLowerCase()`.

- [ ] **Step 1:** Write the tests.

```ts
it('accepts a scenario with zero attributes')
it('rejects an attribute with fewer than 2 options')
it('rejects ordered with multiple mode'); it('rejects two defaults in single mode'); it('allows several defaults in multiple mode')
it('rejects blank, over-long and case-duplicate names and labels, including "Éasy"/"éasy"')  // issue path points at the field
it('defaultValues preselects defaults and leaves the rest empty')
it('validateValues rejects two options in single mode, unknown attribute, unknown option, option of another attribute')
it('validateValues requires required attributes only when requireAll is true')
it('planBulk set/clear for single, add/replace/remove for multiple, with add never duplicating')
it('planBulk rejects actions that do not fit the mode, and clear/remove that would empty a required attribute, with the count')
it('planBulk lists only questions that actually change')
it('buildQuestionQuery and parseQuestionQuery round-trip')
it('parseQuestionQuery ignores malformed values')
```

- [ ] **Step 2:** Run `pnpm test`; expect FAIL. **Step 3:** Implement. **Step 4:** Expect PASS. **Step 5:** Commit `feat: shared scenario rules`.

---

### Task 5: Schema and scenario create, list, read, delete

**Files:**
- Modify: `db/schema.ts` (match Task 3), `server/utils/db.ts` (export `type Db`)
- Create: `server/services/scenarios.ts`, `server/api/scenarios/{index.get,index.post}.ts`, `server/api/scenarios/[sid]/{index.get,index.delete}.ts`, `tests/support/api-app.ts`, `tests/api/{schema,scenarios}.test.ts`

**Interfaces — Produces:**
- `createApiTest(): Promise<{ db: Db; as(user): (method, url, body?) => Promise<{ status: number; data: any }>; createUser(name): Promise<AuthUser>; close() }>` — starts `sqld`, runs `migrate`, stubs the Nitro auto-imports as globals (h3 helpers, `db`, `requireUser`, session functions), and mounts the real route files on an h3 router with `toWebHandler`, so route and service lines are covered. Each later task registers its routes here.
- `interface Usage { optionCounts: Record<string, number>; attributeCounts: Record<string, number>; multiValueCounts: Record<string, number> }`
- `listScenarios(db, userId): Promise<{ id; name; questionCount; incompleteCount }[]>` ordered by creation
- `getScenario(db, userId, sid): Promise<Scenario & { usage: Usage; questionCount: number; incompleteCount: number }>` (404)
- `requireScenario(db, userId, sid): Promise<Scenario>` (404)
- `createScenario(db, userId, input: ScenarioInput): Promise<Scenario>` (409 `That scenario name is already taken`)
- `deleteScenario(db, userId, sid, confirmName: string): Promise<void>` (422 unless the trimmed name matches exactly)

- [ ] **Step 1:** Write tests.

```ts
it('drizzle schema matches the migrated database')        // pragma table_info for each table equals the schema columns
it('creates a scenario with positions from array order and returns it')
it('rejects a duplicate name for the same user, allows it for another user')
it('rejects invalid input with 422 and writes nothing')
it('lists only own scenarios with question and incomplete counts')
it('returns usage counts')
it.each(['read','delete'])('%s of another user\'s scenario is 404')
it('delete requires the name, then removes questions, options and attempts')
it('requires a session')                                  // 401
```

- [ ] **Step 2:** Expect FAIL. **Step 3:** Implement; writes use `db.batch`. **Step 4:** Expect PASS. **Step 5:** Commit `feat: scenario create, list, read and delete`.

---

### Task 6: Editing a scenario

**Files:**
- Create: `shared/scenario/diff.ts`, `server/api/scenarios/[sid]/index.put.ts`, `tests/unit/diff.test.ts`, `tests/api/scenario-update.test.ts`
- Modify: `server/services/scenarios.ts`

**Interfaces — Produces:**

```ts
interface Resolutions { removedOptions?: Record<string, { moveTo: string | null }>; removedAttributes?: string[]; collapseToSingle?: string[] }  // moveTo: option id or new option ref
type Conflict =
  | { type: 'option-in-use'; attributeId: string; optionId: string; count: number }
  | { type: 'attribute-delete'; attributeId: string; count: number }
  | { type: 'multiple-to-single'; attributeId: string; count: number }
findConflicts(current: Scenario, next: ScenarioInput, usage: Usage, r: Resolutions): Conflict[]   // unresolved only, count > 0 only
updateScenario(db, userId, sid, input: ScenarioInput, r: Resolutions): Promise<Scenario>
// PUT body { scenario, resolutions }; 409 data { conflicts }; 422 for foreign ids or a bad moveTo
```

Apply order in one batch: move options, delete removed options and attributes, upsert the rest, then collapse multiple→single keeping the first by the **new** option order. Removing an attribute needs no per-option resolution. A move onto an option the question already has only drops the old row. Changed questions get a new `updated_at`.

- [ ] **Step 1:** Write tests, one per row of spec section 5.

```ts
it('rename, recolor, reorder and add apply with no resolutions and keep question values')
it('a new required attribute leaves questions incomplete'); it('turning required on does the same')
it('deleting an unused option needs nothing')
it('deleting a used option returns 409 with the count')
it('moveTo an existing option, to a new option by ref, and null'); it('move never duplicates in multiple mode')
it('rejects moveTo that is removed, in another attribute, or in another scenario')       // 422, unchanged
it('rejects dropping to one option')
it('deleting a used attribute needs confirmation and keeps the questions')
it('single to multiple keeps values'); it('multiple to single needs confirmation and keeps the first by new order')
it('rejects attribute or option ids from another scenario, writing nothing')
it('a stale payload omitting a newer in-use option returns 409')
it('a failed update leaves the scenario unchanged')
it('renaming to another scenario\'s name returns 409')
```

- [ ] **Step 2:** Expect FAIL. **Step 3:** Implement. **Step 4:** Expect PASS. **Step 5:** Commit `feat: edit scenarios safely`.

---

### Task 7: Questions, filtering, sorting, attempts

**Files:**
- Create: `server/services/questions.ts`, `server/api/scenarios/[sid]/questions/{index.get,index.post,ids.get}.ts`, `tests/api/{questions,filters}.test.ts`
- Modify: `server/api/questions/[id].{get,patch,delete}.ts`, `server/api/attempts.post.ts`, `shared/types/qadb.ts`
- Delete: `server/api/questions/{index.get,index.post,ids.get}.ts`, `server/utils/questions.ts`

**Interfaces — Produces:**

```ts
interface QuestionWithStats { id; scenarioId; question; answer; link: string | null; mastered: number; created_at; updated_at; values: AttributeValues; incomplete: boolean; stats: QuestionStats }
listQuestions(db, userId, sid, query: ReturnType<typeof parseQuestionQuery>): Promise<QuestionWithStats[]>
listQuestionIds(db, userId, sid): Promise<{ id: string }[]>
getQuestion(db, userId, id): Promise<QuestionWithStats & { attempts: AttemptRow[] }>
createQuestion(db, userId, sid, body: { question; answer; link?; values }): Promise<QuestionWithStats>      // requireAll true
updateQuestion(db, userId, id, body: Partial<{ question; answer; link: string | null; values; mastered: 0|1 }>): Promise<QuestionWithStats>   // values replaces all; validated only when sent
deleteQuestion(db, userId, id): Promise<void>
recordAttempt(db, userId, questionId, correct: 0|1): Promise<QuestionWithStats>
```

Query rules: unknown option or attribute ids are dropped before building SQL. Per attribute, `(has any chosen option) OR (none chosen AND has no option)`; attributes AND together. `incomplete` = some required attribute has no row. Attribute sort uses the option position, empty last in both directions; pct, amount and the `created_at, id` tiebreak behave as the old route did. A sort key for a missing or unordered attribute falls back to the default.

- [ ] **Step 1:** Write tests.

```ts
it('creates with values; rejects missing required, two in single mode, foreign option ids')
it('patching mastered works on an incomplete question'); it('patching values requires required attributes')
it('delete removes attempts'); it('attempts return refreshed stats')
it.each(routes)('%s on another user\'s question or scenario is 404')
it('lists only the scenario\'s questions')                          // isolation across two scenarios
it('OR within an attribute, AND across attributes'); it('none, alone and combined with options')
it('incomplete filter'); it('nbd, mastered, amount gt/lt/eq, recently failed, multi-word search with % and _')
it('sorts by ordered attribute both ways with empty last'); it('sorts by pct and amount as before')
it('ignores deleted or unknown filter and sort ids')                // same result as without them
```

- [ ] **Step 2:** Expect FAIL. **Step 3:** Implement. **Step 4:** Expect PASS. **Step 5:** Commit `feat: scenario-scoped questions API`.

---

### Task 8: Bulk edit API

**Files:** Create `server/services/bulk.ts`, `server/api/scenarios/[sid]/questions/bulk.patch.ts`, `tests/api/bulk.test.ts`

**Interfaces:** `bulkEdit(db, userId, sid, body: { questionIds: string[] /* 1–2000 */; attributeId: string; action: BulkAction; optionIds: string[] }): Promise<{ updated: number }>`; uses `planBulk`; 422 `data: { reason, count }`.

- [ ] **Step 1:** Write tests.

```ts
it.each(['set','clear','add','replace','remove'])('applies %s and bumps updated_at only on changed questions')
it('rejects emptying a required attribute, changing nothing, with the count')
it('rejects a question, attribute or option from another scenario, changing nothing')
it('handles 1000 questions in one atomic request')
it('leaves other attributes, mastered and attempts untouched')
```

- [ ] **Step 2:** Expect FAIL. **Step 3:** Implement. **Step 4:** Expect PASS. **Step 5:** Commit `feat: bulk edit attribute values`.

---

### Task 9: Navigation, content table and filters

**Files:**
- Create: `app/pages/scenarios/index.vue` (list only), `app/pages/scenarios/[sid]/content.vue`, `app/composables/useScenario.ts`, `app/components/ScenarioSwitcher.vue`, `app/components/AttributeBadges.vue`, `app/utils/scenario-route.ts`
- Modify: `app/pages/index.vue`, `app/pages/{login,register}.vue` (go to `/`; neutral copy), `app/components/{AppHeader,FiltersPanel,SortControl,QuestionTable}.vue`, `app/components/ui/Chip.vue` (`aria-pressed`), `app/components/ui/Badge.vue`, `app/assets/tokens.css`, `app/middleware/auth.global.ts`, `app/error.vue`
- Delete: `app/pages/content.vue`
- Test: `tests/unit/scenario-route.test.ts`

**Interfaces — Produces:**
- `useScenario(sid: Ref<string>)` → `{ scenario, pending, error, refresh }`
- `homePath(scenarios: { id: string }[], lastId?: string): string` — `/scenarios/<last or only>/content`, else `/scenarios`
- Cookie `qadb_scenario` stores the last opened scenario.
- `<AttributeBadges :scenario :values :blurred? />` renders badges in attribute then option order, "—" for empty.
- `tokens.css`: `--c-<key>` in both themes, taking the current `--diff-*`, `--imp-*`, `--cat-*` values for the matching keys; one `.badge-option` class replaces `badge-diff/imp/cat`.
- Accessible names: each filter group is `role="group"` labelled with the attribute name, chips include "None"; switcher is labelled "Scenario"; sort select "Sort by".
- Protected routes: everything except `/`, `/login`, `/register`.

- [ ] **Step 1:** Unit test `homePath` (last known; stale last id; exactly one; several without last; none). Expect FAIL, implement, expect PASS.
- [ ] **Step 2:** Build the screens. Columns, filters and sort choices derive from the scenario; sort offers ordered attributes only; the table scrolls horizontally; Random Question shows only inside a scenario. No scenarios: "Create your first scenario".
- [ ] **Step 3:** `pnpm typecheck` shows errors only in editor, detail and practice files (Task 10).
- [ ] **Step 4:** Commit `feat: generic content screen and scenario navigation`.

---

### Task 10: Editor, detail, practice; baseline suite restored

**Files:**
- Create: `app/pages/scenarios/[sid]/questions/[id].vue`, `app/pages/scenarios/[sid]/practice/{index,random}.vue`, `app/components/AttributeField.vue`, `tests/support/scenario-fixture.ts`, `tests/unit/practice-store.test.ts`
- Modify: `app/components/{QuestionEditorModal,PracticeCard,PracticeSession,TrackRecord}.vue`, `app/stores/practice.ts`, all Task 1–2 flows and specs, `tests/support/{global-setup,reset}.ts`
- Delete: `app/pages/questions/[id].vue`, `app/pages/practice/*`, `shared/enums.ts`

**Interfaces — Produces:**
- `practice.start(mode, ids, scenarioId)`; state gains `scenarioId`; stored state without it is discarded.
- `<AttributeField :attribute v-model="string[]" :error? />` — segmented control for single mode with up to 4 options, otherwise chips; optional attributes can be cleared.
- `createFrontendScenario(request): Promise<Scenario>` — the fixture matching the migrated scenario. `global-setup` now runs `migrate`; `resetUserData` deletes the user's scenarios.

- [ ] **Step 1:** Store tests: `start` records the scenario; persisted state resumes; legacy state is ignored; `reset` reshuffles. Expect FAIL, implement, expect PASS.
- [ ] **Step 2:** Build the screens. Editor labels "Question", "Answer", "Link"; preselects defaults when adding; marks missing required attributes on open; the dirty check includes attribute values. A detail URL whose question belongs elsewhere shows the 404 panel. Practice metadata uses one generic icon and keeps blur-until-click.
- [ ] **Step 3:** Adapt the Task 2 specs to scenario routes and the fixture, keeping every behavior assertion. Add:

```ts
test('closing after changing only an attribute asks "Discard changes?"')
test('resuming practice after the current question was deleted skips to the next one')
test('resuming practice after the scenario was deleted lands on the scenario list')
test('random practice stays inside the current scenario')
```

- [ ] **Step 4:** `pnpm typecheck && pnpm test && pnpm test:e2e` — all pass. `grep -rniE "difficulty|importance|categor" app server shared db/schema.ts` prints nothing.
- [ ] **Step 5:** Commit `feat: generic editor, detail and practice`.

---

### Task 11: Scenario management screens

**Files:**
- Create: `app/pages/scenarios/new.vue`, `app/pages/scenarios/[sid]/edit.vue`, `app/components/scenario/{ScenarioForm,AttributeCard,OptionRow,ColorPicker,ResolveChangesDialog,DeleteScenarioDialog}.vue`, `app/utils/scenario-form.ts`, `tests/unit/scenario-form.test.ts`, `tests/flows/scenarios.ts`, `tests/e2e/scenarios.spec.ts`
- Modify: `app/pages/scenarios/index.vue`

**Interfaces — Produces:** `emptyForm(): ScenarioInput` (no attributes); `toForm(s: Scenario): ScenarioInput`; `newAttribute()` (single, 2 blank options with refs); `move(list, from, to)`. `createScenario(page, def)` flow.
Accessible names: "Scenario name", "Attribute name", "Selection mode", "Ordered", "Required", "Option label", "Color", "Default", "Add attribute", "Add option", "Move up", "Move down", "Delete option <label>", "Delete attribute <name>", "Save scenario".
Conflicts are computed with `findConflicts` before saving; a server 409 reopens the dialog with the server's counts.

- [ ] **Step 1:** Unit test the form helpers (switching to multiple clears ordered; switching to single keeps only the first default). Expect FAIL, implement, expect PASS.
- [ ] **Step 2:** Write the specs.

```ts
test('create a scenario with a single and a multiple attribute, then add and practice a question')
test('a new scenario shows none of another scenario\'s questions')
test('field errors for duplicate names and fewer than 2 options')
test('leaving the editor with changes asks to discard')
test('rename, recolor and reorder show up in the table')
test('delete an option in use: move; then delete another: leave empty')
test('delete an attribute in use after the warning'); test('multiple to single after the warning')
test('delete a scenario by typing its name')
test('a new user sees "Create your first scenario"')
```

- [ ] **Step 3:** Expect FAIL; build; expect `pnpm test:e2e` PASS. **Step 4:** Commit `feat: scenario management`.

---

### Task 12: Incomplete questions and bulk editing screens

**Files:** Create `app/components/{IncompleteBanner,BulkEditDialog}.vue`, `tests/e2e/{incomplete,bulk}.spec.ts`; modify `content.vue`, `FiltersPanel.vue`, `QuestionTable.vue`, `tests/flows/questions.ts`

**Interfaces:** consumes `planBulk` for the dialog's affected count and rejection message. Banner copy `N incomplete question(s)` with button "Show"; filter switch "Incomplete"; rows show an "Incomplete" badge; selection bar button "Edit attributes"; dialog controls "Attribute", "Action", "Apply".

- [ ] **Step 1:** Write the specs.

```ts
test('adding a required attribute shows the banner; Show lists the incomplete questions')
test('the editor highlights what is missing and blocks save until chosen')
test('mastered and practice work on an incomplete question')
test('banner disappears when none remain')
test('bulk set fixes all selected; fixed rows leave the filtered selection')
test('bulk add, replace and remove on a multiple attribute'); test('bulk clear on an optional attribute')
test('removing the last option of a required attribute is refused with the count')
test('bulk dialog works at 390px width')
```

- [ ] **Step 2:** Expect FAIL; build; expect PASS. **Step 3:** Commit `feat: fix incomplete questions in bulk`.

---

### Task 13: Demo data, coverage gate, documentation, local migration

**Files:** Create `scripts/db/seed-demo.mjs`, `tests/api/seed.test.ts`, `README.md`; modify `package.json` (`db:seed-demo`), `vitest.config.ts`, `.env.example`, `.context/qadb-technical-design.md`

**Interfaces:** `seedDemo(client, userId): Promise<void>` creates "Front-end demo" and "Finance demo" (attribute "Type": Domestic, Commerce, International) with invented questions and attempts; re-running replaces only those two. CLI `pnpm db:seed-demo --user <name>`, local URLs only.

- [ ] **Step 1:** Seed tests: creates both, is repeatable, leaves other scenarios alone, refuses remote. Fail, implement, pass.
- [ ] **Step 2:** Set `coverage.thresholds.lines: 90`; run `pnpm test:coverage`; add tests until it passes.
- [ ] **Step 3:** Check every flow in spec section 10 has a named end-to-end test; add any missing.
- [ ] **Step 4:** README: local database, migrate, reset, seed, test commands, flows reuse for recording. Update the technical design to the new model.
- [ ] **Step 5:** `pnpm db:reset-local`, start `pnpm db:local`, migrate, seed `claude_test`. Run `pnpm typecheck && pnpm test:coverage && pnpm test:e2e && pnpm build`; all pass. Click through the migrated data as `claude_test` and report what was seen.
- [ ] **Step 6:** Commit `docs: demo data, coverage gate and docs`.

---

### Task 14: Remote rollout (only on explicit user approval)

Stop after Task 13 and ask. Do not run any of this unprompted.

- [ ] Confirm how Vercel deploys (which branch, whether previews use the remote database).
- [ ] Take a fresh backup to `~/Documents/Backups/QADB/`; restore it locally and rehearse the migration on it.
- [ ] With the user's go-ahead: migrate with `--allow-remote` using `.env.remote` values passed explicitly, merge and deploy in the same window.
- [ ] Verify counts and sign-in. Rollback: restore the backup, redeploy the previous commit.
