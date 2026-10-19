// Superadministrador: crear y administrar restaurantes.
// Corre por fuera de un restaurante (con el dueño de las tablas), por eso ve todos.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, tx } from '../db.js';
import { sesion } from '../auth.js';
import { ah, ErrorApp } from '../util.js';

const r = Router();

r.get('/restaurantes', ah(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT r.id, r.nombre, r.activo, r.creado_en,
           (SELECT valor FROM ajuste a WHERE a.restaurante_id = r.id AND a.clave = 'ciudad') AS ciudad,
           (SELECT count(*)::int FROM usuario u WHERE u.restaurante_id = r.id AND u.activo) AS usuarios,
           (SELECT count(*)::int FROM pedido p WHERE p.restaurante_id = r.id) AS pedidos,
           (SELECT max(creado_en) FROM pedido p WHERE p.restaurante_id = r.id) AS ultimo_pedido
      FROM restaurante r ORDER BY r.id`);
  res.json(rows);
}));

// { nombre, ciudad, direccion, telefono, admin: { nombre, email, clave }, copiar_menu_de, mesas }
r.post('/restaurantes', ah(async (req, res) => {
  const b = req.body || {};
  const nombre = b.nombre?.trim();
  const adm = b.admin || {};
  const email = String(adm.email || '').toLowerCase().trim();
  if (!nombre) throw new ErrorApp('Escriba el nombre del restaurante');
  if (!adm.nombre?.trim() || !email) throw new ErrorApp('Escriba el nombre y el correo del administrador');
  if (!adm.clave || adm.clave.length < 6) throw new ErrorApp('La clave del administrador debe tener al menos 6 caracteres');
  const mesas = Math.min(Math.max(parseInt(b.mesas, 10) || 0, 0), 50);

  const id = await tx(async (c) => {
    const { rows: [usado] } = await c.query(`SELECT 1 FROM usuario WHERE email = $1`, [email]);
    if (usado) throw new ErrorApp('Ese correo ya está registrado; use otro para el administrador');
    const { rows: [nuevo] } = await c.query(`INSERT INTO restaurante (nombre) VALUES ($1) RETURNING id`, [nombre]);
    // Todo lo que se inserte en esta transacción queda en el restaurante nuevo
    await c.query(`SELECT set_config('app.restaurante_id', $1, true)`, [String(nuevo.id)]);

    const ajustes = {
      nombre_negocio: nombre,
      ciudad: b.ciudad?.trim() || '',
      direccion: b.direccion?.trim() || '',
      telefono: b.telefono?.trim() || '',
      costo_envio: '0',
      pie_ticket: '¡Gracias por su compra!'
    };
    for (const [clave, valor] of Object.entries(ajustes)) {
      await c.query(`INSERT INTO ajuste (clave, valor) VALUES ($1, $2)`, [clave, valor]);
    }
    for (let n = 1; n <= mesas; n++) {
      await c.query(`INSERT INTO mesa (nombre, orden) VALUES ($1, $2)`, [`Mesa ${n}`, n]);
    }
    await c.query(
      `INSERT INTO usuario (email, nombre, password_hash, rol) VALUES ($1, $2, $3, 'admin')`,
      [email, adm.nombre.trim(), await bcrypt.hash(adm.clave, 10)]);
    if (b.copiar_menu_de) await c.query(`SELECT copiar_menu($1, $2)`, [Number(b.copiar_menu_de), nuevo.id]);
    return nuevo.id;
  });
  res.json({ ok: true, id });
}));

r.patch('/restaurantes/:id', ah(async (req, res) => {
  const { nombre, activo } = req.body || {};
  await pool.query(
    `UPDATE restaurante SET nombre = coalesce($2, nombre), activo = coalesce($3, activo) WHERE id = $1`,
    [req.params.id, nombre?.trim() || null, typeof activo === 'boolean' ? activo : null]);
  res.json({ ok: true });
}));

// Entrar a un restaurante como administrador (para configurarlo o dar soporte)
r.post('/restaurantes/:id/entrar', ah(async (req, res) => {
  const { rows: [rest] } = await pool.query(`SELECT id, nombre FROM restaurante WHERE id = $1`, [req.params.id]);
  if (!rest) throw new ErrorApp('Restaurante no encontrado', 404);
  const u = req.usuario;
  res.json(sesion({ id: u.id, nombre: u.nombre, rol: 'admin', superadmin: true }, rest));
}));

export default r;
