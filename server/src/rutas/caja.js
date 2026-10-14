// Turnos de caja: apertura, retiros, liquidación de domiciliarios y cierre
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { permite } from '../auth.js';
import { avisar } from '../eventos.js';
import { ah, ErrorApp } from '../util.js';

const r = Router();
r.use('/caja', permite('cajero'));

const turnoAbierto = async (c = pool) =>
  (await c.query(`SELECT t.*, u.nombre AS cajero FROM turno_caja t JOIN usuario u ON u.id = t.cajero_id
                   WHERE t.estado = 'abierto'`)).rows[0] || null;

// Turno abierto con su cuadre en vivo
r.get('/caja/turno', ah(async (_req, res) => {
  const turno = await turnoAbierto();
  if (!turno) return res.json({ turno: null });
  const [{ rows: [{ cuadre }] }, { rows: retiros }, { rows: gastos }] = await Promise.all([
    pool.query(`SELECT cuadre_turno($1) AS cuadre`, [turno.id]),
    pool.query(`SELECT * FROM retiro_caja WHERE turno_id = $1 ORDER BY id`, [turno.id]),
    pool.query(`SELECT id, descripcion, categoria, valor, anulado FROM gasto
                 WHERE turno_id = $1 AND pagado_de_caja ORDER BY id`, [turno.id])
  ]);
  res.json({ turno, cuadre, retiros, gastos });
}));

r.post('/caja/abrir', ah(async (req, res) => {
  const base = Math.round(Number(req.body.base_inicial));
  if (!(base >= 0)) throw new ErrorApp('Base inicial inválida');
  if (await turnoAbierto()) throw new ErrorApp('Ya hay un turno de caja abierto');
  await pool.query(`INSERT INTO turno_caja (cajero_id, base_inicial) VALUES ($1, $2)`, [req.usuario.id, base]);
  avisar('caja');
  res.json({ ok: true });
}));

r.post('/caja/retiro', ah(async (req, res) => {
  const { valor, motivo } = req.body;
  const turno = await turnoAbierto();
  if (!turno) throw new ErrorApp('No hay turno abierto');
  if (!motivo?.trim()) throw new ErrorApp('Indique el motivo del retiro');
  await pool.query(`INSERT INTO retiro_caja (turno_id, valor, motivo, usuario_id) VALUES ($1, $2, $3, $4)`,
    [turno.id, Math.round(Number(valor)), motivo.trim(), req.usuario.id]);
  res.json({ ok: true });
}));

// Efectivo que tienen los domiciliarios y no han entregado
r.get('/caja/por-liquidar', ah(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT pg.id, pg.pedido_id, pg.valor, pg.creado_en, u.nombre AS domiciliario, pg.domiciliario_id,
           cl.nombre AS cliente, p.direccion_entrega, p.entregado_en
      FROM pago pg
      JOIN usuario u ON u.id = pg.domiciliario_id
      JOIN pedido p ON p.id = pg.pedido_id
      LEFT JOIN cliente cl ON cl.id = p.cliente_id
     WHERE pg.turno_id IS NULL
     ORDER BY u.nombre, pg.id`);
  res.json(rows);
}));

r.post('/caja/liquidar', ah(async (req, res) => {
  const ids = (req.body.pago_ids || []).map(Number);
  if (!ids.length) throw new ErrorApp('Seleccione los pagos a liquidar');
  await tx(async (c) => {
    const turno = await turnoAbierto(c);
    if (!turno) throw new ErrorApp('No hay turno abierto');
    await c.query(`UPDATE pago SET turno_id = $1 WHERE id = ANY($2) AND turno_id IS NULL`, [turno.id, ids]);
  });
  res.json({ ok: true });
}));

r.post('/caja/cerrar', ah(async (req, res) => {
  const contado = Math.round(Number(req.body.efectivo_contado));
  if (!(contado >= 0)) throw new ErrorApp('Escriba el efectivo contado');
  const resultado = await tx(async (c) => {
    const turno = await turnoAbierto(c);
    if (!turno) throw new ErrorApp('No hay turno abierto');
    const { rows: [{ n }] } = await c.query(
      `SELECT count(*)::int AS n FROM pedido WHERE estado = 'abierto' AND tipo <> 'DOMICILIO'`);
    if (n && !req.body.forzar) {
      throw new ErrorApp(`Hay ${n} pedido(s) abiertos sin cobrar. Cóbrelos o anúlelos antes de cerrar, o confirme el cierre de todos modos.`, 409);
    }
    const { rows: [{ cuadre }] } = await c.query(`SELECT cuadre_turno($1) AS cuadre`, [turno.id]);
    const esperado = Number(cuadre.efectivo_esperado);
    await c.query(
      `UPDATE turno_caja SET estado = 'cerrado', efectivo_esperado = $2, efectivo_contado = $3,
              diferencia = $3::numeric - $2::numeric, resumen = $4, nota = $5 WHERE id = $1`,
      [turno.id, esperado, contado, cuadre, req.body.nota?.trim() || null]);
    return { turno_id: turno.id, esperado, contado, diferencia: contado - esperado, cuadre };
  });
  avisar('caja');
  res.json(resultado);
}));

r.get('/caja/turnos', ah(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*, u.nombre AS cajero FROM turno_caja t JOIN usuario u ON u.id = t.cajero_id
     ORDER BY t.id DESC LIMIT 60`);
  res.json(rows);
}));

export default r;
