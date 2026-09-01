import { Pool, QueryResultRow } from 'pg';

export const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
              host: process.env.PGHOST,
              port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
              user: process.env.PGUSER,
              password: process.env.PGPASSWORD,
              database: process.env.PGDATABASE,
          }
);

/** Run a query and return every row. */
export async function all<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await pool.query<T>(sql, params);
    return result.rows;
}

/** Run a query and return the first row, or undefined when there is none. */
export async function get<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await pool.query<T>(sql, params);
    return result.rows[0];
}

/** Run a statement and return the number of affected rows. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
    const result = await pool.query(sql, params);
    return result.rowCount ?? 0;
}

/** Postgres unique-violation error code. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}
