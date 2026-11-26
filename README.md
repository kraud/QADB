# QADB

A personal question-and-answer bank. Each user creates **scenarios** (question sets), gives each its
own **attributes** and **options**, and practices the questions while the app keeps a track record.

- Vocabulary: [`docs/glossary.md`](docs/glossary.md)
- Technical design: [`.context/qadb-technical-design.md`](.context/qadb-technical-design.md)

## Requirements

| Tool | Notes |
|---|---|
| Node.js 24 | The database scripts import TypeScript files directly and use `node:sqlite`. |
| pnpm 11 | Installed here as `/opt/homebrew/bin/pnpm`. pnpm 9 fails on `pnpm-workspace.yaml`; check with `pnpm -v` and use the full path if an older one comes first. |
| `sqld` | The libSQL server, for the local database and the tests: `brew tap libsql/sqld && brew install sqld`. |
| `sqlite3` | Only for restoring a backup. |

## Setup

```sh
pnpm install
cp -n .env.example .env    # keeps an existing .env; then fill in NUXT_SESSION_PASSWORD
```

`.env.example` points at the local database. Before running the app, make sure `NUXT_TURSO_URL` in
your `.env` still does: the app uses whatever it names.

## Local database

The database client speaks HTTP only, so a `file:` URL does not work. Run the server in its own
terminal and leave it running:

```sh
pnpm db:local    # sqld on http://127.0.0.1:8080, data in .localdb/
```

It listens on this machine only. Do not use `turso dev` instead.

Then, in another terminal, create or update the tables and start the app:

```sh
NUXT_TURSO_URL=http://127.0.0.1:8080 pnpm db:migrate
pnpm dev
```

A new database has no accounts: register one in the app.

### Migrations

`pnpm db:migrate` applies the versioned migrations in `scripts/db/migrations/` and records them, so
running it again does nothing. It reads only the `NUXT_TURSO_URL` environment variable, never a
`.env` file. Each migration runs in one transaction; if a check fails, nothing changes.

The migration script is the only way to change the schema of any database. Pushing a schema straight
from `db/schema.ts` can drop data, so the project has no tool that does it; do not add one.

### Reset from a backup

With `pnpm db:local` **stopped**:

```sh
pnpm db:reset-local                       # newest .db file in ~/Documents/Backups/QADB/
pnpm db:reset-local path/to/backup.db     # a specific one
```

This replaces everything in `.localdb/` with a copy of the backup (the backup is only read) and adds
the local test account from `.env.testuser` if the backup lacks it. A file inside `.localdb/` is
refused as a backup, since it would be deleted with the rest. Start `pnpm db:local` again and
migrate. A backup holds password hashes: keep it, and `.localdb/`, private.

### Demo data

With the local database running and migrated:

```sh
NUXT_TURSO_URL=http://127.0.0.1:8080 pnpm db:seed-demo --user <name>
```

It gives an existing account two scenarios with invented questions and track records:
**Front-end demo** and **Finance demo**.

- Running it again replaces them. "Them" means that user's scenarios with exactly those two names,
  including any questions and attempts you added to them. Other scenarios and other users are not
  touched.
- It stops, changing nothing, if the user has a scenario whose name differs from a demo name only in
  letter case.
- It only accepts a database on this machine. There is no flag to override that.

## Tests

```sh
pnpm typecheck
pnpm test             # unit and API tests (Vitest)
pnpm test:coverage    # the same, failing below 90 % line coverage
pnpm test:e2e         # end-to-end tests (Playwright)
```

- Coverage is measured over server code, shared code, utilities and stores. Pages and components are
  covered by the end-to-end tests.
- Selects, dialogs, switches and similar are [Reka UI](https://reka-ui.com) controls: tests operate
  them through the helpers in `tests/flows/` (for selects, `chooseOption` in `controls.ts`).
- API tests start their own throwaway `sqld` on a free port. No test calls the real AI service.
- The end-to-end run builds the app and starts its own database, AI stub and server on ports 8180,
  8190 and 3100, so those must be free. It does not touch `.localdb/` or your `.env` database.
- Once per machine: `pnpm exec playwright install chromium`.
- The local test account is read from `.env.testuser` (gitignored), which is created on first use.

## Recording videos with the flows

`tests/flows/` holds the page-driving steps (sign in, create a scenario, add and filter questions,
practice) without any assertions, so a recording script can import the same steps the tests use. They
find controls by role and label, and navigate with relative paths, so set a `baseURL`. `addQuestion`
expects the attributes of the front-end scenario.

The flows are TypeScript, so run a recording through the Playwright runner, with its own config (the
one in the repository root belongs to the tests). For example, `recording/playwright.config.ts`:

```ts
export default { testDir: '.', outputDir: './videos' }
```

and `recording/finance.spec.ts`:

```ts
import { test } from '@playwright/test'
import { signIn } from '../tests/flows/auth'
import { showAnswer, startRandomPractice } from '../tests/flows/practice'
import { openContent } from '../tests/flows/questions'
import { loadTestUser } from '../tests/support/test-user'

const size = { width: 1280, height: 720 }
test.use({ baseURL: 'http://localhost:3000', viewport: size, video: { mode: 'on', size } })

test('random practice in the finance demo', async ({ page }) => {
  await signIn(page, loadTestUser())
  await page.waitForURL(/\/scenarios/)
  await page.getByRole('combobox', { name: 'Scenario' }).selectOption({ label: 'Finance demo' })
  await page.waitForURL(/\/content$/)
  await openContent(page, new URL(page.url()).pathname.split('/')[2]!)
  await startRandomPractice(page)
  await showAnswer(page)
})
```

With the app running against the local database and the demo data seeded for the account in
`.env.testuser`:

```sh
pnpm exec playwright test --config recording/playwright.config.ts
```

Record only the demo data, on the local database.

## Remote database

The deployed app uses a remote database. Migrating it is a separate rollout that needs the owner's
**explicit approval** each time; nothing in development or testing should connect to it.

`pnpm db:migrate --allow-remote` is the command that migrates it. Run it only with that approval, and
with both of these set in the environment of the command (the script loads no `.env` file):

- `NUXT_TURSO_URL`: the address of the remote database;
- `TURSO_AUTH_TOKEN` (or `NUXT_TURSO_TOKEN`): its auth token. Do not put it in a file in the
  repository or leave it in the shell history.

Rollout, once approved:

1. Take a fresh backup and rehearse on it locally (reset, migrate).
2. Rehearse on a copy of the remote database too, and check `pragma foreign_keys` on that copy: the
   migration and the app's cascading deletes were verified on local `sqld`.
3. Build the preview deployment of the matching code first, so that nothing is left to build later.
4. Stop writes: nobody uses the app from here until the new version is live.
5. Back up again if anything was written since step 1, then migrate with
   `pnpm db:migrate --allow-remote`.
6. Promote the preview deployment.
7. Verify the counts (questions and attempts per user) against the backup, and try the app.

To roll back, restore the backup and redeploy the previous version. A branch that needs a migration
is not merged to `main` before this.
