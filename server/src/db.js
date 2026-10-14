import 'dotenv/config';
import pg from 'pg';

// numeric llega como texto desde pg; para dinero y cantidades basta Number
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v); // 'YYYY-MM-DD' sin zona horaria
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});
// El esquema "pos" y la hora de Colombia quedan por defecto en la base
// (ALTER DATABASE en scripts/init-db.js), así funciona también con poolers.

pool.on('error', (err) => console.error('Error inesperado de PostgreSQL:', err.message));

// Ejecuta fn(client) dentro de una transacción
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
