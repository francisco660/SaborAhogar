// Facturación electrónica: creación de documentos (POS electrónico, factura y nota
// crédito), numeración, impuestos y envío en segundo plano al proveedor tecnológico.
// El cobro nunca espera a la DIAN: el documento se guarda "pendiente" en la misma
// transacción de la venta y se envía después; si falla, se reintenta solo.
import { pool, alConfirmar, contexto } from '../db.js';
import { avisarA } from '../eventos.js';
import { ErrorApp } from '../util.js';
import { proveedor } from './proveedores/index.js';

export const TITULOS = {
  POS: 'Documento equivalente electrónico POS',
  FACTURA: 'Factura electrónica de venta',
  NOTA_CREDITO: 'Nota crédito electrónica'
};

// Claves de configuración (ajustes fe_*) que se pueden guardar desde la app
export const CLAVES_FE = [
  'fe_activa', 'fe_proveedor', 'fe_ambiente', 'fe_api_url', 'fe_api_usuario', 'fe_api_token', 'fe_auto_pos',
  'fe_nit', 'fe_dv', 'fe_razon_social', 'fe_tipo_persona', 'fe_regimen', 'fe_responsabilidad', 'fe_email', 'fe_municipio',
  'fe_pos_prefijo', 'fe_pos_resolucion', 'fe_pos_desde', 'fe_pos_hasta', 'fe_pos_fecha_desde', 'fe_pos_fecha_hasta',
  'fe_fac_prefijo', 'fe_fac_resolucion', 'fe_fac_desde', 'fe_fac_hasta', 'fe_fac_fecha_desde', 'fe_fac_fecha_hasta',
  'fe_nc_prefijo'
];

// Dígito de verificación del NIT (algoritmo DIAN)
export function digitoVerificacion(nit) {
  const n = String(nit || '').replace(/\D/g, '');
  if (!n) return '';
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  [...n].reverse().forEach((d, i) => { suma += Number(d) * pesos[i]; });
  const r = suma % 11;
  return String(r > 1 ? 11 - r : r);
}

// Ajustes del restaurante (con restauranteId explícito para procesos en segundo plano)
export async function leerConfig(c = pool, restauranteId = null) {
  const { rows } = restauranteId
    ? await c.query(`SELECT clave, valor FROM ajuste WHERE restaurante_id = $1`, [restauranteId])
    : await c.query(`SELECT clave, valor FROM ajuste`);
  return Object.fromEntries(rows.map((x) => [x.clave, x.valor]));
}

const redondear = (v) => Math.round(v * 100) / 100;
const resolucionDe = (cfg, tipo) => {
  const k = tipo === 'POS' ? 'pos' : 'fac';
  return {
    numero: cfg[`fe_${k}_resolucion`] || '', prefijo: cfg[`fe_${k}_prefijo`] || '',
    desde: Number(cfg[`fe_${k}_desde`]) || 1, hasta: Number(cfg[`fe_${k}_hasta`]) || null,
    fecha_desde: cfg[`fe_${k}_fecha_desde`] || null, fecha_hasta: cfg[`fe_${k}_fecha_hasta`] || null
  };
};

// Siguiente número del documento dentro del rango autorizado
async function siguienteNumero(c, cfg, tipo) {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('fe_numero'), restaurante_actual())`);
  if (tipo === 'NOTA_CREDITO') {
    const prefijo = cfg.fe_nc_prefijo || 'NC';
    const { rows: [x] } = await c.query(
      `SELECT coalesce(max(numero), 0) + 1 AS n FROM documento_electronico WHERE tipo = 'NOTA_CREDITO' AND prefijo = $1`, [prefijo]);
    return { prefijo, numero: x.n, resolucion: null };
  }
  const res = resolucionDe(cfg, tipo);
  const etiqueta = tipo === 'POS' ? 'POS electrónico' : 'factura electrónica';
  if (cfg.fe_ambiente === 'produccion' && !res.numero) throw new ErrorApp(`Falta la resolución de numeración de ${etiqueta}`);
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (res.fecha_hasta && hoy > res.fecha_hasta) throw new ErrorApp(`La resolución de ${etiqueta} venció el ${res.fecha_hasta}`);
  const { rows: [x] } = await c.query(
    `SELECT coalesce(max(numero), $3 - 1) + 1 AS n FROM documento_electronico WHERE tipo = $1 AND prefijo = $2`,
    [tipo, res.prefijo, res.desde]);
  const numero = Math.max(x.n, res.desde);
  if (res.hasta && numero > res.hasta) throw new ErrorApp(`Se agotó el rango de numeración de ${etiqueta} (${res.hasta}). Solicite uno nuevo a la DIAN.`);
  return { prefijo: res.prefijo, numero, resolucion: res };
}

// Arma la foto completa del documento a partir del pedido
async function construirDatos(c, cfg, { pedidoId, tipo, prefijo, numero, resolucion, cliente, referencia, motivo }) {
  const { rows: [p] } = await c.query(`SELECT id, numero, costo_envio FROM pedido WHERE id = $1`, [pedidoId]);
  if (!p) throw new ErrorApp('Pedido no encontrado', 404);
  const { rows: items } = await c.query(`
    SELECT i.producto_id, i.nombre, i.cantidad, i.precio_unit, pr.impuesto_tipo, pr.impuesto_tasa,
           (SELECT coalesce(string_agg(o.nombre, ', ' ORDER BY o.opcion_id), '') FROM pedido_item_opcion o WHERE o.item_id = i.id) AS opciones
      FROM pedido_item i JOIN producto pr ON pr.id = i.producto_id
     WHERE i.pedido_id = $1 AND i.estado <> 'anulado' ORDER BY i.id`, [pedidoId]);
  const { rows: pagos } = await c.query(`SELECT medio, valor FROM pago WHERE pedido_id = $1 ORDER BY id`, [pedidoId]);

  const lineas = items.map((i) => {
    const total = Number(i.cantidad) * Number(i.precio_unit);
    const tasa = i.impuesto_tipo === 'EXCLUIDO' ? 0 : Number(i.impuesto_tasa);
    const base = redondear(total / (1 + tasa / 100));
    return {
      codigo: i.producto_id, descripcion: i.nombre + (i.opciones ? ` (${i.opciones})` : ''),
      cantidad: Number(i.cantidad), precio_unit: Number(i.precio_unit), total, base,
      impuesto: { tipo: i.impuesto_tipo, tasa, valor: redondear(total - base) }
    };
  });
  if (Number(p.costo_envio) > 0) {
    const t = Number(p.costo_envio);
    lineas.push({ codigo: 'DOMICILIO', descripcion: 'Servicio de domicilio', cantidad: 1, precio_unit: t, total: t, base: t,
                  impuesto: { tipo: 'EXCLUIDO', tasa: 0, valor: 0 } });
  }
  const grupos = {};
  for (const l of lineas) {
    if (l.impuesto.tipo === 'EXCLUIDO') continue;
    const k = `${l.impuesto.tipo}-${l.impuesto.tasa}`;
    grupos[k] ||= { tipo: l.impuesto.tipo, tasa: l.impuesto.tasa, base: 0, valor: 0 };
    grupos[k].base = redondear(grupos[k].base + l.base);
    grupos[k].valor = redondear(grupos[k].valor + l.impuesto.valor);
  }
  const total = redondear(lineas.reduce((s, l) => s + l.total, 0));
  const subtotal = redondear(lineas.reduce((s, l) => s + l.base, 0));

  const ahora = new Date();
  const zona = { timeZone: 'America/Bogota' };
  return {
    emisor: {
      nit: cfg.fe_nit || '', dv: cfg.fe_dv || digitoVerificacion(cfg.fe_nit), razon_social: cfg.fe_razon_social || cfg.nombre_negocio || '',
      nombre_comercial: cfg.nombre_negocio || '', tipo_persona: cfg.fe_tipo_persona || 'natural', regimen: cfg.fe_regimen || '',
      responsabilidad: cfg.fe_responsabilidad || 'R-99-PN', email: cfg.fe_email || '', direccion: cfg.direccion || '',
      municipio: cfg.fe_municipio || cfg.ciudad || '', telefono: cfg.telefono || ''
    },
    resolucion,
    documento: {
      tipo, titulo: TITULOS[tipo], prefijo, numero, moneda: 'COP',
      fecha: ahora.toLocaleDateString('en-CA', zona), hora: ahora.toLocaleTimeString('en-GB', zona),
      pedido: p.numero, ambiente: cfg.fe_ambiente || 'pruebas'
    },
    adquiriente: cliente
      ? { tipo_doc: cliente.tipo_doc, numero: cliente.numero, dv: cliente.dv, tipo_persona: cliente.tipo_persona, nombre: cliente.nombre,
          email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion, ciudad: cliente.ciudad,
          responsabilidad: cliente.responsabilidad, consumidor_final: false }
      : { tipo_doc: 'CC', numero: '222222222222', nombre: 'Consumidor final', consumidor_final: true },
    items: lineas,
    totales: { subtotal, impuestos: Object.values(grupos), total },
    pagos: pagos.map((x) => ({ medio: x.medio, valor: Number(x.valor) })),
    ...(referencia ? { referencia, motivo } : {})
  };
}

// Crea un documento "pendiente" dentro de la transacción en curso y programa su envío
export async function crearDocumento(c, { pedidoId, tipo, clienteFiscalId = null, usuarioId = null, referenciaId = null, motivo = null }) {
  const cfg = await leerConfig(c);
  if (cfg.fe_activa !== 'true') throw new ErrorApp('La facturación electrónica no está activada para este restaurante');
  let cliente = null;
  if (clienteFiscalId) {
    ({ rows: [cliente] } = await c.query(`SELECT * FROM cliente_fiscal WHERE id = $1`, [clienteFiscalId]));
    if (!cliente) throw new ErrorApp('Cliente para factura no encontrado');
  }
  if (tipo === 'FACTURA' && !cliente) throw new ErrorApp('La factura electrónica necesita los datos del cliente');

  let referencia = null;
  if (referenciaId) {
    const { rows: [r] } = await c.query(`SELECT * FROM documento_electronico WHERE id = $1`, [referenciaId]);
    if (!r) throw new ErrorApp('Documento a corregir no encontrado');
    referencia = { id: r.id, tipo: r.tipo, prefijo: r.prefijo, numero: r.numero, cufe: r.cufe, fecha: r.datos.documento.fecha };
    if (!cliente && r.cliente_fiscal_id) ({ rows: [cliente] } = await c.query(`SELECT * FROM cliente_fiscal WHERE id = $1`, [r.cliente_fiscal_id]));
  }

  const { prefijo, numero, resolucion } = await siguienteNumero(c, cfg, tipo);
  const datos = await construirDatos(c, cfg, { pedidoId, tipo, prefijo, numero, resolucion, cliente, referencia, motivo });
  if (!(datos.totales.total > 0)) throw new ErrorApp('El pedido no tiene valor para facturar');
  const { rows: [doc] } = await c.query(
    `INSERT INTO documento_electronico (pedido_id, tipo, prefijo, numero, referencia_id, cliente_fiscal_id, motivo,
                                        subtotal, impuestos, total, datos, proveedor, ambiente, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, tipo, prefijo, numero`,
    [pedidoId, tipo, prefijo, numero, referenciaId, cliente?.id || null, motivo, datos.totales.subtotal,
     JSON.stringify(datos.totales.impuestos), datos.totales.total, JSON.stringify(datos),
     cfg.fe_proveedor || 'simulador', cfg.fe_ambiente || 'pruebas', usuarioId]);
  enviarDespues(doc.id);
  return doc;
}

// Marca un POS/factura como anulado por una nota crédito
export async function marcarAnulado(c, documentoId, notaId) {
  await c.query(`UPDATE documento_electronico SET datos = datos || jsonb_build_object('anulado_por', $2::int) WHERE id = $1`,
    [documentoId, notaId]);
}

// Envía el documento cuando la venta ya quedó guardada, sin hacer esperar al cajero
export function enviarDespues(id) {
  alConfirmar(() => setImmediate(() => contexto.exit(() => procesar(id).catch((e) => console.error('Facturación:', e.message)))));
}

// Envía un documento al proveedor (fuera de cualquier petición; usa el dueño de las tablas)
export async function procesar(id) {
  const { rows: [doc] } = await pool.query(
    `UPDATE documento_electronico SET estado = 'enviando', intentos = intentos + 1, enviado_en = now()
      WHERE id = $1 AND (estado IN ('pendiente', 'error') OR (estado = 'enviando' AND enviado_en < now() - interval '5 minutes'))
      RETURNING *`, [id]);
  if (!doc) return;
  let r;
  // Se usa el proveedor configurado ahora (si se corrigió la configuración, el reintento ya la toma)
  const cfg = await leerConfig(pool, doc.restaurante_id);
  const prov = cfg.fe_proveedor || doc.proveedor;
  try {
    r = await proveedor(prov).enviar(doc.datos, cfg);
  } catch (e) {
    r = { estado: 'error', mensaje: e.message };
  }
  await pool.query(
    `UPDATE documento_electronico SET estado = $2, cufe = coalesce($3, cufe), qr = coalesce($4, qr), pdf_url = coalesce($5, pdf_url),
            xml_url = coalesce($6, xml_url), mensaje = $7, respuesta = $8, proveedor = $9,
            aceptado_en = CASE WHEN $2 = 'aceptado' THEN now() ELSE aceptado_en END
      WHERE id = $1`,
    [id, r.estado, r.cufe || null, r.qr || null, r.pdf_url || null, r.xml_url || null, r.mensaje || null,
     r.respuesta ? JSON.stringify(r.respuesta) : null, prov]);
  avisarA(doc.restaurante_id, 'facturacion', { id, pedido_id: doc.pedido_id, estado: r.estado });
}

// Reintenta en segundo plano lo pendiente o fallido (espera creciente entre intentos)
export function iniciarReintentos() {
  const ciclo = async () => {
    try {
      const { rows } = await pool.query(`
        SELECT id FROM documento_electronico
         WHERE (estado = 'pendiente' AND creado_en < now() - interval '30 seconds')
            OR (estado = 'error' AND intentos < 10 AND enviado_en < now() - interval '1 minute' * power(2, least(intentos, 6)))
            OR (estado = 'enviando' AND enviado_en < now() - interval '5 minutes')
         ORDER BY id LIMIT 25`);
      for (const { id } of rows) await procesar(id).catch((e) => console.error('Facturación:', e.message));
    } catch (e) {
      if (!/documento_electronico/.test(e.message)) console.error('Reintentos de facturación:', e.message);
    }
  };
  setInterval(ciclo, 60000).unref();
  setTimeout(ciclo, 5000).unref();
}
