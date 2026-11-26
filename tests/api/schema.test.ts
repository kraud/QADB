import { createClient, type Client } from '@libsql/client/http'
import { is, SQL } from 'drizzle-orm'
import { getTableConfig, SQLiteSyncDialect, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../db/schema'
import { migrate } from '../../scripts/db/migrate.mjs'
import { startDbServer } from '../support/db-server'

let server: Awaited<ReturnType<typeof startDbServer>>
let client: Client

beforeAll(async () => {
  server = await startDbServer()
  client = createClient({ url: server.url })
  await migrate(client)
})

afterAll(async () => {
  client.close()
  await server.stop()
})

const tables = Object.values(schema).filter((value) => is(value, SQLiteTable)) as SQLiteTable[]
const dialect = new SQLiteSyncDialect()

async function rows(sql: string): Promise<Record<string, unknown>[]> {
  const result = await client.execute(sql)
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])))
}

/** A default as `pragma table_info` prints it: SQL text without its outer parentheses. */
function defaultText(value: unknown): string | null {
  if (value === undefined) return null
  if (is(value, SQL)) return dialect.sqlToQuery(value).sql.replace(/^\((.*)\)$/s, '$1')
  return String(Number(value))
}

/** Order-independent. */
const sorted = (items: string[]) => [...items].sort()

describe('db/schema.ts', () => {
  it('declares every table the migrated database has', async () => {
    const found = await rows(
      `select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' and name <> '_migrations'`,
    )

    expect(sorted(tables.map((table) => getTableConfig(table).name))).toEqual(sorted(found.map((row) => String(row.name))))
  })

  it('drizzle schema matches the migrated database', async () => {
    for (const table of tables) {
      const config = getTableConfig(table)
      const compositeKey = config.primaryKeys[0]?.columns.map((column) => column.name) ?? []
      const declared = config.columns.map((column) => ({
        name: column.name,
        type: column.getSQLType(),
        notnull: column.notNull || compositeKey.includes(column.name) ? 1 : 0,
        default: defaultText(column.default),
        pk: column.primary ? 1 : compositeKey.indexOf(column.name) + 1,
      }))
      const actual = (await rows(`pragma table_info('${config.name}')`)).map((row) => ({
        name: row.name,
        type: String(row.type).toLowerCase(),
        notnull: row.notnull,
        default: row.dflt_value,
        pk: row.pk,
      }))

      expect(declared, config.name).toEqual(actual)
    }
  })

  it('declares the same foreign keys', async () => {
    for (const table of tables) {
      const config = getTableConfig(table)
      const declared = config.foreignKeys.map((key) => {
        const { columns, foreignTable, foreignColumns } = key.reference()
        return `${columns[0]!.name} -> ${getTableConfig(foreignTable).name}.${foreignColumns[0]!.name} ${key.onDelete}`
      })
      const actual = (await rows(`pragma foreign_key_list('${config.name}')`)).map(
        (row) => `${row.from} -> ${row.table}.${row.to} ${String(row.on_delete).toLowerCase()}`,
      )

      expect(sorted(declared), config.name).toEqual(sorted(actual))
    }
  })

  it('declares the same indexes', async () => {
    for (const table of tables) {
      const config = getTableConfig(table)
      const declared = [
        ...config.indexes.map((index) => {
          const columns = index.config.columns.map((column) => (column as { name: string }).name)
          return `${index.config.name} (${columns.join(', ')})${index.config.unique ? ' unique' : ''}`
        }),
        // `.unique()` on a column.
        ...config.columns
          .filter((column) => column.isUnique)
          .map((column) => `${column.uniqueName} (${column.name}) unique`),
      ]
      const actual: string[] = []
      // Origin `c`: created by `create index`; primary keys have their own, unnamed ones.
      for (const index of await rows(`select * from pragma_index_list('${config.name}') where origin <> 'pk'`)) {
        const columns = await rows(`select name from pragma_index_info('${index.name}') order by seqno`)
        actual.push(`${index.name} (${columns.map((row) => row.name).join(', ')})${index.unique ? ' unique' : ''}`)
      }

      expect(sorted(declared), config.name).toEqual(sorted(actual))
    }
  })
})
