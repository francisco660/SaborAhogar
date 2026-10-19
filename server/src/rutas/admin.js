// Reportes, usuarios, mesas y ajustes
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { permite } from '../auth.js';
import { ah, ErrorApp, hoy } from '../util.js';

const r = Router();
const admin = permite();
const ROLES = ['admin', 'cajero', 'mesero', 'cocina', 'domiciliario'];

function actualizarCampos(base, campos) {
  const updates = [];
  const values = [];
  let idx = 2;

  for (const [campo, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    updates.push(`${campo} = $${idx++}`);
    values.push(valor);
  }

  if (!updates.length) return null;
  return {
    sql: `${base} ${updates.join(', ')} WHERE id = $1`,
    values: [undefined, ...values]
  };
}

// ─── Reportes ───────────────────────────────────────────────────────────────
r.get('/reportes/resumen', admin, ah(async (req, res) => {
  const desde = req.query.desde || hoy();
  const hasta = req.query.hasta || desde;
  const p = [desde, hasta];
  const enRango = `p.estado = 'pagado' AND (p.cerrado_en AT TIME ZONE 'America/Bogota')::date BETWEEN $1 AND $2`;
  const [dias, productos, medios, tipos, gastos] = await Promise.all([
    pool.query(`SELECT * FROM reporte_utilidad($1, $2)`, p),
    pool.query(`
      SELECT i.nombre, sum(i.cantidad)::int AS cantidad, sum(i.cantidad * i.precio_unit) AS ventas,
             round(sum(i.cantidad * coalesce(i.costo_unit, 0))) AS costo
        FROM pedido_item i JOIN pedido p ON p.id = i.pedido_id
       WHERE ${enRango} AND i.estado <> 'anulado'
       GROUP BY i.nombre ORDER BY ventas DESC`, p),
    pool.query(`
      SELECT pg.medio, sum(pg.valor) AS valor FROM pago pg JOIN pedido p ON p.id = pg.pedido_id
       WHERE ${enRango} GROUP BY pg.medio ORDER BY valor DESC`, p),
    pool.query(`
      SELECT p.tipo, count(*)::int AS pedidos, sum(total_pedido(p.id)) AS ventas
        FROM pedido p WHERE ${enRango} GROUP BY p.tipo ORDER BY ventas DESC`, p),
    pool.query(`
      SELECT categoria, sum(valor) AS valor FROM gasto
       WHERE NOT anulado AND fecha BETWEEN $1 AND $2 GROUP BY categoria ORDER BY valor DESC`, p)
  ]);
  const totales = dias.rows.reduce((t, d) => {
    for (const k of ['pedidos', 'ventas', 'costo_ventas', 'utilidad_bruta', 'mermas', 'gastos', 'utilidad_operativa']) {
      t[k] = (t[k] || 0) + Number(d[k]);
    }
    return t;
  }, {});
  res.json({ desde, hasta, totales, dias: dias.rows, productos: productos.rows,
             medios: medios.rows, tipos: tipos.rows, gastos: gastos.rows });
}));

// ─── Usuarios ───────────────────────────────────────────────────────────────
r.get('/usuarios', admin, ah(async (_req, res) => {
  res.json((await pool.query(`SELECT id, email, nombre, rol, activo FROM usuario
     WHERE restaurante_id = restaurante_actual() ORDER BY activo DESC, nombre`)).rows);
}));

r.post('/usuarios', admin, ah(async (req, res) => {
  const { email, nombre, clave, rol } = req.body;
  if (!email || !nombre || !ROLES.includes(rol)) throw new ErrorApp('Datos incompletos o rol inválido');
  if (!clave || clave.length < 6) throw new ErrorApp('La clave debe tener al menos 6 caracteres');
  try {
    await pool.query(
      `INSERT INTO usuario (email, nombre, password_hash, rol) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET nombre = $2, password_hash = $3, rol = $4, activo = true`,
      [email.toLowerCase().trim(), nombre.trim(), await bcrypt.hash(clave, 10), rol]);
  } catch (e) {
    // El correo existe en otro restaurante: la seguridad por filas impide tocarlo
    if (e.code === '42501') throw new ErrorApp('Ese correo ya está registrado en otro restaurante; use otro');
    throw e;
  }
  res.json({ ok: true });
}));

r.patch('/usuarios/:id', admin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new ErrorApp('Usuario inválido');
  if (id === req.usuario.id && req.body.activo === false) {
    throw new ErrorApp('No puede desactivar su propio usuario');
  }

  const campos = {};
  if (req.body.nombre !== undefined) {
    const nombre = String(req.body.nombre).trim();
    if (!nombre) throw new ErrorApp('El nombre es requerido');
    campos.nombre = nombre;
  }
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!email) throw new ErrorApp('El correo es requerido');
    campos.email = email;
  }
  if (req.body.rol !== undefined) {
    if (!ROLES.includes(req.body.rol)) throw new ErrorApp('Rol inválido');
    campos.rol = req.body.rol;
  }
  if (req.body.clave !== undefined) {
    const clave = String(req.body.clave).trim();
    if (clave.length < 6) throw new ErrorApp('La clave debe tener al menos 6 caracteres');
    campos.password_hash = await bcrypt.hash(clave, 10);
  }
  if (req.body.activo !== undefined) {
    campos.activo = Boolean(req.body.activo);
  }

  if (!Object.keys(campos).length) {
    res.json({ ok: true });
    return;
  }

  const camposSql = [];
  const valores = [id];
  let i = 2;
  for (const [campo, valor] of Object.entries(campos)) {
    camposSql.push(`${campo} = $${i++}`);
    valores.push(valor);
  }

  await pool.query(`UPDATE usuario SET ${camposSql.join(', ')} WHERE id = $1`, valores);
  res.json({ ok: true });
}));

r.delete('/usuarios/:id', admin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new ErrorApp('Usuario inválido');
  if (id === req.usuario.id) throw new ErrorApp('No puede eliminar su propio usuario');
  await pool.query(`UPDATE usuario SET activo = false WHERE id = $1`, [id]);
  res.json({ ok: true });
}));

// ─── Mesas ──────────────────────────────────────────────────────────────────
r.get('/mesas', ah(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT m.id, m.nombre, p.id AS pedido_id, total_pedido(p.id) AS total, p.creado_en,
           (SELECT count(*)::int FROM pedido_item i WHERE i.pedido_id = p.id AND i.estado = 'listo') AS listos,
           (SELECT count(*)::int FROM pedido_item i WHERE i.pedido_id = p.id AND i.estado = 'preparando') AS preparando,
           (SELECT count(*)::int FROM pedido_item i WHERE i.pedido_id = p.id AND i.estado = 'en_cocina') AS en_cocina,
           -- Todo entregado y nada más por preparar: solo falta cobrar
           (EXISTS (SELECT 1 FROM pedido_item i WHERE i.pedido_id = p.id AND i.estado = 'entregado')
            AND NOT EXISTS (SELECT 1 FROM pedido_item i WHERE i.pedido_id = p.id
                              AND i.estado IN ('pendiente', 'en_cocina', 'preparando', 'listo'))) AS por_cobrar
      FROM mesa m LEFT JOIN pedido p ON p.mesa_id = m.id AND p.estado = 'abierto'
     WHERE m.activa ORDER BY m.orden, m.nombre`);
  res.json(rows);
}));

r.post('/mesas', admin, ah(async (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) throw new ErrorApp('Escriba el nombre de la mesa');
  await pool.query(
    `INSERT INTO mesa (nombre, orden) VALUES ($1, (SELECT coalesce(max(orden),0) + 1 FROM mesa))
     ON CONFLICT (restaurante_id, nombre) DO UPDATE SET activa = true`, [nombre.trim()]);
  res.json({ ok: true });
}));

r.delete('/mesas/:id', admin, ah(async (req, res) => {
  await pool.query(`UPDATE mesa SET activa = false WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

// ─── Ajustes del negocio ────────────────────────────────────────────────────
r.get('/ajustes', ah(async (_req, res) => {
  // El token del proveedor de facturación nunca sale del servidor
  const { rows } = await pool.query(`SELECT clave, valor FROM ajuste WHERE clave <> 'fe_api_token'`);
  res.json(Object.fromEntries(rows.map((x) => [x.clave, x.valor])));
}));

r.put('/ajustes', admin, ah(async (req, res) => {
  for (const [clave, valor] of Object.entries(req.body || {})) {
    await pool.query(
      `INSERT INTO ajuste (clave, valor) VALUES ($1, $2) ON CONFLICT (restaurante_id, clave) DO UPDATE SET valor = $2`,
      [clave, String(valor)]);
  }
  res.json({ ok: true });
}));

// ─── Empleados ───────────────────────────────────────────────────────────────
r.get('/empleados', admin, ah(async (_req, res) => {
  res.json((await pool.query(`SELECT id, nombre, cargo, salario, activo FROM empleado ORDER BY activo DESC, nombre`)).rows);
}));

r.post('/empleados', admin, ah(async (req, res) => {
  const { nombre, cargo, salario } = req.body;
  if (!nombre?.trim()) throw new ErrorApp('Escriba el nombre del empleado');
  const valor = Number(salario);
  if (!(valor >= 0)) throw new ErrorApp('El salario debe ser mayor o igual a cero');
  await pool.query(
    `INSERT INTO empleado (nombre, cargo, salario) VALUES ($1, $2, $3)
     ON CONFLICT (restaurante_id, nombre) DO UPDATE SET cargo = EXCLUDED.cargo, salario = EXCLUDED.salario, activo = true`,
    [nombre.trim(), cargo?.trim() || null, Math.round(valor)]);
  res.json({ ok: true });
}));

r.patch('/empleados/:id', admin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new ErrorApp('Empleado inválido');

  const campos = {};
  if (req.body.nombre !== undefined) {
    const nombre = String(req.body.nombre).trim();
    if (!nombre) throw new ErrorApp('El nombre es requerido');
    campos.nombre = nombre;
  }
  if (req.body.cargo !== undefined) campos.cargo = String(req.body.cargo).trim() || null;
  if (req.body.salario !== undefined) {
    const valor = Number(req.body.salario);
    if (!(valor >= 0)) throw new ErrorApp('El salario debe ser mayor o igual a cero');
    campos.salario = Math.round(valor);
  }
  if (req.body.activo !== undefined) campos.activo = Boolean(req.body.activo);

  if (!Object.keys(campos).length) {
    res.json({ ok: true });
    return;
  }

  const camposSql = [];
  const valores = [id];
  let i = 2;
  for (const [campo, valor] of Object.entries(campos)) {
    camposSql.push(`${campo} = $${i++}`);
    valores.push(valor);
  }

  await pool.query(`UPDATE empleado SET ${camposSql.join(', ')} WHERE id = $1`, valores);
  res.json({ ok: true });
}));

r.delete('/empleados/:id', admin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new ErrorApp('Empleado inválido');
  await pool.query(`UPDATE empleado SET activo = false WHERE id = $1`, [id]);
  res.json({ ok: true });
}));

export default r;
