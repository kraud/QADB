// Fills one account of a local database with two demo scenarios, for trying the app and for
// recording it. The content is invented and holds no personal data.
//
//   NUXT_TURSO_URL=http://127.0.0.1:8080 pnpm db:seed-demo --user <name>
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client/http'
import { createId } from '@paralleldrive/cuid2'
import { isLocalUrl } from './guard.mjs'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const option = (label, color, isDefault = false) => ({ label, color, isDefault })

/**
 * The question text is shown as it is; only the answer is Markdown. `values` holds the option labels of each attribute, in attribute order. `results` is the track
 * record, oldest first: `+` correct, `-` incorrect, at most one a day.
 */
const question = (text, answer, values, results = '', { mastered = false, link = null } = {}) => ({
  text,
  answer,
  values,
  results,
  mastered,
  link,
})

const MDN = 'https://developer.mozilla.org/en-US/docs/Web'

const SCENARIOS = [
  {
    name: 'Front-end demo',
    attributes: [
      {
        name: 'Difficulty',
        mode: 'single',
        ordered: true,
        options: [option('Easy', 'blue-1'), option('Medium', 'blue-2', true), option('Hard', 'blue-3')],
      },
      {
        name: 'Importance',
        mode: 'single',
        ordered: true,
        options: [option('Low', 'gray-1'), option('Mid', 'gray-2', true), option('High', 'gray-3')],
      },
      {
        name: 'Category',
        mode: 'multiple',
        ordered: false,
        options: [
          option('HTML', 'orange'),
          option('CSS', 'cyan'),
          option('JS', 'yellow', true),
          option('API', 'violet'),
          option('React', 'green'),
        ],
      },
    ],
    questions: [
      question(
        'What is a closure?',
        'A function together with the variables of the scope it was **created in**. It can still read and change them after that scope has returned.\n\n```js\nfunction counter() {\n  let n = 0\n  return () => ++n\n}\n```',
        [['Medium'], ['High'], ['JS']],
        '-+++',
        { mastered: true, link: `${MDN}/JavaScript/Guide/Closures` },
      ),
      question(
        'How does the event loop order promises and timers?',
        'After the current task finishes, every queued **microtask** (promise callbacks) runs. Only then does the loop take the next task, such as a timer.',
        [['Hard'], ['High'], ['JS']],
        '+--',
      ),
      question(
        'What is the difference between == and ===?',
        '`===` compares type and value. `==` converts the operands to a common type first.',
        [['Easy'], ['Mid'], ['JS']],
        '++',
        { mastered: true },
      ),
      question(
        'Why use semantic HTML elements?',
        'Elements such as `nav`, `main` and `button` describe their purpose, which helps:\n\n- assistive technology\n- search engines\n- the next person reading the markup',
        [['Easy'], ['High'], ['HTML']],
        '+-+',
      ),
      question(
        'What does the alt attribute of an image do?',
        'It gives a text alternative, read by screen readers and shown when the image cannot load. Decorative images take an empty `alt`.',
        [['Easy'], ['Mid'], ['HTML']],
      ),
      question(
        'When would you choose grid over flexbox?',
        'Grid lays out **rows and columns** together. Flexbox distributes items along **one axis**.',
        [['Medium'], ['Mid'], ['CSS']],
        '+',
        { link: `${MDN}/CSS/CSS_grid_layout` },
      ),
      question(
        'How is CSS specificity calculated?',
        'Selectors are compared by the number of IDs, then of classes, attributes and pseudo-classes, then of element names. Ties go to the rule declared later.',
        [['Medium'], ['High'], ['CSS']],
        '--+-',
      ),
      question(
        'What does box-sizing: border-box change?',
        'The declared width and height then include padding and border.',
        [['Easy'], ['Low'], ['CSS']],
        '+++++',
        { mastered: true },
      ),
      question(
        'What is the difference between PUT and PATCH?',
        '`PUT` replaces the whole resource and is idempotent. `PATCH` applies a partial change.',
        [['Medium'], ['Mid'], ['API']],
        '-',
      ),
      question(
        'How does a browser decide whether a cross-origin request is allowed?',
        'It checks the `Access-Control-Allow-*` response headers. For requests that are not simple, it first sends a **preflight** `OPTIONS` request.',
        [['Hard'], ['Mid'], ['API', 'JS']],
      ),
      question(
        'Why does React need a key on list items?',
        'Keys tell React which item is which between renders, so state stays with the right element.',
        [['Medium'], ['High'], ['React', 'JS']],
        '++-+',
      ),
      question(
        'When does an effect with an empty dependency list run?',
        'After the component first mounts. Its cleanup runs when the component unmounts.',
        [['Medium'], ['Low'], ['React']],
      ),
    ],
  },
  {
    name: 'Finance demo',
    attributes: [
      {
        name: 'Type',
        mode: 'single',
        ordered: false,
        options: [option('Domestic', 'green', true), option('Commerce', 'orange'), option('International', 'violet')],
      },
    ],
    questions: [
      question(
        'What is an emergency fund?',
        'Money kept easy to reach for unplanned costs. A common target is three to six months of essential expenses.',
        [['Domestic']],
        '+++',
        { mastered: true },
      ),
      question(
        'How does compound interest differ from simple interest?',
        'Simple interest is earned on the principal only. Compound interest is also earned on **interest already added**.',
        [['Domestic']],
        '-++',
      ),
      question(
        'What does the 50/30/20 budget rule suggest?',
        'Spend about:\n\n- 50% of net income on needs\n- 30% on wants\n- 20% on saving and paying off debt',
        [['Domestic']],
      ),
      question(
        'What is gross margin?',
        '`(revenue - cost of goods sold) / revenue`: the share of each sale left to cover other costs and profit.',
        [['Commerce']],
        '+-',
      ),
      question(
        'How does cash flow differ from profit?',
        'Profit counts income and costs when they are earned or incurred. Cash flow counts money when it **actually moves**.',
        [['Commerce']],
        '--+-',
      ),
      question(
        'What does a break-even point tell you?',
        'The sales volume at which total revenue equals total costs: fixed costs divided by the margin per unit.',
        [['Commerce']],
        '++++',
      ),
      question(
        'What is an exchange rate?',
        'The price of one currency expressed in another.',
        [['International']],
        '+',
        { mastered: true },
      ),
      question(
        'What does a tariff do?',
        'It is a tax on imported goods. It raises their price compared with goods produced at home.',
        [['International']],
      ),
      question(
        'How can a company reduce currency risk?',
        'For example by agreeing a **forward contract** that fixes the rate, or by matching income and costs in the same currency.',
        [['International']],
        '-',
      ),
    ],
  },
]

export const DEMO_NAMES = SCENARIOS.map((scenario) => scenario.name)

/** The inserts for one demo scenario of the user. Its dates lie in the weeks before `now`. */
function scenarioStatements(scenario, userId, now) {
  const statements = []
  const insert = (table, row) => {
    const columns = Object.keys(row)
    statements.push({
      sql: `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
      args: Object.values(row),
    })
  }

  const scenarioId = createId()
  insert('scenarios', { id: scenarioId, user_id: userId, name: scenario.name, created_at: now, updated_at: now })

  const optionIds = scenario.attributes.map((attribute, position) => {
    const attributeId = createId()
    insert('attributes', {
      id: attributeId,
      scenario_id: scenarioId,
      name: attribute.name,
      selection_mode: attribute.mode,
      ordered: Number(attribute.ordered),
      required: 1,
      position,
    })
    return new Map(
      attribute.options.map(({ label, color, isDefault }, optionPosition) => {
        const id = createId()
        insert('options', {
          id,
          attribute_id: attributeId,
          label,
          color,
          position: optionPosition,
          is_default: Number(isDefault),
        })
        return [label, id]
      }),
    )
  })

  scenario.questions.forEach((entry, index) => {
    const id = createId()
    const createdAt = now - 30 * DAY + index * MINUTE
    insert('questions', {
      id,
      scenario_id: scenarioId,
      question: entry.text,
      answer: entry.answer,
      link: entry.link,
      mastered: Number(entry.mastered),
      created_at: createdAt,
      updated_at: createdAt,
    })
    entry.values.forEach((labels, position) => {
      for (const label of labels) insert('question_options', { question_id: id, option_id: optionIds[position].get(label) })
    })
    // The latest result is about a day old, the one before it two days, and so on.
    for (const [number, result] of [...entry.results].entries()) {
      insert('attempts', {
        id: createId(),
        question_id: id,
        user_id: userId,
        correct: result === '+' ? 1 : 0,
        answered_at: now - (entry.results.length - number) * DAY - index * MINUTE,
      })
    }
  })
  return statements
}

/**
 * Creates the demo scenarios for the user, replacing the user's scenarios with exactly those names
 * (and so their questions and attempts). Everything else is left alone. It happens in one
 * transaction.
 *
 * @param {import('@libsql/client/http').Client} client
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function seedDemo(client, userId) {
  const user = await client.execute({ sql: 'select 1 from users where id = ?', args: [userId] })
  if (!user.rows.length) throw new Error(`There is no user with the id ${userId}`)

  // The app treats names differing only in case as the same, so a second one must not appear.
  const own = await client.execute({ sql: 'select name from scenarios where user_id = ?', args: [userId] })
  const keys = new Set(DEMO_NAMES.map((name) => name.toLocaleLowerCase()))
  const clash = own.rows
    .map((row) => String(row.name))
    .find((name) => !DEMO_NAMES.includes(name) && keys.has(name.trim().toLocaleLowerCase()))
  if (clash !== undefined) {
    throw new Error(`Nothing was changed: rename or delete the scenario "${clash}", which clashes with a demo name`)
  }

  const now = Date.now()
  await client.batch(
    [
      // The database cascades to everything the scenarios own.
      {
        sql: `delete from scenarios where user_id = ? and name in (${DEMO_NAMES.map(() => '?').join(', ')})`,
        args: [userId, ...DEMO_NAMES],
      },
      ...SCENARIOS.flatMap((scenario) => scenarioStatements(scenario, userId, now)),
    ],
    'write',
  )
}

const USAGE = 'Usage: pnpm db:seed-demo --user <name>'

async function main(argv) {
  const args = argv.filter((arg) => arg !== '--')
  const [flag, username, ...rest] = args

  // Only the environment decides the target; `.env` files are deliberately not loaded.
  const url = process.env.NUXT_TURSO_URL
  if (!url) throw new Error('Set NUXT_TURSO_URL to the local database, e.g. http://127.0.0.1:8080')
  // There is deliberately no flag to override this: demo data has no place in a remote database.
  if (!isLocalUrl(url)) throw new Error('NUXT_TURSO_URL is not a local database. Demo data is only seeded locally.')
  if (flag !== '--user' || !username || rest.length) throw new Error(USAGE)

  const client = createClient({ url })
  try {
    const found = await client.execute({ sql: 'select id from users where username = ?', args: [username] })
    if (!found.rows.length) throw new Error(`There is no user named "${username}". Register it in the app first.`)
    await seedDemo(client, String(found.rows[0].id))
    for (const { name, questions } of SCENARIOS) console.log(`${name}: ${questions.length} questions`)
  } finally {
    client.close()
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
}
