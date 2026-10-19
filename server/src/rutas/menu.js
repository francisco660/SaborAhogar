// Menú: categorías, productos, grupos de opciones, opciones y recetas
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { permite } from '../auth.js';
import { ah, ErrorApp } from '../util.js';
import { avisar } from '../eventos.js';

const r = Router();

// Menú completo. ?todo=1 incluye inactivos y costos (para administrar)
r.get('/menu', ah(async (req, res) => {
  const todo = req.query.todo === '1' && req.usuario.rol === 'admin';
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre, c.orden, c.activo,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', p.nombre, 'descripcion', p.descripcion, 'precio', p.precio,
        'activo', p.activo, 'orden', p.orden, 'categoria_id', p.categoria_id,
        'impuesto_tipo', p.impuesto_tipo, 'impuesto_tasa', p.impuesto_tasa,
        'costo_base', round(cp.costo_base),
        'grupos', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', g.id, 'nombre', g.nombre, 'min_sel', g.min_sel, 'max_sel', g.max_sel,
            'opciones', coalesce((
              SELECT jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre,
                       'precio_extra', o.precio_extra, 'activo', o.activo) ORDER BY o.orden, o.id)
                FROM opcion o WHERE o.grupo_id = g.id AND (o.activo OR $1)), '[]'::jsonb)
          ) ORDER BY g.orden, g.id) FROM grupo_opcion g WHERE g.producto_id = p.id), '[]'::jsonb)
      ) ORDER BY p.orden, p.nombre) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS productos
    FROM categoria c
    LEFT JOIN producto p ON p.categoria_id = c.id AND (p.activo OR $1)
    LEFT JOIN v_costo_producto cp ON cp.producto_id = p.id
    WHERE c.activo OR $1
    GROUP BY c.id ORDER BY c.orden, c.nombre`, [todo]);
  res.json(rows);
}));

// ─── Administración del menú (solo admin) ───────────────────────────────────
const admin = permite();

// Mensaje claro cuando un nombre ya existe (restricciones UNIQUE)
const unico = (mensaje) => (e) => {
  if (e.code === '23505') throw new ErrorApp(mensaje);
  throw e;
};
// Impuesto del producto (precio con impuesto incluido): INC 8 %, IVA 19 % / 5 % o excluido
const impuesto = ({ impuesto_tipo: t, impuesto_tasa: tasa }) => {
  if (t === undefined || t === null || t === '') return { tipo: null, tasa: null };
  if (!['INC', 'IVA', 'EXCLUIDO'].includes(t)) throw new ErrorApp('Impuesto inválido');
  const v = t === 'EXCLUIDO' ? 0 : Number(tasa);
  if (!(v >= 0 && v <= 100)) throw new ErrorApp('Tarifa de impuesto inválida');
  return { tipo: t, tasa: v };
};
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numero = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// ─── Categorías ─────────────────────────────────────────────────────────────
r.post('/categorias', admin, ah(async (req, res) => {
  const nombre = texto(req.body.nombre);
  if (!nombre) throw new ErrorApp('Escriba el nombre de la categoría');
  const { rows } = await pool.query(
    `INSERT INTO categoria (nombre, orden)
     VALUES ($1, coalesce($2, (SELECT coalesce(max(orden), 0) + 1 FROM categoria))) RETURNING *`,
    [nombre, numero(req.body.orden)]).catch(unico('Ya existe una categoría con ese nombre'));
  avisar('menu');
  res.json(rows[0]);
}));

r.patch('/categorias/:id', admin, ah(async (req, res) => {
  const { activo } = req.body;
  await pool.query(
    `UPDATE categoria SET nombre = coalesce($2, nombre), orden = coalesce($3, orden),
            activo = coalesce($4, activo) WHERE id = $1`,
    [req.params.id, texto(req.body.nombre), numero(req.body.orden), typeof activo === 'boolean' ? activo : null])
    .catch(unico('Ya existe una categoría con ese nombre'));
  avisar('menu');
  res.json({ ok: true });
}));

// ─── Productos ──────────────────────────────────────────────────────────────
r.post('/productos', admin, ah(async (req, res) => {
  const nombre = texto(req.body.nombre);
  const precio = numero(req.body.precio);
  if (!req.body.categoria_id) throw new ErrorApp('Elija la categoría');
  if (!nombre) throw new ErrorApp('Escriba el nombre del producto');
  if (!(precio >= 0)) throw new ErrorApp('Escriba un precio válido');
  const imp = impuesto(req.body);
  const { rows } = await pool.query(
    `INSERT INTO producto (categoria_id, nombre, precio, descripcion, orden, impuesto_tipo, impuesto_tasa)
     VALUES ($1, $2, $3, $4, coalesce($5, (SELECT coalesce(max(orden), 0) + 1 FROM producto WHERE categoria_id = $1)),
             coalesce($6, 'INC'), coalesce($7, 8))
     RETURNING *`,
    [req.body.categoria_id, nombre, Math.round(precio), texto(req.body.descripcion), numero(req.body.orden), imp.tipo, imp.tasa])
    .catch(unico('Ya existe un producto con ese nombre en esa categoría'));
  avisar('menu');
  res.json(rows[0]);
}));

r.patch('/productos/:id', admin, ah(async (req, res) => {
  const { categoria_id, descripcion, activo } = req.body;
  const precio = numero(req.body.precio);
  if (precio !== null && !(precio >= 0)) throw new ErrorApp('Escriba un precio válido');
  await pool.query(
    `UPDATE producto SET categoria_id = coalesce($2, categoria_id), nombre = coalesce($3, nombre),
            precio = coalesce($4, precio), descripcion = CASE WHEN $5::text IS NULL THEN descripcion ELSE nullif($5, '') END,
            activo = coalesce($6, activo), orden = coalesce($7, orden),
            impuesto_tipo = coalesce($8, impuesto_tipo), impuesto_tasa = coalesce($9, impuesto_tasa)
      WHERE id = $1`,
    [req.params.id, categoria_id || null, texto(req.body.nombre), precio === null ? null : Math.round(precio),
     typeof descripcion === 'string' ? descripcion.trim() : null, typeof activo === 'boolean' ? activo : null,
     numero(req.body.orden), impuesto(req.body).tipo, impuesto(req.body).tasa])
    .catch(unico('Ya existe un producto con ese nombre en esa categoría'));
  avisar('menu');
  res.json({ ok: true });
}));

// ─── Grupos de opciones ("Proteína", "Bebida", "Término"...) ────────────────
const validarSel = (min, max) => {
  if (min !== null && !(min >= 0)) throw new ErrorApp('El mínimo debe ser 0 o más');
  if (max !== null && !(max >= 1)) throw new ErrorApp('El máximo debe ser 1 o más');
  if (min !== null && max !== null && max < min) throw new ErrorApp('El máximo no puede ser menor que el mínimo');
};

r.post('/productos/:id/grupos', admin, ah(async (req, res) => {
  const nombre = texto(req.body.nombre);
  const min = numero(req.body.min_sel) ?? 1;
  const max = numero(req.body.max_sel) ?? 1;
  if (!nombre) throw new ErrorApp('Escriba el nombre del grupo (ej: Proteína, Bebida)');
  validarSel(min, max);
  const { rows } = await pool.query(
    `INSERT INTO grupo_opcion (producto_id, nombre, min_sel, max_sel, orden)
     VALUES ($1, $2, $3, $4, (SELECT coalesce(max(orden), 0) + 1 FROM grupo_opcion WHERE producto_id = $1)) RETURNING *`,
    [req.params.id, nombre, min, max]);
  avisar('menu');
  res.json(rows[0]);
}));

r.patch('/grupos/:id', admin, ah(async (req, res) => {
  const min = numero(req.body.min_sel);
  const max = numero(req.body.max_sel);
  validarSel(min, max);
  await pool.query(
    `UPDATE grupo_opcion SET nombre = coalesce($2, nombre), min_sel = coalesce($3, min_sel),
            max_sel = coalesce($4, max_sel) WHERE id = $1`,
    [req.params.id, texto(req.body.nombre), min, max]);
  avisar('menu');
  res.json({ ok: true });
}));

r.delete('/grupos/:id', admin, ah(async (req, res) => {
  try {
    await pool.query(`DELETE FROM grupo_opcion WHERE id = $1`, [req.params.id]);
  } catch (e) {
    if (e.code === '23503') throw new ErrorApp('Este grupo ya se usó en pedidos; desactive sus opciones en lugar de borrarlo');
    throw e;
  }
  avisar('menu');
  res.json({ ok: true });
}));

r.post('/grupos/:id/opciones', admin, ah(async (req, res) => {
  const nombre = texto(req.body.nombre);
  const extra = numero(req.body.precio_extra) ?? 0;
  if (!nombre) throw new ErrorApp('Escriba el nombre de la opción');
  if (!(extra >= 0)) throw new ErrorApp('El precio extra debe ser 0 o más');
  const { rows } = await pool.query(
    `INSERT INTO opcion (grupo_id, nombre, precio_extra, orden)
     VALUES ($1, $2, $3, (SELECT coalesce(max(orden),0) + 1 FROM opcion WHERE grupo_id = $1)) RETURNING *`,
    [req.params.id, nombre, Math.round(extra)]);
  avisar('menu');
  res.json(rows[0]);
}));

r.patch('/opciones/:id', admin, ah(async (req, res) => {
  const { activo } = req.body;
  const extra = numero(req.body.precio_extra);
  if (extra !== null && !(extra >= 0)) throw new ErrorApp('El precio extra debe ser 0 o más');
  await pool.query(
    `UPDATE opcion SET nombre = coalesce($2, nombre), precio_extra = coalesce($3, precio_extra),
            activo = coalesce($4, activo) WHERE id = $1`,
    [req.params.id, texto(req.body.nombre), extra === null ? null : Math.round(extra), typeof activo === 'boolean' ? activo : null]);
  avisar('menu');
  res.json({ ok: true });
}));

// Receta de un producto (?producto_id=) o de una opción (?opcion_id=)
r.get('/recetas', admin, ah(async (req, res) => {
  const { producto_id, opcion_id } = req.query;
  const { rows } = await pool.query(
    `SELECT r.insumo_id, i.nombre, i.unidad, r.cantidad, round(r.cantidad * i.costo_promedio) AS costo
       FROM receta r JOIN insumo i ON i.id = r.insumo_id
      WHERE ($1::int IS NOT NULL AND r.producto_id = $1) OR ($2::int IS NOT NULL AND r.opcion_id = $2)
      ORDER BY i.nombre`,
    [producto_id || null, opcion_id || null]);
  res.json(rows);
}));

// Reemplaza la receta completa: { producto_id | opcion_id, lineas: [{insumo_id, cantidad}] }
r.put('/recetas', admin, ah(async (req, res) => {
  const { producto_id = null, opcion_id = null, lineas = [] } = req.body;
  if (!producto_id === !opcion_id) throw new ErrorApp('Indique producto_id u opcion_id');
  await tx(async (c) => {
    await c.query(`DELETE FROM receta WHERE producto_id = $1 OR opcion_id = $2`, [producto_id, opcion_id]);
    for (const l of lineas) {
      if (!(Number(l.cantidad) > 0)) continue;
      await c.query(
        `INSERT INTO receta (producto_id, opcion_id, insumo_id, cantidad) VALUES ($1, $2, $3, $4)`,
        [producto_id, opcion_id, l.insumo_id, l.cantidad]);
    }
  });
  res.json({ ok: true });
}));

export default r;
