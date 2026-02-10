import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) {
    return _pool;
  }

  // Directly use empty string for password (local Docker connection)
  // In production with external databases, this would use a real password
  _pool = new Pool({
    host: 'quorum-postgres',
    port: 5432,
    database: 'quorum',
    user: 'quorum',
    password: '', // Empty string for local Docker trust authentication
    max: 10,
  });

  console.log('[db-pool] Pool created successfully');

  return _pool;
}

// Export a Pool-like object that delegates to the real pool
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const p = getPool();
    // @ts-expect-error - dynamic property access
    return p[prop];
  },
});
