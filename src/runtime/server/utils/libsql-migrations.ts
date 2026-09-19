export interface LibsqlMigration {
   sql: string[]
   folderMillis: number
   hash: string
}

export interface LibsqlStatement {
   sql: string
   args: (string | number)[]
}

export interface LibsqlMigrationClient {
   execute: (statement: string) => Promise<{ rows: ArrayLike<unknown>[] }>
   batch: (statements: LibsqlStatement[], mode: 'write') => Promise<unknown>
}

const MIGRATIONS_TABLE = '__drizzle_migrations'

async function lastAppliedMillis(client: LibsqlMigrationClient): Promise<number | null> {
   const { rows } = await client.execute(
      `SELECT id, hash, created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`
   )
   const createdAt = rows[0]?.[2]
   return createdAt == null ? null : Number(createdAt)
}

export async function applyLibsqlMigrations(
   client: LibsqlMigrationClient,
   migrations: LibsqlMigration[]
): Promise<number> {
   if (!migrations.length) return 0

   await client.execute(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
   )
   const lastApplied = await lastAppliedMillis(client)
   const pending = migrations.filter(
      (migration) => lastApplied == null || lastApplied < migration.folderMillis
   )
   if (!pending.length) return 0

   const statements: LibsqlStatement[] = pending.flatMap((migration) => [
      ...migration.sql.filter((statement) => statement.trim()).map((sql) => ({ sql, args: [] })),
      {
         sql: `INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`,
         args: [migration.hash, migration.folderMillis],
      },
   ])

   try {
      await client.batch(statements, 'write')
   } catch (error) {
      const latest = Math.max(...migrations.map((migration) => migration.folderMillis))
      const appliedNow = await lastAppliedMillis(client).catch(() => null)
      if (appliedNow != null && appliedNow >= latest) return 0
      throw error
   }
   return pending.length
}
