import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

// numeric llega como texto desde pg; para dinero y cantidades basta Number
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v); // 'YYYY-MM-DD' sin zona horaria
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const raw = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});
// El esquema "pos" y la hora de Colombia quedan por defecto en la base
// (ALTER DATABASE en scripts/init-db.js), así funciona también con poolers.

// Asegurarse de que cada conexión use el esquema `pos` y la zona horaria esperada.
raw.on('connect', (client) => {
  client.query("SET search_path TO pos, public;")
    .catch(() => {});
  client.query("SET TIME ZONE 'America/Bogota';")
    .catch(() => {});
});

raw.on('error', (err) => console.error('Error inesperado de PostgreSQL:', err.message));

// ─── Multi-restaurante ──────────────────────────────────────────────────────
// Cada petición de un usuario corre en UNA transacción con el rol pos_app y
// app.restaurante_id = su restaurante. La seguridad por filas (RLS) de la base
// garantiza que solo vea y escriba datos de ese restaurante.
export const contexto = new AsyncLocalStorage();

// pool.query usa la transacción de la petición en curso; fuera de una petición
// (login, superadmin, salud) usa una conexión normal del dueño de las tablas.
export const pool = {
  query: (...args) => (contexto.getStore()?.client ?? raw).query(...args)
};

// Ejecuta fn(client) dentro de una transacción (o un savepoint si ya hay una)
export async function tx(fn) {
  const ctx = contexto.getStore();
  if (ctx) {
    await ctx.client.query('SAVEPOINT tx');
    try {
      const r = await fn(ctx.client);
      await ctx.client.query('RELEASE SAVEPOINT tx');
      return r;
    } catch (e) {
      await ctx.client.query('ROLLBACK TO SAVEPOINT tx').catch(() => {});
      throw e;
    }
  }
  const client = await raw.connect();
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

// Ejecuta fn() después de confirmar la transacción de la petición (p. ej. avisos
// en tiempo real, para que los demás no lean datos aún sin guardar).
export function alConfirmar(fn) {
  const ctx = contexto.getStore();
  if (ctx && !ctx.cerrado) ctx.alConfirmar.push(fn);
  else fn();
}

// Middleware: abre la transacción del restaurante del usuario. Se confirma justo
// antes de responder (res.json) y se deshace si la respuesta es un error.
export async function conRestaurante(req, res, next) {
  const rid = Number(req.usuario?.restaurante_id);
  if (!rid) return res.status(401).json({ error: 'Sesión inválida o expirada. Inicie sesión de nuevo.' });

  let client;
  try {
    client = await raw.connect();
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.restaurante_id', $1, true)`, [String(rid)]);
    await client.query('SET LOCAL ROLE pos_app');
  } catch (e) {
    if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    return next(e);
  }

  const ctx = { client, restaurante_id: rid, alConfirmar: [], cerrado: false };
  const cerrar = async (confirmar) => {
    if (ctx.cerrado) return;
    ctx.cerrado = true;
    try {
      await client.query(confirmar ? 'COMMIT' : 'ROLLBACK');
    } catch (e) {
      client.release(true); // conexión dañada: se descarta
      if (confirmar) throw e;
      return;
    }
    client.release();
    if (confirmar) ctx.alConfirmar.forEach((fn) => { try { fn(); } catch { /* aviso fallido */ } });
  };

  const json = res.json.bind(res);
  res.json = (cuerpo) => {
    cerrar(res.statusCode < 400).then(
      () => json(cuerpo),
      (e) => { res.status(500); json({ error: 'No se pudo guardar: ' + e.message }); });
    return res;
  };
  // Respuesta enviada por otro medio: no dejar la transacción abierta
  res.on('finish', () => { cerrar(false).catch(() => {}); });

  contexto.run(ctx, next);
}
