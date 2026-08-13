# QADB Onboarding — from React/Next to Vue/Nuxt

You know React, Next.js, Node, Postgres, Drizzle. QADB is Vue 3 + Nuxt 4 + Nitro (Node) + Turso (libSQL = SQLite) + Drizzle. Same skills, different dialect. This walks you through the mental model and then through this exact codebase.

---

## 1. The one-paragraph mental model

A **Vue SFC** (`.vue` file) is a single file with three blocks: `<template>` (HTML, not JSX), `<script setup>` (the component logic — think the body of your React component function), and optional `<style>` (scoped by default).

**Reactivity is "proxies you mutate", not "immutable state you replace".** You never call a setter. You mutate a value and Vue re-renders whatever reads it. That's the single biggest shift. Everything else maps 1:1.

---

## 2. React → Vue translation table

| React | Vue 3 (this project) | Notes |
|---|---|---|
| `useState(0)` → `[count, setCount]` | `const count = ref(0)` → `count.value = 1` | `ref` is a *box*. Mutate the box in script; in template it auto-unwraps: `{{ count }}`. |
| `useState` with an object + spread to update | `const state = reactive({ a: 1 })` → `state.a = 2` | `reactive` = deeply-reactive plain object. Mutate directly, no immutability ceremony. |
| `useMemo(() => x, [deps])` | `computed(() => x)` | No dependency array. Tracks reads automatically. |
| `useEffect(() => {...}, [deps])` | `watch([a, b], () => {...})` | Explicit deps + options: `{ deep, immediate }`. `onMounted` ≈ `useEffect(..., [])`. |
| Props | `defineProps<{ id: string }>()` | Compile-time macro; also `defineModel` for v-model. |
| Callback props (`onSave`) | `defineEmits<{ (e: 'saved'): void }>()` + `emit('saved')` | Children *emit events*, parents listen `@saved="fn"`. |
| `value` + `onChange` | `v-model` | `v-model="x"` = `:model-value="x" @update:model-value="x = $event"`. |
| JSX `{items.map(x => <li/>)}` | `<li v-for="x in items" :key="x.id">` | `:key` everywhere, like React. |
| `{cond ? <A/> : <B/>}` | `<A v-if="cond" /> <B v-else />` | |
| `onClick={() => fn()}` | `@click="fn"` | `@` = event listener. `@click.stop` = `e.stopPropagation()`. |
| `style={{ color: 'red' }}` | `:style="{ color: 'red' }"` | `:` = dynamic binding. `:href`, `:class`, `:id`… |
| `class={cond && 'active'}` | `:class="{ active: cond }"` | |
| Render props / children | `<slot />` (+ named `<slot name="icon">`) | `v-if="label \|\| $slots.default"` tests slot presence. |

**Template gotcha:** template expressions are plain JavaScript — no TypeScript. `questionId!` (non-null assertion) **throws a compile error** in a template; move it into a function in `<script setup>` (I hit this).

---

## 3. SFC anatomy

```vue
<script setup lang="ts">
// — the "component body" —
// refs, computeds, watchers, handlers. Everything here is visible in the template.
// Auto-imports: ref, computed, watch, onMounted, useRoute, navigateTo… are GLOBAL —
// no `import { ref } from 'vue'` needed (Nuxt auto-imports them).
const count = ref(0)
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>

<!-- <style scoped> would scope CSS to this component via data-attributes.
     QADB uses ONE global stylesheet instead — see §6.4. -->
```

`<script setup>` runs once per component instance, top to bottom. `defineProps`/`defineEmits`/`definePageMeta` are compile-time macros (they disappear after build).

---

## 4. Nuxt 4 vs Next.js

| Next.js | Nuxt 4 (this project) |
|---|---|
| `app/` (route segments) | `app/pages/` — **file-based**, one file per route |
| `page.tsx` | `app/pages/content.vue` |
| `app/users/[id]/page.tsx` | `app/pages/questions/[id].vue` — param via `useRoute().params.id` |
| `layout.tsx` | `app/layouts/default.vue` (+ `app/layouts/auth.vue`) |
| `middleware.ts` | `app/middleware/auth.global.ts` (runs on server **and** client) |
| `route handlers` (`route.ts`) | `server/api/**` — Nitro route handlers |
| `getServerSideProps` / RSC fetch | `useAsyncData` / `useFetch` (server + client, hydrates) |
| `next.config` | `nuxt.config.ts` |
| `process.env.*` | `runtimeConfig` (server-only secrets) |
| Env in `.env` | `.env` loaded automatically; `NUXT_*` prefix maps to runtimeConfig |

**Nuxt 4 directory layout (this project):**

```
app/                  ← everything client-side (srcDir; `~` alias → this dir)
  pages/              ← routes
  components/         ← auto-imported by filename (see §4.1)
  layouts/            ← default.vue, auth.vue
  middleware/         ← route middleware
  stores/  composables/  utils/  plugins/  assets/
shared/               ← shared between client AND server (`#shared` alias)
db/                   ← Drizzle schema (root-level, per design doc)
server/               ← Nitro: api routes, middleware, utils
  api/                ← one file per endpoint: `questions/index.get.ts` = GET /api/questions
  middleware/01.session.ts   ← runs before every server request
  utils/              ← auto-imported server-side helpers (db, auth, password…)
```

### 4.1 Auto-imports — the biggest ergonomic shift

Nuxt auto-imports **everything** by convention — no import statements:

- **Components:** `app/components/QuestionTable.vue` → `<QuestionTable />` anywhere. `nuxt.config.ts` sets `pathPrefix: false` so `app/components/ui/Btn.vue` → `<Btn />` (not `<UiBtn />`).
- **Composables:** any `app/composables/useX.ts` export → `useX()` globally.
- **Server utils:** `server/utils/db.ts` exports (`db`, `requireUser`, …) → available in every `server/api/**` route with no import.
- **Vue/Nuxt APIs:** `ref`, `computed`, `watch`, `onMounted`, `useRoute`, `useRouter`, `navigateTo`, `useFetch`, `$fetch` — all global.

This is why files look import-light. If a name isn't resolving, check the convention — it's usually an auto-import path problem.

### 4.2 Routing & guards

- `app/middleware/auth.global.ts` — `.global` = runs on **every** navigation. It redirects unauthenticated users from `/content`, `/questions/*`, `/practice*` to `/login?expired=1`. Because it's universal, it produces a real **302 during SSR** (curl sees it) *and* guards SPA navigation client-side.
- `definePageMeta({ layout: 'auth' })` in `login.vue`/`register.vue` opts out of the `default` layout (which has the `AppHeader`).
- **Route nesting trap (I hit this):** having both `pages/practice.vue` *and* `pages/practice/random.vue` makes Nuxt treat `practice.vue` as the *parent* route — `/practice/random` renders the parent without the child unless the parent has a `<NuxtPage />` outlet. Fix: `pages/practice/index.vue` + `pages/practice/random.vue` (both become siblings). That's what QADB does.

### 4.3 Server routes (Nitro)

A file's path = the route; the method suffix = the HTTP method:

```ts
// server/api/questions/index.get.ts   →  GET /api/questions
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)      // throws 401 if no session
  const query = getQuery(event)              // parsed query string
  const body = await readBody(event)         // parsed JSON body
  const id = getRouterParam(event, 'id')     // [id] segment
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { ... }                             // JSON-serialized automatically
})
```

Nuxt **auto-imports h3's helpers**: `defineEventHandler`, `getQuery`, `readBody`, `getRouterParam`, `createError`, `setResponseStatus`. Note the Nuxt route file structure: a literal `ids.get.ts` wins over a dynamic `[id].get.ts` (Nitro's radix router), so `/api/questions/ids` and `/api/questions/:id` coexist.

### 4.4 Data fetching

- `useAsyncData(key, () => fetch())` — the SSR-safe version. Runs on the server during SSR **and** on the client; the server result is serialized into the HTML payload so hydration doesn't refetch. Returns `{ data, pending, error, refresh }`. Used in `app/pages/questions/[id].vue`.
- `useFetch` = `useAsyncData` + `$fetch` sugar.
- **SSR cookie trap (I hit this):** the global `$fetch` makes a *fresh* HTTP request during SSR and **drops the session cookie** → your authed API call 401s server-side while working client-side. Use `useRequestFetch()` — it forwards the incoming request's cookies. That's exactly what `app/composables/useApi.ts` does:
  ```ts
  const requestFetch = useRequestFetch()
  return (await requestFetch(url, opts)) as T
  ```
- Client-only flows (`onMounted`) use plain `$fetch` — the browser sends cookies automatically.

---

## 5. State — Pinia (this is Zustand)

`app/stores/practice.ts` is a **setup store** (like Zustand's `create` with hooks):

```ts
export const usePracticeStore = defineStore('practice', () => {
  const mode = ref<'curated' | 'random'>('curated')   // state
  const queue = ref<string[]>([])
  function start(m, ids) { ... }                       // actions
  watch([mode, queue, index], persist, { deep: true }) // side effect
  return { mode, queue, index, start, ... }
})
```

`usePracticeStore()` returns a reactive singleton; `store.queue` is reactive and auto-unwrapped in templates. It mirrors itself to `sessionStorage` (`qadb:practice`) so a reload resumes the session — that's the persistence trick.

---

## 6. The data layer — Turso / Drizzle

### 6.1 Turso vs Postgres

Turso is a managed **libSQL** database — SQLite-wire-compatible over the network. Differences from Postgres you'll care about:

- **Dialect:** SQLite. No `SERIAL`, no enums-as-types, no native `DATE`/timestamps — everything is `INTEGER`/`TEXT`. QADB stores timestamps as **unix milliseconds** in integer columns.
- **Schema changes:** `drizzle-kit push` syncs schema directly (dev); for production you'd run it once against the remote DB. No migration files in this project (`out: './drizzle'` is set but unused).
- **URLs:** `libsql://host.turso.io` (network). The project uses the **pure-JS** `@libsql/client/http` + `drizzle-orm/libsql/http` adapter (no native binary, serverless-safe) — it serves `libsql:`/`https:`/`http:` only, **not** `file:`. `drizzle.config.ts` auto-picks `sqlite` vs `turso` dialect from the URL prefix for `drizzle-kit push`.
- **`createClient({ url, authToken })`** — the auth token is passed to the client, not a connection string password.

### 6.2 Drizzle, schema-first

`db/schema.ts` is your `schema.prisma` equivalent — tables as TS:

```ts
export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mastered: integer('mastered').notNull().default(0),
  created_at: integer('created_at').notNull().default(nowMs),  // sql`(CAST(strftime('%s','now') AS INTEGER) * 1000)`
}, (table) => [index('questions_user_id_idx').on(table.user_id)])
```

The **queries are SQL-builder style**, not Prisma-style:

| Prisma | Drizzle (this project) |
|---|---|
| `prisma.user.findUnique({ where: { id } })` | `db.select().from(users).where(eq(users.username, username)).limit(1)` |
| `prisma.user.create({ data })` | `db.insert(users).values({ ... })` |
| `prisma.question.update({ where, data })` | `db.update(questions).set({ ... }).where(eq(...))` |
| `prisma.question.delete({ where })` | `db.delete(questions).where(eq(...))` |
| include/relation | **manual joins**: `leftJoin(statsSubquery, eq(questions.id, stats.questionId))` |

**Drizzle gotchas I hit:**

- **Raw SQL in selects needs aliases.** `count(attempts.id)` in a subquery can't be referenced from the outer query unless aliased: `count(attempts.id).as('attemptCount')`.
- **`sum()` types as `string | null`** in SQLite. Fix: `.mapWith(Number)`.
- **Correlated subqueries:** `${attempts.question_id}` inside a `sql` template renders as the *unqualified* `"question_id"` — which resolves to the *inner* aliased table (`a`), breaking the correlation. Write the qualified name literally: `where a.question_id = attempts.question_id` (see `server/utils/questions.ts`).
- `mapWith`, `.as()`, `sql` template interpolation — your power tools for computed columns like the stats subquery.

### 6.3 The stats subquery pattern

`server/utils/questions.ts` builds a reusable aggregate (`attemptCount`, `correctCount`, `lastAnsweredAt`, `lastCorrect`) as a Drizzle subquery, LEFT JOINed onto `questions` by every route. `mapQuestionRow()` shapes joined rows into the wire format (`trackRecordPct = correct*100/attempt`, `null` when unanswered). Filters like `nbd`, `recentlyFailed`, and sorting by `pct`/`amount` operate on those joined columns via `sql` fragments and `CASE` expressions. This is the file to understand before touching any list/detail endpoint.

---

## 7. Auth in this project

- `server/utils/password.ts` — argon2id via `@node-rs/argon2`, PBKDF2 fallback, hashes prefixed `argon2$`/`pbkdf2$` so `verifyPassword` dispatches on the prefix. **Note:** it shadows nuxt-auth-utils' built-in `hashPassword`/`verifyPassword` (scrypt) — Nuxt logs a "Duplicated imports" warning; the project's version wins (by design).
- `nuxt-auth-utils` — sealed-cookie sessions. Server: `setUserSession(event, { user: { id, username } })`, `getUserSession(event)`, `clearUserSession(event)`. Client: `useUserSession()` → `{ loggedIn, user, fetch, clear }`.
- `server/middleware/01.session.ts` — reads the sealed session and stuffs `event.context.user` on **every** request. `requireUser(event)` (in `server/utils/auth.ts`) throws 401 if absent; every question/attempt route calls it and scopes queries by `user.id`.
- **Cookie gotcha (I hit this):** h3 defaults session cookies to `secure: true`, which browsers reject over `http://localhost`. `nuxt.config.ts` sets `session.cookie.secure = process.env.NODE_ENV === 'production'`.
- Client 401s (expired session mid-use) are caught by `useApi()` → clears the practice store → redirects to `/login?expired=1`.

---

## 8. This project's conventions (read before you edit)

1. **One global stylesheet.** `app/assets/tokens.css` holds the *entire* prototype CSS (tokens, base, every component/layout class). Components use plain classes (`class="btn"`) — **no scoped styles, no CSS modules**. The prototype's CSS is inherently global (classes shared across screens), so it's ported verbatim as one file. Don't add scoped styles; extend `tokens.css`.
2. **`shared/` is the single source for literals.** `shared/enums.ts` owns `DIFFICULTY`/`IMPORTANCE`/`CATEGORY` + labels/colors + zod schemas. Client and server both import via `#shared/enums`. Add a category → add it here, nothing else.
3. **Shared types** live in `shared/types/qadb.ts` (`QuestionWithStats`, `Filters`, …) — import with `#shared/types/qadb`.
4. **Tri-state filters** (`nbd`, `mastered`) are `'all' | 'yes' | 'no'` in the client UI but the **API takes `true`/`false`** — `content.vue`'s `buildQuery()` translates.
5. **The API contract:** question responses are `{ ...questionFields(snake_case), stats: { attemptCount, correctCount, trackRecordPct, lastAnsweredAt, lastCorrect } }`. `trackRecordPct` is `null` (client renders "—") when unanswered; sorting treats null as lowest.
6. **Selection is an ordered array** matching table order, re-anchored (dropping invisible ids + toast) whenever filters/sort change.
7. **Practice sessions** are a queue (`string[]` of ids) + index in the Pinia store, mirrored to `sessionStorage`. No repeats: advancing an index is the only progression. Store is cleared on logout/login/401 so users can't leak each other's sessions.
8. **`answer_summary` is Markdown.** Answers render via `app/utils/markdown.ts` (`renderMarkdown`, `markdown-it` + `isomorphic-dompurify` sanitization, safe for `v-html` on SSR and client). Markdown typography comes from the global `.md` class in `tokens.css` (no scoped styles).

---

## 9. Suggested reading order

1. `shared/enums.ts` + `shared/types/qadb.ts` — the vocabulary.
2. `db/schema.ts` — the data model (15 min).
3. `server/utils/questions.ts` — the stats subquery, the heart of the backend.
4. One CRUD route: `server/api/questions/[id].patch.ts`, then `index.get.ts` (filter+sort engine).
5. `app/composables/useApi.ts` + `app/stores/practice.ts` — client plumbing.
6. `app/pages/content.vue` — the biggest client file; how components compose.
7. One UI component pair: `app/components/QuestionTable.vue` + `app/components/ui/Checkbox.vue` — v-model, emits, slots in action.
8. `app/pages/practice/index.vue` → `app/components/PracticeSession.vue` — the session flow. `app/utils/markdown.ts` is a small companion to `app/utils/format.ts` (Markdown → sanitized HTML).

## 10. Commands

```bash
pnpm dev          # dev server (http://localhost:3000)
pnpm typecheck    # vue-tsc type check (needs .nuxt types — postinstall runs nuxt prepare)
pnpm build        # production build (Nitro; auto-detects Vercel preset)
pnpm drizzle-kit push   # sync schema to the DB (Turso or local file, per .env)
```

Env: copy `.env.example` → `.env`. `NUXT_TURSO_URL` (Turso `libsql://` URL), `TURSO_AUTH_TOKEN`, `NUXT_SESSION_PASSWORD` (≥32 chars). The first two are server-only; runtimeConfig keeps them off the client.
