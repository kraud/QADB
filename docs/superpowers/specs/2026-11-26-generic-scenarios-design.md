# Design: generic Q&A with user-defined scenarios

Date: 2026-11-26. Status: **approved** on 2026-11-26, including bulk editing (section 6.1).
Vocabulary: [`docs/glossary.md`](../../glossary.md).
Items marked **[call]** were decided while writing this document and have not been discussed.

## 1. Intent

QADB is built for one setup: front-end interview questions ranked by difficulty, importance and category, with fixed options in `shared/enums.ts`. It becomes a generic Q&A app where each user creates **scenarios** and defines their **attributes** and **options**. Question, answer and the right/wrong track record stay fixed, because performance tracking depends on them. The front-end setup becomes one scenario among many.

## 2. Goals, non-goals, anti-goals

**Goals**

1. A user can create a scenario, define attributes and options, and add questions that appear only in that scenario.
2. Scenarios stay editable after they have questions.
3. Existing data moves into a "Front-end interview questions" scenario with nothing lost.
4. Every current feature keeps working, generically.
5. The app has unit, API and end-to-end tests, usable later for Playwright-driven video recording.

**Non-goals:** sharing scenarios; templates or duplicating a scenario; import/export; moving questions between scenarios; free-text, number or date attributes; bulk editing or deleting anything other than attribute values; cross-scenario statistics or practice; CI pipeline; producing videos; visual redesign.

**Anti-goals:** hardcoded knowledge of difficulty, importance or category in app code (migration and seed data excepted); any loss of questions or attempts from the user's own account; development or tests touching the remote database.

## 3. Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Tables for scenarios, attributes, options, and one row per assigned option | Safe renames and deletes, database-checked references; more joins |
| B | Option choices stored as JSON on each question | Fewer joins; no reference checks, edits rewrite many rows |
| C (rejected) | A real database column per attribute | Runtime schema changes, no type checking |

A was chosen because scenarios must stay safely editable.

## 4. Data model

IDs are text (cuid2), timestamps are unix milliseconds, as today.

| Table | Columns |
|---|---|
| `users` | unchanged |
| `scenarios` | `id`, `user_id` → users (cascade), `name`, `created_at`, `updated_at` |
| `attributes` | `id`, `scenario_id` → scenarios (cascade), `name`, `selection_mode` (`single`/`multiple`), `ordered`, `required`, `position` |
| `options` | `id`, `attribute_id` → attributes (cascade), `label`, `color` (palette key), `position`, `is_default` |
| `questions` | `id`, `scenario_id` → scenarios (cascade), `question`, `answer`, `link`, `mastered`, `created_at`, `updated_at` |
| `question_options` | `question_id` → questions (cascade), `option_id` → options (cascade); primary key on both; index on `option_id` |
| `attempts` | unchanged |

- **[call]** `questions.user_id` is removed; ownership comes from the scenario. `answer_summary` is renamed `answer`.
- The app enforces what the database cannot: one option at most for single mode, and options belonging to the question's own scenario.
- Multi-row writes are atomic.
- A test must prove that cascades work on the database the app uses.

## 5. Scenario rules

| Rule | |
|---|---|
| Scenario name | Required, unique per user, case-insensitive **[call]** |
| Attributes | Zero or more **[call: zero gives a plain Q&A]**; unique names within the scenario |
| Options | At least 2 per attribute; unique labels within the attribute |
| Ordered | Single mode only **[call]**; option order is the sort order |
| Default options | Optional; at most one in single mode, any number in multiple. Preselected for new questions only |
| Required | New questions and attribute edits must include at least one option |
| Colors | Chosen from a fixed palette with light and dark values **[call]**; includes the exact colors used today |

### Editing a scenario with questions

| Change | Behavior |
|---|---|
| Rename, recolor, reorder, add option | Applied directly |
| Add attribute | Existing questions get no option; if required, they become incomplete |
| Turn "required" on | Questions without an option become incomplete |
| Delete option in use | Dialog shows the affected count and asks: move to another option, or leave empty **[call: "leave empty" choice]**. Moving never duplicates an option a question already has |
| Delete option when only 2 exist | Blocked until another is added |
| Delete attribute | Warns with the affected count; removes its values, keeps questions |
| Single → multiple | Applied directly; "ordered" is switched off |
| Multiple → single | **[call]** Warns with the count of questions holding several options; each keeps the first in option order |
| Delete scenario | **[call]** Requires typing its name; deletes its questions and attempts |

The scenario editor saves all changes in one atomic request **[call]**. Destructive changes must carry the user's choice; the server rejects them otherwise and reports affected counts.

## 6. Incomplete questions

A question is **incomplete** when it lacks an option for at least one required attribute.

- The content page shows "N incomplete questions" with a link that applies an **Incomplete** filter. The banner is hidden at zero.
- Incomplete rows are marked, and missing values show "—".
- Opening one in the editor highlights the missing attributes. Saving the editor requires them.
- Toggling mastered or recording an attempt still works.
- Practice includes them normally **[call]**.
- **[call]** Each attribute filter also has a **None** chip, to find empty values on optional attributes.

### 6.1 Bulk editing

Selected questions can be given attribute values in one step, mainly to fix incomplete ones.

- The selection bar gains **Edit attributes**, which opens a dialog: pick one attribute, an action and the option(s). It states how many questions will change.
- **[call]** Single mode: **Set** an option, or **Clear** (optional attributes only).
- **[call]** Multiple mode: **Add** options, **Replace** all with the chosen ones, or **Remove** the chosen ones. Add never duplicates.
- **[call]** An action that would leave a required attribute empty on any selected question is rejected as a whole, with the count.
- The change is atomic. It updates only that attribute and each changed question's `updated_at`.
- Afterwards the list refreshes. Questions that no longer match the filters leave the selection, as today.

## 7. Screens and navigation

| Route | Screen |
|---|---|
| `/` | Last opened scenario, otherwise the scenario list |
| `/scenarios` | List with question counts; create, edit, delete |
| `/scenarios/new`, `/scenarios/[sid]/edit` | Scenario editor: name, then attribute cards (name, selection mode, ordered, required, option rows with label, color, default, reorder, delete) |
| `/scenarios/[sid]/content` | Question table, filters, sort, selection |
| `/scenarios/[sid]/questions/[id]` | Question detail |
| `/scenarios/[sid]/practice`, `.../practice/random` | Practice |

- The header gains a scenario switcher. **Random Question** uses the current scenario and is hidden outside one.
- A user with no scenario sees "Create your first scenario".
- Table columns, filters, sort choices, editor fields, badges and practice metadata are generated from the scenario's attributes, in their order. Wide tables scroll horizontally.
- Editor controls: segmented control or chips for single mode, toggle chips for multiple. **[call]** Chips are used when there are more than 4 options. Optional attributes can be cleared.
- Practice keeps the blurred-until-clicked metadata. **[call]** One generic icon replaces the three attribute-specific icons.
- Text specific to interviews becomes generic ("Answer", "Link").
- **[call]** Reordering uses up/down buttons, which are accessible and easy to test.
- Light and dark themes and the 960px and 720px breakpoints stay.

## 8. API behavior

- Scenarios: list, create, read (with per-option usage counts), replace, delete.
- Questions are listed and created under a scenario; read, update and delete stay by question ID. Random practice fetches the scenario's IDs.
- Every route is scoped to the signed-in user; anything owned by someone else returns 404.
- A scenario-scoped bulk route applies one attribute change to a list of question IDs; every ID must belong to that scenario.
- Validation is built from the scenario definition, replacing the fixed zod enums.
- Question updates validate attribute values only when they are sent.
- Filtering: options within an attribute combine with OR (None included), attributes combine with AND. Incomplete, never done, mastered, attempt amount, recently failed and search work as today.
- Sorting: any ordered attribute, % correct, or attempt amount, with today's tiebreak. Empty attribute values sort last in both directions.
- Practice state stores the scenario ID.
- The AI "Format" button is unchanged.

## 9. Migration

A dedicated, versioned script. `drizzle-kit push` must not be used for this change, because it can drop data.

1. Refuse to run on an already migrated database, or on a remote one without an explicit flag.
2. Delete these test accounts by name, with their questions: `qadb-verify-0817`, `uitest`, `fuzzsearch_test_2026`, `verif_ta_814`, `smoketest_260815`.
3. For each remaining user with questions, create "Front-end interview questions":

| Attribute | Mode | Ordered | Required | Options (default in bold) |
|---|---|---|---|---|
| Difficulty | single | yes | yes | Easy, **Medium**, Hard |
| Importance | single | yes | yes | Low, **Mid**, High |
| Category | multiple | no | yes | HTML, CSS, **JS**, API, React, Domain |

4. Convert each question's values to `question_options` rows, keeping question IDs, dates and mastered flags.
5. **Abort, changing nothing, on any value that does not map.**
6. Rebuild `questions` without triggering the cascade that would delete `attempts`.
7. Verify against the source: question and attempt counts per remaining user, per-option counts, each question's option set, and foreign key integrity. Any mismatch fails the migration.

The expected result from the 2026-11-25 backup is 314 questions and 284 attempts for `kraud`. The test account `claude_test` (local only, no questions) is kept.

A script resets the local database from a backup so the migration can be rehearsed repeatedly.

**Remote rollout** happens only with the user's explicit approval: take a fresh backup, migrate, deploy the matching code in the same window, verify. Rollback is restoring the backup and redeploying the previous version. The branch is not merged to `main` before this.

## 10. Testing

**Order:** end-to-end tests for current behavior come first, before any refactor. They are then adapted to the generic UI, keeping the same expected behavior.

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | Scenario rules, validation, practice store, utilities |
| API | Vitest against a disposable database | Every route, ownership, filtering, sorting, cascades, migration |
| End-to-end | Playwright | Every user flow |

**Definition of full coverage [call, please check]:** every user flow has an end-to-end test, and server code, shared code, utilities and stores reach at least 90% line coverage. Components are covered through the end-to-end tests.

**Flows:** register, log in, log out, expired session; add, edit, delete, discard changes, Markdown preview, AI format (stubbed); each filter, search, each sort, selection and its adjustment; selected and random practice, end screen, resume after reload, mastered, track record; theme, mobile layout, not found. New: create, edit and delete a scenario; every row in section 5; incomplete questions; each bulk action and its rejection; scenario isolation.

**Isolation**

- Tests use their own ports and a freshly created database on each run.
- They refuse to start if the database address is not local.
- They sign in with the account in `.env.testuser`, creating that file if absent.
- No test calls the real AI service.

**Ready for video recording**

- A seed script creates demo scenarios (front-end, finance) containing no personal data.
- Reusable flow helpers (sign in, create scenario, practice) are separate from assertions, so recording scripts can import them.
- Controls are located by role and label.

## 11. Constraints

- Stack unchanged: Nuxt, Drizzle, Turso/libSQL, Vercel.
- The database client is HTTP only; local development runs `pnpm db:local`.
- Use pnpm 11; version 9 fails on `pnpm-workspace.yaml`.
- `.context/qadb-technical-design.md` is updated to match.

## 12. Order of work

1. Baseline tests on the current app.
2. Schema, migration and local rehearsal.
3. API.
4. Generic question screens.
5. Scenario management and incomplete questions.
6. Complete tests, demo seed, documentation.
7. Remote rollout, on approval.

## 13. Left to the builder

File layout, component breakdown, payload shapes, query construction, test helpers, ports, palette key names, and the wording of labels and warnings.
