// Fiado / cuentas por cobrar: deuda de cada cliente y sus abonos
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { permite } from '../auth.js';
import { avisar } from '../eventos.js';
import { ah, ErrorApp } from '../util.js';

const r = Router();
r.use('/cartera', permite('cajero'));
const MEDIOS_ABONO = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TARJETA', 'TRANSFERENCIA'];
const cupo = (v) => (v === '' || v == null ? null : Math.round(Number(v)));

// Clientes que deben (o todos los que alguna vez fiaron con ?todos=1)
r.get('/cartera', ah(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM v_cartera ${req.query.todos ? '' : 'WHERE saldo > 0'}
     ORDER BY saldo DESC, nombre`);
  res.json(rows);
}));

// Buscar cliente por nombre o teléfono (para fiar al cobrar)
r.get('/cartera/clientes', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const tel = q.replace(/\D/g, '');
  const { rows } = await pool.query(`
    SELECT id, nombre, telefono, cupo_fiado, saldo_cliente(id) AS saldo FROM cliente
     WHERE nombre ILIKE $1 OR ($2 <> '' AND regexp_replace(telefono, '\\D', '', 'g') LIKE '%' || $2 || '%')
     ORDER BY nombre LIMIT 10`, [`%${q}%`, tel.length >= 4 ? tel : '']);
  res.json(rows);
}));

// Crea el cliente (o actualiza nombre y cupo si el teléfono ya existe)
r.post('/cartera/clientes', ah(async (req, res) => {
  const tel = String(req.body.telefono || '').trim();
  const nombre = String(req.body.nombre || '').trim();
  if (!tel || !nombre) throw new ErrorApp('Escriba el nombre y el teléfono del cliente');
  const { rows: [cl] } = await pool.query(`
    INSERT INTO cliente (telefono, nombre, cupo_fiado) VALUES ($1, $2, $3)
    ON CONFLICT (restaurante_id, telefono) DO UPDATE SET nombre = EXCLUDED.nombre,
      cupo_fiado = coalesce(EXCLUDED.cupo_fiado, cliente.cupo_fiado)
    RETURNING id, nombre, telefono, cupo_fiado, saldo_cliente(id) AS saldo`, [tel, nombre, cupo(req.body.cupo_fiado)]);
  res.json(cl);
}));

// Estado de cuenta: fiados y abonos con el saldo después de cada movimiento
r.get('/cartera/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [cliente] } = await pool.query(
    `SELECT id, nombre, telefono, direccion, cupo_fiado, saldo_cliente(id) AS saldo FROM cliente WHERE id = $1`, [id]);
  if (!cliente) throw new ErrorApp('Cliente no encontrado', 404);
  const { rows } = await pool.query(`
    SELECT 'FIADO' AS tipo, pg.id, pg.creado_en AS fecha, pg.valor, p.id AS pedido_id, p.numero AS pedido_numero,
           NULL AS medio, NULL AS nota, false AS anulado, NULL AS motivo_anulacion, u.nombre AS usuario
      FROM pago pg JOIN pedido p ON p.id = pg.pedido_id LEFT JOIN usuario u ON u.id = pg.registrado_por
     WHERE pg.cliente_id = $1 AND pg.medio = 'FIADO' AND p.estado = 'pagado'
    UNION ALL
    SELECT 'ABONO', a.id, a.creado_en, a.valor, NULL, NULL, a.medio, a.nota, a.anulado, a.motivo_anulacion, u.nombre
      FROM abono_cliente a LEFT JOIN usuario u ON u.id = a.registrado_por
     WHERE a.cliente_id = $1
     ORDER BY fecha, tipo DESC`, [id]);
  let saldo = 0;
  const movimientos = rows.map((m) => {
    if (!m.anulado) saldo += m.tipo === 'FIADO' ? Number(m.valor) : -Number(m.valor);
    return { ...m, valor: Number(m.valor), saldo };
  });
  res.json({ cliente, movimientos });
}));

r.put('/cartera/:id', ah(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) throw new ErrorApp('Escriba el nombre del cliente');
  const { rowCount } = await pool.query(`UPDATE cliente SET nombre = $2, cupo_fiado = $3 WHERE id = $1`,
    [Number(req.params.id), nombre, cupo(req.body.cupo_fiado)]);
  if (!rowCount) throw new ErrorApp('Cliente no encontrado', 404);
  res.json({ ok: true });
}));

// Abono: entra a la caja del turno abierto
r.post('/cartera/:id/abono', ah(async (req, res) => {
  const valor = Math.round(Number(req.body.valor));
  const medio = req.body.medio || 'EFECTIVO';
  if (!(valor > 0)) throw new ErrorApp('Escriba el valor del abono');
  if (!MEDIOS_ABONO.includes(medio)) throw new ErrorApp('Medio de pago inválido');
  const abono = await tx(async (c) => {
    const { rows: [turno] } = await c.query(`SELECT id FROM turno_caja WHERE estado = 'abierto'`);
    if (!turno) throw new ErrorApp('No hay caja abierta. Abra el turno de caja para recibir abonos.');
    const { rows: [a] } = await c.query(`
      INSERT INTO abono_cliente (cliente_id, valor, medio, turno_id, nota, registrado_por)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [Number(req.params.id), valor, medio, turno.id, req.body.nota?.trim() || null, req.usuario.id]);
    const { rows: [{ saldo }] } = await c.query(`SELECT saldo_cliente($1) AS saldo`, [a.cliente_id]);
    return { ...a, saldo };
  });
  avisar('caja');
  res.json(abono);
}));

r.post('/cartera/abonos/:id/anular', ah(async (req, res) => {
  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) throw new ErrorApp('Indique el motivo de la anulación');
  const { rowCount } = await pool.query(
    `UPDATE abono_cliente SET anulado = true, motivo_anulacion = $2 WHERE id = $1 AND NOT anulado`, [Number(req.params.id), motivo]);
  if (!rowCount) throw new ErrorApp('Abono no encontrado o ya anulado', 404);
  avisar('caja');
  res.json({ ok: true });
}));

export default r;
