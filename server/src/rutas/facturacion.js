// Facturación electrónica: configuración, clientes con datos fiscales y documentos
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { permite } from '../auth.js';
import { ah, ErrorApp } from '../util.js';
import { avisar } from '../eventos.js';
import {
  CLAVES_FE, crearDocumento, digitoVerificacion, enviarDespues, leerConfig, marcarAnulado
} from '../facturacion/documentos.js';
import { listaProveedores, proveedor } from '../facturacion/proveedores/index.js';

const r = Router();
const admin = permite();
const caja = permite('cajero');
const enmascarar = (t) => (t ? `••••${String(t).slice(-4)}` : '');

// ─── Configuración (solo administrador) ─────────────────────────────────────
r.get('/fe/config', admin, ah(async (_req, res) => {
  const cfg = await leerConfig();
  const config = Object.fromEntries(CLAVES_FE.map((k) => [k, cfg[k] ?? '']));
  config.fe_api_token = enmascarar(cfg.fe_api_token);
  const { rows } = await pool.query(`
    SELECT tipo, prefijo, max(numero) AS ultimo, count(*)::int AS emitidos
      FROM documento_electronico GROUP BY tipo, prefijo`);
  res.json({ config, proveedores: listaProveedores(), numeracion: rows });
}));

r.put('/fe/config', admin, ah(async (req, res) => {
  for (const [clave, valor] of Object.entries(req.body || {})) {
    if (!CLAVES_FE.includes(clave)) continue;
    // El token solo se cambia si se escribe uno nuevo (el guardado se muestra enmascarado)
    if (clave === 'fe_api_token' && (!valor || String(valor).startsWith('••••'))) continue;
    let v = String(valor ?? '').trim();
    if (clave === 'fe_nit') v = v.replace(/[^\d]/g, '');
    await pool.query(
      `INSERT INTO ajuste (clave, valor) VALUES ($1, $2) ON CONFLICT (restaurante_id, clave) DO UPDATE SET valor = $2`, [clave, v]);
  }
  const cfg = await leerConfig();
  if (cfg.fe_nit && !cfg.fe_dv) {
    await pool.query(`INSERT INTO ajuste (clave, valor) VALUES ('fe_dv', $1) ON CONFLICT (restaurante_id, clave) DO UPDATE SET valor = $1`,
      [digitoVerificacion(cfg.fe_nit)]);
  }
  res.json({ ok: true });
}));

r.post('/fe/probar', admin, ah(async (_req, res) => {
  const cfg = await leerConfig();
  try {
    res.json(await proveedor(cfg.fe_proveedor || 'simulador').probar(cfg));
  } catch (e) {
    throw new ErrorApp(`No se pudo conectar con el proveedor: ${e.message}`);
  }
}));

// ─── Clientes con datos para factura ────────────────────────────────────────
r.get('/fe/clientes', caja, ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json([]);
  const { rows } = await pool.query(
    `SELECT * FROM cliente_fiscal WHERE numero LIKE $1 OR nombre ILIKE $2 ORDER BY nombre LIMIT 10`,
    [`${q.replace(/\D/g, '') || q}%`, `%${q}%`]);
  res.json(rows);
}));

// Crea o actualiza (por tipo y número de documento)
r.post('/fe/clientes', caja, ah(async (req, res) => {
  const b = req.body || {};
  const numero = String(b.numero || '').replace(b.tipo_doc === 'PP' ? /\s/g : /[^\dA-Za-z]/g, '');
  const nombre = b.nombre?.trim();
  const email = b.email?.trim().toLowerCase();
  if (!['CC', 'NIT', 'CE', 'PP', 'TI', 'NIT_EXT', 'PEP'].includes(b.tipo_doc)) throw new ErrorApp('Tipo de documento inválido');
  if (!numero) throw new ErrorApp('Escriba el número de documento');
  if (!nombre) throw new ErrorApp('Escriba el nombre o la razón social');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorApp('Escriba un correo válido: allí le llega la factura');
  const dv = b.tipo_doc === 'NIT' ? digitoVerificacion(numero) : null;
  if (b.tipo_doc === 'NIT' && b.dv && String(b.dv) !== dv) throw new ErrorApp(`El dígito de verificación no corresponde al NIT (debería ser ${dv})`);
  const { rows: [c] } = await pool.query(
    `INSERT INTO cliente_fiscal (tipo_doc, numero, dv, tipo_persona, nombre, email, telefono, direccion, ciudad, responsabilidad)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (restaurante_id, tipo_doc, numero) DO UPDATE SET
       dv = EXCLUDED.dv, tipo_persona = EXCLUDED.tipo_persona, nombre = EXCLUDED.nombre, email = EXCLUDED.email,
       telefono = EXCLUDED.telefono, direccion = EXCLUDED.direccion, ciudad = EXCLUDED.ciudad, responsabilidad = EXCLUDED.responsabilidad
     RETURNING *`,
    [b.tipo_doc, numero, dv, b.tipo_persona === 'juridica' ? 'juridica' : 'natural', nombre, email,
     b.telefono?.trim() || null, b.direccion?.trim() || null, b.ciudad?.trim() || null, b.responsabilidad?.trim() || 'R-99-PN']);
  res.json(c);
}));

// ─── Documentos ─────────────────────────────────────────────────────────────
r.get('/fe/documentos', caja, ah(async (req, res) => {
  const { desde, hasta, tipo, estado } = req.query;
  const { rows } = await pool.query(`
    SELECT d.id, d.pedido_id, p.numero AS pedido_numero, d.tipo, d.prefijo, d.numero, d.estado, d.total, d.subtotal,
           d.impuestos, d.cufe, d.qr, d.pdf_url, d.mensaje, d.intentos, d.creado_en, d.aceptado_en, d.ambiente, d.proveedor,
           d.datos->'adquiriente'->>'nombre' AS cliente, d.datos->'adquiriente'->>'numero' AS cliente_doc,
           (d.datos ? 'anulado_por') AS anulado, d.referencia_id,
           (SELECT concat(x.prefijo, x.numero) FROM documento_electronico x WHERE x.id = d.referencia_id) AS referencia
      FROM documento_electronico d JOIN pedido p ON p.id = d.pedido_id
     WHERE d.creado_en::date BETWEEN $1 AND $2
       AND ($3::text IS NULL OR d.tipo = $3) AND ($4::text IS NULL OR d.estado = $4)
     ORDER BY d.id DESC LIMIT 500`,
    [desde, hasta, tipo || null, estado || null]);
  res.json(rows);
}));

r.get('/fe/documentos/:id', caja, ah(async (req, res) => {
  const { rows: [d] } = await pool.query(`SELECT * FROM documento_electronico WHERE id = $1`, [req.params.id]);
  if (!d) throw new ErrorApp('Documento no encontrado', 404);
  res.json(d);
}));

r.post('/fe/documentos/:id/reintentar', caja, ah(async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE documento_electronico SET estado = 'pendiente' WHERE id = $1 AND estado IN ('error', 'pendiente')`, [req.params.id]);
  if (!rowCount) throw new ErrorApp('Solo se reintentan documentos con error o pendientes');
  enviarDespues(Number(req.params.id));
  res.json({ ok: true });
}));

// Emite el documento de un pedido ya cobrado. Si el cliente pide factura y ya tenía
// POS electrónico, el POS se anula con una nota crédito y se emite la factura.
r.post('/pedidos/:id/documento', caja, ah(async (req, res) => {
  const pedidoId = Number(req.params.id);
  const { tipo = 'FACTURA', cliente_fiscal_id } = req.body || {};
  if (!['POS', 'FACTURA'].includes(tipo)) throw new ErrorApp('Tipo de documento inválido');
  const doc = await tx(async (c) => {
    const { rows: [p] } = await c.query(`SELECT estado FROM pedido WHERE id = $1 FOR UPDATE`, [pedidoId]);
    if (!p) throw new ErrorApp('Pedido no encontrado', 404);
    if (p.estado !== 'pagado') throw new ErrorApp('Primero cobre el pedido');
    const { rows: [vigente] } = await c.query(
      `SELECT * FROM documento_electronico WHERE pedido_id = $1 AND tipo IN ('POS', 'FACTURA')
          AND estado <> 'rechazado' AND NOT (datos ? 'anulado_por')`, [pedidoId]);
    if (vigente?.tipo === 'FACTURA') throw new ErrorApp(`Este pedido ya tiene la factura ${vigente.prefijo}${vigente.numero}`);
    if (vigente?.tipo === 'POS' && tipo === 'POS') throw new ErrorApp('Este pedido ya tiene su POS electrónico');
    if (vigente) {
      const nota = await crearDocumento(c, { pedidoId, tipo: 'NOTA_CREDITO', referenciaId: vigente.id, usuarioId: req.usuario.id,
        motivo: 'Se reemplaza por factura electrónica a solicitud del cliente' });
      await marcarAnulado(c, vigente.id, nota.id);
    }
    return crearDocumento(c, { pedidoId, tipo, clienteFiscalId: cliente_fiscal_id || null, usuarioId: req.usuario.id });
  });
  avisar('pedidos', { id: pedidoId });
  res.json(doc);
}));

// Anula un POS o factura aceptada con una nota crédito (solo administrador)
r.post('/fe/documentos/:id/nota-credito', admin, ah(async (req, res) => {
  const motivo = req.body?.motivo?.trim();
  if (!motivo) throw new ErrorApp('Escriba el motivo de la nota crédito');
  const nota = await tx(async (c) => {
    const { rows: [d] } = await c.query(`SELECT * FROM documento_electronico WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!d) throw new ErrorApp('Documento no encontrado', 404);
    if (d.tipo === 'NOTA_CREDITO') throw new ErrorApp('No se hace nota crédito de una nota crédito');
    if (d.datos.anulado_por) throw new ErrorApp('Este documento ya fue anulado con una nota crédito');
    if (d.estado !== 'aceptado') throw new ErrorApp('Solo se anulan documentos aceptados por la DIAN');
    const n = await crearDocumento(c, { pedidoId: d.pedido_id, tipo: 'NOTA_CREDITO', referenciaId: d.id, usuarioId: req.usuario.id, motivo });
    await marcarAnulado(c, d.id, n.id);
    return n;
  });
  res.json(nota);
}));

export default r;
