// Insumos, stock, mermas, conteo físico y gastos/compras
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { permite } from '../auth.js';
import { ah, ErrorApp, hoy } from '../util.js';

const r = Router();
const caja = permite('cajero');

// ─── Insumos y stock ────────────────────────────────────────────────────────
r.get('/insumos', caja, ah(async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM v_stock ORDER BY alerta DESC, nombre`);
  res.json(rows);
}));

r.post('/insumos', permite(), ah(async (req, res) => {
  const { nombre, unidad, stock_minimo = 0 } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO insumo (nombre, unidad, stock_minimo) VALUES ($1, $2, $3) RETURNING *`,
    [nombre?.trim(), unidad, stock_minimo]);
  res.json(rows[0]);
}));

r.patch('/insumos/:id', permite(), ah(async (req, res) => {
  const { nombre, stock_minimo, activo } = req.body;
  await pool.query(
    `UPDATE insumo SET nombre = coalesce($2, nombre), stock_minimo = coalesce($3, stock_minimo),
            activo = coalesce($4, activo) WHERE id = $1`,
    [req.params.id, nombre, stock_minimo, activo]);
  res.json({ ok: true });
}));

r.get('/movimientos', caja, ah(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*, i.nombre AS insumo, i.unidad, u.nombre AS usuario, pi.pedido_id, pe.numero AS pedido_numero
      FROM movimiento_inventario m
      JOIN insumo i ON i.id = m.insumo_id
      LEFT JOIN usuario u ON u.id = m.usuario_id
      LEFT JOIN pedido_item pi ON pi.id = m.pedido_item_id
      LEFT JOIN pedido pe ON pe.id = pi.pedido_id
     WHERE ($1::int IS NULL OR m.insumo_id = $1)
     ORDER BY m.id DESC LIMIT 300`, [req.query.insumo_id || null]);
  res.json(rows);
}));

// Merma: { insumo_id, cantidad (positiva), nota }
r.post('/inventario/merma', caja, ah(async (req, res) => {
  const { insumo_id, cantidad, nota } = req.body;
  if (!(Number(cantidad) > 0)) throw new ErrorApp('Cantidad inválida');
  if (!nota?.trim()) throw new ErrorApp('Describa la causa de la merma');
  await pool.query(
    `INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, nota, usuario_id)
     SELECT id, 'MERMA', -$2::numeric, costo_promedio, $3, $4 FROM insumo WHERE id = $1`,
    [insumo_id, cantidad, nota.trim(), req.usuario.id]);
  res.json({ ok: true });
}));

// Conteo físico: { conteos: [{ insumo_id, contado }] } -> ajusta la diferencia
r.post('/inventario/conteo', caja, ah(async (req, res) => {
  const conteos = req.body.conteos || [];
  const ajustes = await tx(async (c) => {
    let n = 0;
    for (const { insumo_id, contado } of conteos) {
      if (contado === '' || contado === null || !(Number(contado) >= 0)) continue;
      const { rows: [s] } = await c.query(`SELECT stock, costo_promedio FROM v_stock WHERE id = $1`, [insumo_id]);
      const dif = Number(contado) - Number(s.stock);
      if (Math.abs(dif) < 0.001) continue;
      await c.query(
        `INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, nota, usuario_id)
         VALUES ($1, 'AJUSTE_CONTEO', $2, $3, $4, $5)`,
        [insumo_id, dif.toFixed(3), s.costo_promedio, `Conteo físico: ${contado}`, req.usuario.id]);
      n++;
    }
    return n;
  });
  res.json({ ok: true, ajustes });
}));

// ─── Proveedores ────────────────────────────────────────────────────────────
r.get('/proveedores', caja, ah(async (_req, res) => {
  res.json((await pool.query(`SELECT * FROM proveedor WHERE activo ORDER BY nombre`)).rows);
}));

r.post('/proveedores', caja, ah(async (req, res) => {
  const { nombre, nit, telefono } = req.body;
  if (!nombre?.trim()) throw new ErrorApp('Escriba el nombre del proveedor');
  const { rows } = await pool.query(
    `INSERT INTO proveedor (nombre, nit, telefono) VALUES ($1, $2, $3) RETURNING *`,
    [nombre.trim(), nit || null, telefono || null]);
  res.json(rows[0]);
}));

// ─── Gastos ─────────────────────────────────────────────────────────────────
r.get('/gastos', caja, ah(async (req, res) => {
  const desde = req.query.desde || hoy();
  const hasta = req.query.hasta || desde;
  const { rows } = await pool.query(`
    SELECT g.*, pr.nombre AS proveedor, e.nombre AS empleado, u.nombre AS usuario,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('insumo', i.nombre, 'unidad', i.unidad,
                     'cantidad', gi.cantidad, 'costo_total', gi.costo_total)), '[]')
              FROM gasto_item gi JOIN insumo i ON i.id = gi.insumo_id WHERE gi.gasto_id = g.id) AS items
      FROM gasto g
      LEFT JOIN proveedor pr ON pr.id = g.proveedor_id
      LEFT JOIN empleado e ON e.id = g.empleado_id
      LEFT JOIN usuario u ON u.id = g.usuario_id
     WHERE g.fecha BETWEEN $1 AND $2
     ORDER BY g.fecha DESC, g.id DESC`, [desde, hasta]);
  res.json(rows);
}));

// { fecha, categoria, proveedor_id, empleado_id, descripcion, valor, medio_pago, pagado_de_caja,
//   items: [{ insumo_id, cantidad, costo_total }] }  (items solo en COMPRA_INSUMOS)
r.post('/gastos', caja, ah(async (req, res) => {
  const b = req.body;
  const items = b.categoria === 'COMPRA_INSUMOS' ? (b.items || []).filter((i) => Number(i.cantidad) > 0) : [];
  let valor = items.length ? items.reduce((s, i) => s + Math.round(Number(i.costo_total) || 0), 0) : Math.round(Number(b.valor));

  if (b.categoria === 'NOMINA') {
    if (!b.empleado_id) throw new ErrorApp('Seleccione el empleado de la nómina');
    const { rows: [emp] } = await pool.query(`SELECT salario FROM empleado WHERE id = $1 AND activo`, [b.empleado_id]);
    if (!emp) throw new ErrorApp('Empleado no encontrado o inactivo');
    valor = Math.round(Number(b.valor ?? emp.salario));
    if (!(valor > 0)) throw new ErrorApp('El valor del gasto debe ser mayor que cero');
  } else if (!(valor > 0)) {
    throw new ErrorApp('El valor del gasto debe ser mayor que cero');
  }

  const id = await tx(async (c) => {
    let turnoId = null;
    if (b.pagado_de_caja) {
      const { rows } = await c.query(`SELECT id FROM turno_caja WHERE estado = 'abierto'`);
      if (!rows[0]) throw new ErrorApp('No hay caja abierta para pagar este gasto en efectivo');
      turnoId = rows[0].id;
    }
    const { rows: [g] } = await c.query(
      `INSERT INTO gasto (fecha, categoria, proveedor_id, empleado_id, descripcion, valor, medio_pago, pagado_de_caja, turno_id, usuario_id)
       VALUES (coalesce($1::date, (now() AT TIME ZONE 'America/Bogota')::date), $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [b.fecha || null, b.categoria, b.proveedor_id || null, b.empleado_id || null, b.descripcion?.trim() || null, valor,
       b.pagado_de_caja ? 'EFECTIVO' : b.medio_pago, !!b.pagado_de_caja, turnoId, req.usuario.id]);
    for (const it of items) {
      await c.query(
        `INSERT INTO gasto_item (gasto_id, insumo_id, cantidad, costo_total) VALUES ($1, $2, $3, $4)`,
        [g.id, it.insumo_id, it.cantidad, Math.round(Number(it.costo_total) || 0)]);
    }
    return g.id;
  });
  res.json({ ok: true, id });
}));

r.post('/gastos/:id/anular', permite(), ah(async (req, res) => {
  await pool.query(`UPDATE gasto SET anulado = true, motivo_anulacion = $2 WHERE id = $1`,
    [req.params.id, req.body.motivo?.trim() || null]);
  res.json({ ok: true });
}));

export default r;
