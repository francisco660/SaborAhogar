// Pedidos (mesa, para llevar, domicilio), cocina y cobro
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { permite } from '../auth.js';
import { avisar } from '../eventos.js';
import { ah, ErrorApp } from '../util.js';
import { crearDocumento, leerConfig } from '../facturacion/documentos.js';

const r = Router();
const MEDIOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TARJETA', 'TRANSFERENCIA'];

// Consulta base de pedidos con ítems, opciones, total y pagos
const SQL_PEDIDOS = `
  SELECT p.*, m.nombre AS mesa, cl.nombre AS cliente, cl.telefono, cl.barrio,
         me.nombre AS mesero, d.nombre AS domiciliario,
         total_pedido(p.id) AS total,
         (SELECT coalesce(sum(valor),0) FROM pago WHERE pedido_id = p.id) AS pagado,
         (SELECT coalesce(jsonb_agg(jsonb_build_object('medio', medio, 'valor', valor,
                   'por_liquidar', turno_id IS NULL) ORDER BY id), '[]') FROM pago WHERE pedido_id = p.id) AS pagos,
         coalesce((SELECT jsonb_agg(jsonb_build_object(
             'id', i.id, 'producto_id', i.producto_id, 'nombre', i.nombre, 'cantidad', i.cantidad,
             'precio_unit', i.precio_unit, 'nota', i.nota, 'estado', i.estado,
             'enviado_en', i.enviado_en, 'listo_en', i.listo_en,
             'opciones', (SELECT coalesce(jsonb_agg(o.nombre ORDER BY o.opcion_id), '[]')
                            FROM pedido_item_opcion o WHERE o.item_id = i.id)
           ) ORDER BY i.id) FROM pedido_item i WHERE i.pedido_id = p.id), '[]') AS items,
         coalesce((SELECT jsonb_agg(jsonb_build_object(
             'id', d.id, 'tipo', d.tipo, 'prefijo', d.prefijo, 'numero', d.numero, 'estado', d.estado,
             'cufe', d.cufe, 'mensaje', d.mensaje, 'anulado', d.datos ? 'anulado_por',
             'cliente', d.datos->'adquiriente'->>'nombre') ORDER BY d.id)
           FROM documento_electronico d WHERE d.pedido_id = p.id), '[]') AS documentos
    FROM pedido p
    LEFT JOIN mesa m ON m.id = p.mesa_id
    LEFT JOIN cliente cl ON cl.id = p.cliente_id
    LEFT JOIN usuario me ON me.id = p.mesero_id
    LEFT JOIN usuario d ON d.id = p.domiciliario_id`;

async function obtenerPedido(c, id) {
  const { rows } = await c.query(`${SQL_PEDIDOS} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw new ErrorApp('Pedido no encontrado', 404);
  return rows[0];
}

// Inserta ítems validando opciones; el precio lo calcula el servidor
async function agregarItems(c, pedidoId, items = []) {
  if (!items.length) return;
  for (const it of items) {
    const cantidad = parseInt(it.cantidad ?? 1, 10);
    if (!(cantidad > 0)) throw new ErrorApp('Cantidad inválida');
    const { rows: [prod] } = await c.query(
      `SELECT id, nombre, precio FROM producto WHERE id = $1 AND activo`, [it.producto_id]);
    if (!prod) throw new ErrorApp('Producto no disponible');

    const elegidas = [...new Set((it.opciones || []).map(Number))];
    const { rows: grupos } = await c.query(`
      SELECT g.id, g.nombre, g.min_sel, g.max_sel,
             coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.nombre, 'precio_extra', o.precio_extra))
                      FILTER (WHERE o.id IS NOT NULL), '[]') AS opciones
        FROM grupo_opcion g LEFT JOIN opcion o ON o.grupo_id = g.id AND o.activo
       WHERE g.producto_id = $1 GROUP BY g.id`, [prod.id]);

    const opcionesItem = [];
    for (const g of grupos) {
      const sel = g.opciones.filter((o) => elegidas.includes(o.id));
      if (sel.length < g.min_sel || sel.length > g.max_sel) {
        throw new ErrorApp(`${prod.nombre}: elija ${g.min_sel === g.max_sel ? g.min_sel : `entre ${g.min_sel} y ${g.max_sel}`} en "${g.nombre}"`);
      }
      opcionesItem.push(...sel);
    }
    if (opcionesItem.length !== elegidas.length) throw new ErrorApp(`${prod.nombre}: opción inválida`);

    const precio = prod.precio + opcionesItem.reduce((s, o) => s + Number(o.precio_extra), 0);
    const { rows: [item] } = await c.query(
      `INSERT INTO pedido_item (pedido_id, producto_id, nombre, cantidad, precio_unit, nota)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [pedidoId, prod.id, prod.nombre, cantidad, precio, it.nota?.trim() || null]);
    for (const o of opcionesItem) {
      await c.query(
        `INSERT INTO pedido_item_opcion (item_id, opcion_id, nombre, precio_extra) VALUES ($1, $2, $3, $4)`,
        [item.id, o.id, o.nombre, o.precio_extra]);
    }
  }
}

const enviarPendientes = (c, pedidoId) =>
  c.query(`UPDATE pedido_item SET estado = 'en_cocina' WHERE pedido_id = $1 AND estado = 'pendiente'`, [pedidoId]);

// ─── Lectura ────────────────────────────────────────────────────────────────
// ?estado=abierto (por defecto) | pagado | anulado | todos ; ?dia=YYYY-MM-DD
r.get('/pedidos', ah(async (req, res) => {
  const estado = req.query.estado || 'abierto';
  const params = [];
  let where = 'WHERE true';
  if (estado !== 'todos') { params.push(estado); where += ` AND p.estado = $${params.length}`; }
  if (req.query.dia) {
    params.push(req.query.dia);
    where += ` AND (p.creado_en AT TIME ZONE 'America/Bogota')::date = $${params.length}`;
  }
  if (req.usuario.rol === 'domiciliario') {
    params.push(req.usuario.id);
    where += ` AND p.domiciliario_id = $${params.length}`;
  }
  const { rows } = await pool.query(`${SQL_PEDIDOS} ${where} ORDER BY p.id DESC LIMIT 300`, params);
  res.json(rows);
}));

r.get('/pedidos/:id', ah(async (req, res) => res.json(await obtenerPedido(pool, req.params.id))));

// Pantalla de cocina: ítems en preparación agrupados por pedido
r.get('/cocina', permite('cocina', 'cajero', 'mesero'), ah(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.numero, p.tipo, p.nota, m.nombre AS mesa, coalesce(cl.nombre, p.nombre_cliente) AS cliente,
           min(i.enviado_en) AS desde,
           jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
             'nota', i.nota, 'estado', i.estado, 'enviado_en', i.enviado_en,
             'opciones', (SELECT coalesce(jsonb_agg(o.nombre), '[]') FROM pedido_item_opcion o WHERE o.item_id = i.id))
             ORDER BY i.id) AS items
      FROM pedido_item i
      JOIN pedido p ON p.id = i.pedido_id
      LEFT JOIN mesa m ON m.id = p.mesa_id
      LEFT JOIN cliente cl ON cl.id = p.cliente_id
     WHERE i.estado IN ('en_cocina', 'preparando') AND p.estado <> 'anulado'
     GROUP BY p.id, m.nombre, cl.nombre
     ORDER BY min(i.enviado_en)`);
  res.json(rows);
}));

r.get('/clientes', ah(async (req, res) => {
  const tel = String(req.query.telefono || '').replace(/\D/g, '');
  if (tel.length < 4) return res.json([]);
  const { rows } = await pool.query(
    `SELECT * FROM cliente WHERE regexp_replace(telefono, '\\D', '', 'g') LIKE $1 ORDER BY nombre LIMIT 10`,
    [`%${tel}%`]);
  res.json(rows);
}));

// ─── Crear y modificar ──────────────────────────────────────────────────────
// Crea o actualiza el cliente de un domicilio (por teléfono) y devuelve su id y dirección
async function guardarCliente(c, cl = {}) {
  const tel = String(cl.telefono || '').trim();
  if (!tel || !cl.direccion?.trim()) throw new ErrorApp('El domicilio necesita teléfono y dirección');
  const { rows: [row] } = await c.query(
    `INSERT INTO cliente (telefono, nombre, direccion, barrio) VALUES ($1, $2, $3, $4)
     ON CONFLICT (restaurante_id, telefono) DO UPDATE SET
       nombre = coalesce(EXCLUDED.nombre, cliente.nombre),
       direccion = EXCLUDED.direccion, barrio = coalesce(EXCLUDED.barrio, cliente.barrio)
     RETURNING id`,
    [tel, cl.nombre?.trim() || null, cl.direccion.trim(), cl.barrio?.trim() || null]);
  return { clienteId: row.id, direccion: cl.direccion.trim() };
}

// { tipo, mesa_id, nombre_cliente, cliente:{telefono,nombre,direccion,barrio},
//   costo_envio, nota, items:[{producto_id,cantidad,nota,opciones:[id]}], enviar }
r.post('/pedidos', permite('mesero', 'cajero'), ah(async (req, res) => {
  const b = req.body;
  if (!['MESA', 'LLEVAR', 'DOMICILIO'].includes(b.tipo)) throw new ErrorApp('Tipo de pedido inválido');
  const id = await tx(async (c) => {
    let clienteId = null;
    let direccion = null;
    if (b.tipo === 'DOMICILIO') ({ clienteId, direccion } = await guardarCliente(c, b.cliente));
    if (b.tipo === 'MESA') {
      const { rows } = await c.query(
        `SELECT id FROM pedido WHERE mesa_id = $1 AND estado = 'abierto'`, [b.mesa_id]);
      if (rows.length) throw new ErrorApp(`La mesa ya tiene el pedido #${rows[0].id} abierto; agregue los ítems ahí`);
    }
    const { rows: [p] } = await c.query(
      `INSERT INTO pedido (tipo, mesa_id, cliente_id, nombre_cliente, direccion_entrega, costo_envio, nota, mesero_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [b.tipo, b.tipo === 'MESA' ? b.mesa_id : null, clienteId, b.nombre_cliente?.trim() || null,
       direccion, b.tipo === 'DOMICILIO' ? Number(b.costo_envio) || 0 : 0, b.nota?.trim() || null,
       req.usuario.id]);
    await agregarItems(c, p.id, b.items);
    if (b.enviar) await enviarPendientes(c, p.id);
    return p.id;
  });
  avisar('pedidos', { id });
  res.json(await obtenerPedido(pool, id));
}));

r.post('/pedidos/:id/items', permite('mesero', 'cajero'), ah(async (req, res) => {
  const id = Number(req.params.id);
  await tx(async (c) => {
    await agregarItems(c, id, req.body.items);
    if (req.body.enviar) await enviarPendientes(c, id);
  });
  avisar('pedidos', { id });
  res.json(await obtenerPedido(pool, id));
}));

r.post('/pedidos/:id/enviar', permite('mesero', 'cajero'), ah(async (req, res) => {
  await tx((c) => enviarPendientes(c, req.params.id));
  avisar('pedidos', { id: Number(req.params.id) });
  res.json(await obtenerPedido(pool, req.params.id));
}));

r.patch('/pedidos/:id', permite('mesero', 'cajero'), ah(async (req, res) => {
  const { nota, costo_envio, mesa_id } = req.body;
  await pool.query(
    `UPDATE pedido SET nota = coalesce($2, nota), costo_envio = coalesce($3, costo_envio),
            mesa_id = CASE WHEN tipo = 'MESA' THEN coalesce($4, mesa_id) ELSE mesa_id END
      WHERE id = $1`,
    [req.params.id, nota, costo_envio, mesa_id]);
  avisar('pedidos', { id: Number(req.params.id) });
  res.json(await obtenerPedido(pool, req.params.id));
}));

// Corregir teléfono, nombre, dirección o barrio de un domicilio aún no entregado
r.patch('/pedidos/:id/cliente', permite('mesero', 'cajero', 'domiciliario'), ah(async (req, res) => {
  const id = Number(req.params.id);
  await tx(async (c) => {
    const { rows: [p] } = await c.query(`SELECT tipo, estado, entregado_en FROM pedido WHERE id = $1 FOR UPDATE`, [id]);
    if (!p) throw new ErrorApp('Pedido no encontrado', 404);
    if (p.tipo !== 'DOMICILIO') throw new ErrorApp('Solo los domicilios tienen datos de entrega');
    if (p.estado === 'anulado' || p.entregado_en) throw new ErrorApp('Este domicilio ya fue entregado o anulado');
    const { clienteId, direccion } = await guardarCliente(c, req.body);
    await c.query(`UPDATE pedido SET cliente_id = $2, direccion_entrega = $3 WHERE id = $1`, [id, clienteId, direccion]);
  });
  avisar('pedidos', { id });
  res.json(await obtenerPedido(pool, id));
}));

// Cambiar estado de un ítem: preparando/listo (cocina), entregado (mesero), anulado (caja)
r.patch('/items/:id', ah(async (req, res) => {
  const { estado } = req.body;
  const rol = req.usuario.rol;
  const puede = {
    preparando: ['admin', 'cocina', 'cajero'],
    listo: ['admin', 'cocina', 'cajero'],
    entregado: ['admin', 'mesero', 'cajero'],
    anulado: ['admin', 'cajero']
  }[estado];
  if (!puede) throw new ErrorApp('Estado inválido');
  if (!puede.includes(rol)) throw new ErrorApp('Su rol no tiene permiso para esta acción', 403);
  const { rows } = await pool.query(
    `UPDATE pedido_item SET estado = $2 WHERE id = $1 RETURNING pedido_id`, [req.params.id, estado]);
  if (!rows[0]) throw new ErrorApp('Ítem no encontrado', 404);
  avisar('pedidos', { id: rows[0].pedido_id });
  res.json({ ok: true });
}));

// Empezar a preparar todos los ítems en cocina de un pedido
r.post('/pedidos/:id/preparar', permite('cocina', 'cajero'), ah(async (req, res) => {
  await pool.query(
    `UPDATE pedido_item SET estado = 'preparando' WHERE pedido_id = $1 AND estado = 'en_cocina'`, [req.params.id]);
  avisar('pedidos', { id: Number(req.params.id) });
  res.json({ ok: true });
}));

// Marcar listos todos los ítems en cocina de un pedido
r.post('/pedidos/:id/listo', permite('cocina', 'cajero'), ah(async (req, res) => {
  await pool.query(
    `UPDATE pedido_item SET estado = 'listo' WHERE pedido_id = $1 AND estado IN ('en_cocina', 'preparando')`, [req.params.id]);
  avisar('pedidos', { id: Number(req.params.id), listo: true });
  res.json({ ok: true });
}));

// Borrar un ítem que no se ha enviado a cocina
r.delete('/items/:id', permite('mesero', 'cajero'), ah(async (req, res) => {
  const { rows } = await pool.query(`DELETE FROM pedido_item WHERE id = $1 RETURNING pedido_id`, [req.params.id]);
  if (rows[0]) avisar('pedidos', { id: rows[0].pedido_id });
  res.json({ ok: true });
}));

r.post('/pedidos/:id/anular', permite('cajero'), ah(async (req, res) => {
  const motivo = req.body.motivo?.trim();
  if (!motivo) throw new ErrorApp('Indique el motivo de la anulación');
  await tx(async (c) => {
    await c.query(`UPDATE pedido_item SET estado = 'anulado' WHERE pedido_id = $1 AND estado <> 'anulado'`, [req.params.id]);
    await c.query(`UPDATE pedido SET estado = 'anulado', motivo_anulacion = $2 WHERE id = $1`, [req.params.id, motivo]);
  });
  avisar('pedidos', { id: Number(req.params.id) });
  res.json({ ok: true });
}));

// Cobrar: { pagos: [{medio, valor}], por_liquidar: bool }
// por_liquidar = el domiciliario recibe el efectivo y lo entrega después en caja
r.post('/pedidos/:id/cobrar', permite('cajero'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const { pagos = [], por_liquidar = false, factura = null } = req.body;
  let avisoFe = null;
  await tx(async (c) => {
    const { rows: [p] } = await c.query(`SELECT * FROM pedido WHERE id = $1 FOR UPDATE`, [id]);
    if (!p) throw new ErrorApp('Pedido no encontrado', 404);
    const { rows: [turno] } = await c.query(`SELECT id FROM turno_caja WHERE estado = 'abierto'`);

    if (por_liquidar) {
      if (p.tipo !== 'DOMICILIO' || !p.domiciliario_id) throw new ErrorApp('Asigne primero el domiciliario');
      const { rows: [{ total }] } = await c.query(`SELECT total_pedido($1) AS total`, [id]);
      await c.query(
        `INSERT INTO pago (pedido_id, medio, valor, turno_id, domiciliario_id, registrado_por)
         VALUES ($1, 'EFECTIVO', $2, NULL, $3, $4)`, [id, total, p.domiciliario_id, req.usuario.id]);
    } else {
      if (!turno) throw new ErrorApp('No hay caja abierta. Abra el turno de caja para cobrar.');
      if (!pagos.length) throw new ErrorApp('Registre al menos un pago');
      for (const pg of pagos) {
        if (!MEDIOS.includes(pg.medio) || !(Number(pg.valor) > 0)) throw new ErrorApp('Pago inválido');
        await c.query(
          `INSERT INTO pago (pedido_id, medio, valor, turno_id, registrado_por) VALUES ($1, $2, $3, $4, $5)`,
          [id, pg.medio, Math.round(Number(pg.valor)), turno.id, req.usuario.id]);
      }
    }
    await c.query(`UPDATE pedido SET estado = 'pagado' WHERE id = $1`, [id]);

    // Facturación electrónica: factura si el cliente la pidió; si no, POS electrónico.
    // Un problema con la factura (p. ej. rango agotado) no impide cobrar: se avisa al cajero.
    const cfg = await leerConfig(c);
    if (cfg.fe_activa === 'true' && (factura?.cliente_fiscal_id || cfg.fe_auto_pos !== 'false')) {
      try {
        await tx((c2) => crearDocumento(c2, {
          pedidoId: id, tipo: factura?.cliente_fiscal_id ? 'FACTURA' : 'POS',
          clienteFiscalId: factura?.cliente_fiscal_id || null, usuarioId: req.usuario.id }));
      } catch (e) {
        avisoFe = `El pedido se cobró, pero no se generó el documento electrónico: ${e.message}`;
      }
    }
  });
  avisar('pedidos', { id });
  res.json({ ...(await obtenerPedido(pool, id)), aviso_fe: avisoFe });
}));

// ─── Domicilios ─────────────────────────────────────────────────────────────
r.get('/domiciliarios', ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre FROM usuario WHERE rol = 'domiciliario' AND activo AND restaurante_id = restaurante_actual() ORDER BY nombre`);
  res.json(rows);
}));

// { domiciliario_id } asigna y despacha ; { entregado: true } marca entregado
r.post('/pedidos/:id/domicilio', permite('cajero', 'domiciliario'), ah(async (req, res) => {
  const id = Number(req.params.id);
  // No se despacha ni se entrega lo que la cocina aún no ha terminado
  const { rows: [c] } = await pool.query(
    `SELECT count(*) FILTER (WHERE estado IN ('pendiente', 'en_cocina', 'preparando'))::int AS en_cocina,
            count(*) FILTER (WHERE estado IN ('listo', 'entregado'))::int AS listos
       FROM pedido_item WHERE pedido_id = $1`, [id]);
  if (c.en_cocina) throw new ErrorApp('El pedido aún está en cocina; espere a que lo marquen como listo');
  if (!c.listos) throw new ErrorApp('El pedido no tiene platos listos para entregar');
  if (req.body.entregado) {
    const { rowCount } = await pool.query(
      `UPDATE pedido SET entregado_en = now() WHERE id = $1 AND tipo = 'DOMICILIO'
         AND ($2 <> 'domiciliario' OR domiciliario_id = $3)`,
      [id, req.usuario.rol, req.usuario.id]);
    if (!rowCount) throw new ErrorApp('No puede marcar este domicilio', 403);
    // Los ítems listos pasan a entregados
    await pool.query(`UPDATE pedido_item SET estado = 'entregado' WHERE pedido_id = $1 AND estado = 'listo'`, [id]);
  } else {
    if (req.usuario.rol === 'domiciliario') throw new ErrorApp('Solo la caja asigna domiciliarios', 403);
    await pool.query(
      `UPDATE pedido SET domiciliario_id = $2, despachado_en = now() WHERE id = $1 AND tipo = 'DOMICILIO'`,
      [id, req.body.domiciliario_id]);
  }
  avisar('pedidos', { id });
  res.json(await obtenerPedido(pool, id));
}));

export default r;
