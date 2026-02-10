import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) {
    return _pool;
  }

  // Read env vars using dynamic access to prevent Next.js build-time substitution
  // Next.js cannot statically analyze when the key is constructed dynamically
  const envKeys = ['QUORUM_DB_HOST', 'QUORUM_DB_PORT', 'QUORUM_DB_NAME', 'QUORUM_DB_USER', 'QUORUM_DB_PASSWORD'];
  const values: Record<string, string> = {};

  for (const key of envKeys) {
    // Use dynamic access with type assertion
    const value = process.env[key as keyof NodeJS.ProcessEnv];
    // Debug logging
    if (typeof window === 'undefined') {
      console.log(`[db-pool] ${key} =`, value === undefined || value === null ? '<undefined/null>' : `'${value}'`);
    }
    values[key] = value === undefined || value === null ? '' : String(value);
  }

  // Apply defaults
  const host = values.QUORUM_DB_HOST || 'quorum-postgres';
  const port = parseInt(values.QUORUM_DB_PORT || '5432', 10);
  const database = values.QUORUM_DB_NAME || 'quorum';
  const user = values.QUORUM_DB_USER || 'quorum';
  const password = values.QUORUM_DB_PASSWORD ?? '';

  console.log('[db-pool] Creating pool with:', { host, port, database, user, password: `'${password}'` });

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
