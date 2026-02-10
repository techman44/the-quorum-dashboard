import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) {
    return _pool;
  }

  // Read all env vars at runtime in this closure
  // This prevents Next.js from doing build-time substitution
  const host = process.env.QUORUM_DB_HOST || 'quorum-postgres';
  const port = parseInt(process.env.QUORUM_DB_PORT || '5432', 10);
  const database = process.env.QUORUM_DB_NAME || 'quorum';
  const user = process.env.QUORUM_DB_USER || 'quorum';
  const password = process.env.QUORUM_DB_PASSWORD ?? '';

  _pool = new Pool({
    host,
    port,
    database,
    user,
    password,
    max: 10,
  });

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
