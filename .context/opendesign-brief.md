# QADB — UI Design Brief for OpenDesign

Input document for generating the full UI design (mockups + design system) of **QADB**, a personal question-and-answer bank for frontend interview prep. This brief is the single source of truth for screen inventory, component behavior, and states. Functional behavior marked **[FIXED]** is dictated by the technical design (`.context/qadb-technical-design.md`) and MUST be honored in the visuals; items marked **[DESIGN DECISION]** are open and should be explored as options.

---

## 1. Product Overview

- **What:** A personal, self-hosted question bank. The user stores frontend interview questions (HTML, CSS, JS, API, React), tracks their practice record per question (attempts, % correct, chronology), filters/sorts the bank, and practices either a hand-picked subset or a random set.
- **Who:** One logged-in user (single-user app, username/password auth). Study sessions happen on desktop primarily, mobile secondary.
- **Core jobs (in priority order):**
  1. Quickly find a set of questions to practice (filter + sort + select).
  2. Practice: reveal answer, self-grade correct/incorrect, advance.
  3. Review: see per-question track record (times practiced, % correct, history).
  4. Manage: add, edit, delete questions; mark mastered.
- **Context:** Questions are sourced from GreatFrontend (each question may carry a direct URL to the original). The app is a personal study tool — calm, focused, low ceremony. This is the learning-focused alternative to flashcards.
- **Tech (irrelevant to visuals but defines interaction model):** Nuxt 3 SPA; all data via server API; session auth (sealed cookies); state persisted to sessionStorage during a practice session (reload resumes the session). No realtime, no offline mode, no sharing.

---

## 2. Fixed Functional Rules (design MUST respect these)

1. **Auth:** unauthenticated users are redirected to `/login` from every other screen. Root `/` redirects to `/content` (authed) or `/login`.
2. **Filters are AND-combined; each of difficulty / importance / category accepts multiple values simultaneously** (values within a filter are OR'd, filters across are AND'd; empty selection = filter inactive / all).
3. **NBD (never been done)** = question has zero recorded attempts. **Recently failed** = most recent attempt was incorrect AND there is ≥1 attempt.
4. **Sort:** single primary key — difficulty, importance, track-record %, or track-record amount — plus asc/desc. Default: `created_at asc`. (No multi-column sort in v1.)
5. **Selection:** checkboxes pick rows from the *currently filtered+sorted result*; "select all" targets the current result set, not the whole bank. Selection is an **ordered** array matching the current table order.
6. **Start practice:** if "Follow current sort/order" is checked, the queue copies selection order verbatim; if unchecked, the selection is shuffled. "Start practice" and the checkbox appear only when ≥1 row is selected.
7. **Practice session:** each question appears exactly once (permutation built once); progress is an index 0..n. "Next" is **always enabled** — skipping is allowed and records nothing. Only "Correct"/"Incorrect" record an attempt. End state: "No more questions" screen with a "Return to content" action.
8. **Mastered:** boolean flag, toggled in practice and on the question detail page; reversible.
9. **Track record:** `% correct` shown to 1 decimal; history items are `{ date+time, correct/incorrect }`.
10. **Random practice** (header button): identical practice UI, queue built from all question ids, shuffled.
11. **Create/Edit** — the technical design defines `POST`, `PATCH`, `DELETE` question endpoints but no UI; the app cannot be used without a way to add questions. **[GAP FILLED — DESIGN DECISION]** see Screen 4.

---

## 3. Design Direction

- **Vibe:** calm, focused, developer-adjacent study tool. Think Notion/Linear/Readwise grade of polish, not game-like. High readability for question text and answer text. No decorative clutter; whitespace and hierarchy do the work.
- **Theme:** light theme as the primary deliverable **[DESIGN DECISION: also provide a dark variant as an option — cheap to generate, likely wanted]**.
- **Color semantics (fixed meanings):**
  - Correct / success → green; Incorrect / danger → red (used for self-grade actions, track-record ✔/✘, recently-failed hints).
  - Mastered → a distinct "done" treatment (e.g. check badge / accent tint), clearly reversible.
  - Difficulty (easy/medium/hard) → 3-step scale, subtle, not traffic-light alarm.
  - Importance (low/mid/high) → 3-step scale, distinguishable from difficulty (different hue family).
  - Category (HTML/CSS/JS/API/React) → up to 5 distinct hues; strategy for future categories needed (badges must remain distinguishable as the list grows).
  - Never use color alone for status — pair with text/symbols (✔/✘, labels).
- **Typography:** readable text face (system UI stack or Inter); question prompts clearly larger than meta; **tabular numbers** for stats (counts, %, dates) so columns align.
- **Density:** medium — dense enough for a long question list, comfortable enough for reading. Answers and practice prompts get generous measure.
- **Accessibility baseline:** WCAG AA contrast; visible focus states; all interactive elements keyboard-operable and labeled (checkboxes, toggles, tri-state controls, multi-selects, dialogs); form fields labeled with associated error messages; no hover-only affordances.
- **Responsive:** desktop-first (table is the primary surface); tablet and mobile layouts required for: login/register, content (filters + list), practice (single-column), detail. **[DESIGN DECISION]** on mobile: filters collapse into a sheet/accordion; the table becomes horizontally scrollable or a card list.

---

## 4. Screen Map

```
/login ──────────────► /register
   │                        │
   ▼                        ▼
/content ◄──────────── /  (redirect: authed → /content, else /login)
   │ ▲
   │ │ (row click)          (Start practice)
   ▼ │
/questions/[id] ──────────► /practice (curated queue)
                                 │
                                 │ (header button, any screen)
                                 ▼
                            /practice/random
                                 │
                                 ▼
                         [No more questions] → Return to content
```

Screens (7 total):
1. Login (`/login`)
2. Register (`/register`)
3. Content — question bank hub (`/content`)
4. Question Create/Edit (modal or page; exercised from Content and Detail) **[GAP FILLED]**
5. Question Detail (`/questions/[id]`)
6. Practice — shared UI for curated + random (`/practice`, `/practice/random`)
7. End-of-queue state (within Practice)

Plus required non-screen states: 404 page, session-expired/redirect-to-login flow, empty/loading/error states per screen (see §9).

---

## 5. Screen Specs

### 5.1 Global — AppHeader (on Content, Detail, Practice; NOT on Login/Register)

- Brand/logo ("QADB" wordmark) → clickable to `/content`.
- Nav: **Content** (the only top-level destination in v1).
- User chip: username + **Log out** (logout returns to `/login`) **[logout placement is a DESIGN DECISION; header is recommended]**.
- **"Random Question" button — always visible, visually distinct** (the global quick action). One click → `/practice/random`. **[FIXED: launches the full pool shuffled; no scope picker in v1]**.
- Responsive: nav collapses; the Random Question button must remain reachable on mobile.

### 5.2 Login (`/login`)

- Centered, single-column card. Brand at top.
- Fields: **Username**, **Password** (type=password, with show/hide **[DESIGN DECISION]**).
- Primary button: **Log in** (loading state while submitting; disabled until valid input).
- Error: single inline alert "Invalid credentials" on 401 **[FIXED wording: generic by design — do not reveal which field failed]**.
- Link: "Don't have an account? **Register**" → `/register`.
- On success → `/content`. Empty state n/a; keep it minimal — no marketing copy, no imagery.

### 5.3 Register (`/register`)

- Same visual language as Login.
- Fields: **Username** (3–32 chars; letters, digits, `-`, `_` — show helper text), **Password** (min 8 chars — show helper text), optional **Confirm password** field **[DESIGN DECISION: recommended for safety]**.
- Inline validation errors per field; server error "That username is already taken" on 409 **[FIXED: unique constraint]**.
- Primary button: **Create account** — success auto-logs-in and goes straight to `/content` **[FIXED]**.
- Link: "Already have an account? **Log in**".

### 5.4 Content (`/content`) — the hub, most complex screen

Layout (top-level structure): **AppHeader** / **FiltersPanel + SortControl** / **QuestionTable** + selection toolbar.

**[DESIGN DECISION — produce options]** Filters placement: (A) left sidebar rail (desktop) + collapsible sheet (mobile), or (B) top filter bar row. SortControl sits adjacent to filters (or above the table on the right).

**FiltersPanel** — seven controls, all optional, all defaulting to "no filtering":
1. **Difficulty** — multi-select {easy, medium, hard}; chip-toggle group or checkbox dropdown **[DESIGN DECISION: chip group recommended — multi-value state must be legible at a glance]**; empty = all.
2. **Importance** — multi-select {low, mid, high}; same control pattern.
3. **Category** — multi-select {HTML, CSS, JS, API, React}; same pattern.
4. **NBD** (never been done) — tri-state segmented control: **All / Yes / No**.
5. **Mastered** — tri-state segmented control: **All / Yes / No**.
6. **Track record amount** — operator select (`>`, `<`, `=`) + integer input → "has been practiced more than/less than/exactly N times".
7. **Recently failed** — toggle switch, off = include everything, on = only questions whose last attempt was incorrect.
- Panel footer/header: **Reset filters** (clears all seven) + active-filter count badge (e.g. "3 active") so the user knows filtering is on.

**SortControl** — key select: **Difficulty / Importance / Track record % / Track record amount** + direction toggle **Asc/Desc**. Default state = `created_at asc` (show as "Newest/oldest" or "Default" — **[DESIGN DECISION]** label; behavior fixed: no key = created_at asc).

**QuestionTable** — columns (proposal; refine freely):
`[checkbox] | Question | Difficulty | Importance | Category | Practiced (count) | % correct | Last answered | Mastered | Link (icon)`.
- Row click (outside checkbox/actions) → `/questions/[id]` **[DESIGN DECISION: recommend whole-row click navigates; checkbox area is exclusive]**.
- Header row contains a **check-all** checkbox that targets the *current filtered+sorted result* ("Select all N shown" tooltip) — indeterminate state when some rows are selected.
- Column alignment: numbers/dates right-aligned with tabular figures; badges centered or leading per the badge pattern.
- Row states: default / hover / selected (highlighted) / mastered (subtle "done" tint on the mastered badge only).
- Row action (secondary): quick **Edit** icon → opens Create/Edit form; **Delete** icon with confirm dialog **[DESIGN DECISION: row actions vs actions only on Detail page — recommend both places]**.
- Empty states (distinct, see §9): (a) no questions at all → primary CTA "Add your first question"; (b) filters match nothing → "No questions match these filters" + Reset filters.

**Selection toolbar** — appears only when ≥1 row selected **[FIXED]** (could replace/augment the check-all row; recommend a fixed toolbar between sort and table or floating action bar):
- "N selected" count.
- **"Follow current sort/order"** checkbox (on = queue preserves table order, off = shuffle) **[FIXED behavior]**.
- **Start practice** primary button → `/practice` with the built queue.

### 5.5 Question Create/Edit (modal or page) **[GAP FILLED — DESIGN DECISION: modal recommended over both table and detail; also reachable via a persistent "Add question" button on Content]**

Form fields **[FIXED fields/constraints]**:
- **Question** — textarea, required (the prompt).
- **Answer summary** — textarea, required, "short, spoken-style" (what you'd say in an interview).
- **Difficulty** — segmented: easy / medium / hard.
- **Importance** — segmented: low / mid / high.
- **Category** — select or chip group: HTML / CSS / JS / API / React.
- **Link** — optional URL input ("Link to original GreatFrontend question").
- Edit mode additionally shows **Mastered** toggle and a danger zone: **Delete question** (with confirm dialog warning attempts are deleted too **[FIXED: cascade delete]**).
- Submit: **Save** / **Cancel**. Validation errors inline. Success closes the form and refreshes the list.

### 5.6 Question Detail (`/questions/[id]`)

- **Back to content** link (top).
- **Question prompt** — large, primary content.
- **Answer summary** — visible (this is the reference view, unlike Practice where it's hidden) in a distinct callout/tinted panel.
- Meta badges row: Difficulty, Importance, Category, Mastered (reversible toggle — a labeled switch, not just a badge, since it's the primary toggle surface **[FIXED: reversible here]**).
- **Link** → "Open original question" external-link affordance.
- Actions: **Edit** (opens Create/Edit form in edit mode), **Delete** (confirm dialog, cascade warning).
- **TrackRecord (full)** — "Times practiced: N · Correct: M · **X%** (1 decimal)" summary line, then **chronological history** newest-first or oldest-first **[DESIGN DECISION — produce options: compact table vs timeline]**; each entry: date+time, ✔ / ✘ (never color-only). Empty state: "Not practiced yet — practice this question to start a track record."
- The mastered toggle reflects changes made elsewhere (single source of truth).

### 5.7 Practice (`/practice` curated + `/practice/random` random) — one shared UI

- **AppHeader** present (Random Question button stays available; clicking it mid-session starts a fresh random session — note the session-reload behavior: state persists in sessionStorage, so refresh resumes at the current index **[FIXED]**).
- Mode label: curated → "Practice — N questions selected" (N = queue length); random → "Random practice".
- **Progress indicator**: "Question n of N" + thin progress bar (visible at top of the card).
- **PracticeCard**:
  1. Question prompt (large).
  2. **Show answer** primary button → reveals answer summary (smooth reveal **[DESIGN DECISION]**; answer stays visible once revealed).
  3. After reveal: self-grade row — **Correct** (green) and **Incorrect** (red) buttons; recording an attempt updates the track record below in place **[FIXED]**.
  4. **Mark as mastered** toggle under the prompt — **[DESIGN DECISION — produce options]**: always visible vs only after reveal; reversible, reflects on Detail.
  5. **Next** button — **always enabled** **[FIXED: skipping allowed, records nothing]**; label "Next question" (curated) / "Next random question" (random). On the last question it still advances to the end state.
- **TrackRecord (compact)** below the card: times practiced, % correct, chronological list (same components as Detail, smaller density).
- End state (index past last question): **"No more questions"** panel + **"Return to content"** button **[FIXED]**; optionally also a "Practice again" (reshuffle) **[DESIGN DECISION — optional nicety, keep minimal]**.

---

## 6. Component & State Inventory

| Component | States required |
|---|---|
| AppHeader | default; mobile-collapsed; unauthed (not shown) |
| Primary/Secondary/Icon buttons | default, hover, focus, pressed, disabled, loading |
| Text inputs / textareas | default, focus, filled, error (+ helper text), disabled |
| Chip-toggle multi-select (difficulty/importance/category) | empty, 1 selected, several selected, hover/focus |
| Tri-state segmented control (NBD, mastered) | all / yes / no, each with hover/focus |
| Operator+number filter (track record amount) | idle, focused, filled, invalid (non-integer) |
| Toggle switch (recently failed, follow-sort/order, mastered) | off, on, focus, disabled |
| Select dropdown (sort key, category) | closed, open, option hover, selected |
| Checkbox | unchecked, checked, indeterminate (check-all), hover, focus, disabled |
| Table row | default, hover, selected, mastered-tinted |
| Badges (difficulty/importance/category/mastered) | each value/level, subtle color coding |
| TrackRecord summary | with data; zero attempts; 1-decimal % |
| TrackRecord list | populated; empty; single entry |
| Dialog (create/edit, delete confirm) | open, focus trap, error inside form |
| Inline alert (auth/validation errors) | error tone; also info/success for transient feedback |
| Empty-state panels | no questions; no filter results; no attempts; end of practice |
| Progress bar + "n of N" | mid-progress; final |

---

## 7. UI Copy (fixed strings; propose microcopy for the rest)

| Context | String |
|---|---|
| Login errors | "Invalid credentials" |
| Register duplicate | "That username is already taken" |
| Username rule | "3–32 characters: letters, numbers, - and _" |
| Password rule | "At least 8 characters" |
| Filters | "Difficulty", "Importance", "Category", "Never been done", "Mastered", "Track record amount", "Recently failed", "Reset filters", "N active" |
| NBD label | "NBD" with tooltip "Never been done — no attempts yet" |
| Sort | "Sort by", "Ascending"/"Descending" |
| Selection | "N selected", "Select all N shown", "Start practice", "Follow current sort/order" |
| Table headers | "Question", "Difficulty", "Importance", "Category", "Practiced", "% correct", "Last answered", "Mastered", "Link" |
| Empty states | "No questions yet — add your first question", "No questions match these filters", "Not practiced yet", "No more questions" |
| Practice | "Show answer", "Correct", "Incorrect", "Mark as mastered", "Next question", "Next random question", "Question n of N", "Return to content" |
| Detail | "Back to content", "Open original question", "Edit", "Delete", "Times practiced", "Correct", "Delete question? This also deletes its practice history." |
| Header | "Content", "Log out", "Random Question" |

---

## 8. Sample Data (use to populate mockups realistically)

```text
Q1 "What is CSS specificity and how is it calculated?"        HTML   easy    mid   practiced 6×  83%  ✔ last week   mastered
Q2 "Explain the CSS box model."                               CSS    easy    high  practiced 9×  89%  ✔ 2d ago      mastered
Q3 "Describe the event loop in JavaScript."                   JS     hard    high  practiced 4×  50%  ✘ yesterday   —
Q4 "What is a closure? Give an example."                      JS     medium  high  practiced 7×  71%  ✔ 3d ago      —
Q5 "How does the browser render a page? (critical path)"      HTML   hard    high  practiced 3×  33%  ✘ 6d ago      —
Q6 "What is ARIA and when should you use it?"                 API    medium  mid   practiced 2×  100% ✔ today       —
Q7 "Explain the Virtual DOM and React reconciliation."        React  hard    mid   practiced 5×  60%  ✘ 1w ago      —
Q8 "What is React.memo and when would you use it?"            React  medium  low   practiced 1×  0%   ✘ 2w ago      —
Q9 "Fetch vs XHR: what are the differences?"                  API    medium  mid   practiced 0×  —    —  —           —
Q10 "What are semantic HTML elements? Name five."             HTML   easy    mid   practiced 0×  —    —  —           —
```

Also show: a mastered+recently-failed question coexisting, a question with a GreatFrontend link, category badge colors at 5 values. **Correct badge values to design:** difficulty easy/medium/hard, importance low/mid/high — give each a recognizable but calm treatment, mutually distinct.

---

## 9. State & Edge-Case Checklist (every screen must be designed for)

- **Loading:** initial fetch states (skeleton vs spinner — **[DESIGN DECISION]**, recommend skeletons for the table, spinners for inline actions).
- **Auth:** invalid credentials; duplicate username; redirect-to-login when session expires mid-use (Content/Detail/Practice → Login).
- **Empty:** zero questions; filters match nothing; zero attempts on a question; end of practice queue.
- **Selection:** 0 / 1 / several / all selected; indeterminate check-all; selection across filter changes (what happens to selection when filters change mid-selection — **[DESIGN DECISION]**: recommend clearing or re-anchoring selection visibly, since selection must match table order).
- **Practice:** answer hidden → revealed → graded; skip (Next without grading); last question → end state; reload mid-session (resume at index).
- **Forms:** validation errors per field; duplicate username; long question/answer text (multiline, wrap gracefully); long URLs.
- **Table:** long question prompts (ellipsis vs wrap — **[DESIGN DECISION]**, recommend wrap with line clamp); many rows (no pagination in v1 — list scrolls).
- **Responsive:** 1440 / 768 / 390 widths for: Login, Content (filters + table), Detail, Practice.

---

## 10. Deferred Decisions → Options Requested

Produce 2 options where marked, then a final recommendation per item:
1. Filters layout on Content: left sidebar vs top bar (and mobile sheet behavior).
2. Track-record history visual: compact table vs timeline (Detail + compact Practice variant).
3. Practice: "Mark as mastered" placement — always visible vs after reveal.
4. Mobile question list: horizontal-scroll table vs card list.
5. Dark theme variant: yes/no.
6. Create/Edit question: modal vs full page.
7. Empty/loading treatments: skeletons vs spinners.
8. Difficulty/importance/category badge palette strategy (extensible for future categories).

---

## 11. Deliverables & Handoff Format

For smooth translation to the Nuxt implementation (Vue SFCs named per the technical design), produce:
1. **All 7 screens** at 1440px; Login/Register/Content/Detail/Practice at 768 and 390px.
2. **Component library sheet** — every component from §6 with all states, named to match: `AppHeader`, `FiltersPanel`, `SortControl`, `QuestionTable`, `PracticeCard`, `TrackRecord` (plus primitives: buttons, inputs, selects, checkboxes, toggles, badges, dialogs, alerts, empty states, progress).
3. **Design tokens** — color palette (with semantic roles: accent, success, danger, mastered, difficulty scale, importance scale, category hues, neutrals), type scale, spacing, radius, shadow, for both themes.
4. **Flow annotations** — the two practice entry flows and the filter→select→practice flow marked on the Content and Practice screens.
5. Naming/format: keep component names stable so screenshots map 1:1 to Vue components.

---

## 12. Faithfulness Notes

- Everything marked **[FIXED]** is grounded in `.context/qadb-technical-design.md` (sections: Content Section, CRUD Endpoints, Practice Sessions, Track Record Semantics, Mastered Flag, Enums).
- The Create/Edit screen (Screen 4) fills a UI gap in the technical design (endpoints exist, UI was never specced); flagged for confirmation.
- Out of scope for v1 (do NOT design): multi-column sorting, random-question scope picker, pagination, sharing/multi-user, offline mode, gamification.
