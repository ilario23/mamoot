import {NextResponse} from 'next/server';
import {db} from '@/db';
import {sql} from 'drizzle-orm';

type TableCheck = {
  kind: 'table';
  table: string;
  required: boolean;
  exists: boolean;
};

type ColumnCheck = {
  kind: 'column';
  table: string;
  column: string;
  required: boolean;
  exists: boolean;
};

type SchemaCheck = TableCheck | ColumnCheck;

const REQUIRED_TABLES = ['user_settings', 'weekly_plans', 'activities', 'ai_planning_state'];

const REQUIRED_COLUMNS: Array<{table: string; column: string}> = [
  {table: 'user_settings', column: 'pace_zones'},
  {table: 'user_settings', column: 'strategy_selection_mode'},
  {table: 'user_settings', column: 'strategy_preset'},
  {table: 'user_settings', column: 'optimization_priority'},
];

const getExistingTables = async (): Promise<Set<string>> => {
  const rows = await db.execute<{tableName: string}>(sql`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
  `);
  return new Set(rows.rows.map((row) => row.tableName));
};

const getExistingColumns = async (): Promise<Set<string>> => {
  const rows = await db.execute<{tableName: string; columnName: string}>(sql`
    select table_name as "tableName", column_name as "columnName"
    from information_schema.columns
    where table_schema = 'public'
  `);
  return new Set(rows.rows.map((row) => `${row.tableName}.${row.columnName}`));
};

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({error: 'Not found'}, {status: 404});
  }

  try {
    const [tables, columns, dbInfoRows] = await Promise.all([
      getExistingTables(),
      getExistingColumns(),
      db.execute<{currentDb: string; currentSchema: string}>(sql`
        select
          current_database() as "currentDb",
          current_schema() as "currentSchema"
      `),
    ]);

    const checks: SchemaCheck[] = [
      ...REQUIRED_TABLES.map((table) => ({
        kind: 'table' as const,
        table,
        required: true,
        exists: tables.has(table),
      })),
      ...REQUIRED_COLUMNS.map(({table, column}) => ({
        kind: 'column' as const,
        table,
        column,
        required: true,
        exists: columns.has(`${table}.${column}`),
      })),
    ];

    const missing = checks.filter((check) => !check.exists && check.required);
    const ok = missing.length === 0;
    const dbInfo = dbInfoRows.rows[0] ?? null;

    return NextResponse.json(
      {
        ok,
        checkedAt: Date.now(),
        database: dbInfo?.currentDb ?? null,
        schema: dbInfo?.currentSchema ?? null,
        checks,
        missing,
        guidance: ok
          ? null
          : {
              action: 'Run database migrations to align schema.',
              command: 'bun run db:migrate',
            },
      },
      {status: ok ? 200 : 503},
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: Date.now(),
        error: 'schema_health_check_failed',
        detail: error instanceof Error ? error.message : String(error),
      },
      {status: 500},
    );
  }
}
