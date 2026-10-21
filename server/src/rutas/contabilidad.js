// Informe contable/tributario del periodo para entregar al contador
// (declaración de renta, IVA/INC, exógena). Solo administrador.
import { Router } from 'express';
import { pool } from '../db.js';
import { permite } from '../auth.js';
import { ah, ErrorApp } from '../util.js';

const r = Router();
const admin = permite();
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n(v) * 100) / 100;

// Base e impuesto de cada línea vendida (precios con impuesto incluido)
const SQL_LINEAS = `
  SELECT i.pedido_id, i.cantidad * i.precio_unit AS total,
         CASE WHEN pr.impuesto_tipo = 'EXCLUIDO' THEN 0 ELSE pr.impuesto_tasa END AS tasa,
         pr.impuesto_tipo AS tipo, i.cantidad * coalesce(i.costo_unit, 0) AS costo
    FROM pedido_item i
    JOIN pedido p ON p.id = i.pedido_id
    JOIN producto pr ON pr.id = i.producto_id
   WHERE i.estado <> 'anulado' AND p.estado = 'pagado'
     AND (p.cerrado_en AT TIME ZONE 'America/Bogota')::date BETWEEN $1 AND $2`;

r.get('/contabilidad/informe', admin, ah(async (req, res) => {
  const { desde, hasta } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) throw new ErrorApp('Rango de fechas inválido');
  const p = [desde, hasta];

  const [dias, ventas, impuestos, medios, gastos, compras, documentos, inventario, ajustes] = await Promise.all([
    pool.query(`SELECT * FROM reporte_utilidad($1, $2)`, p),
    // Detalle de cada venta cobrada
    pool.query(`
      WITH l AS (${SQL_LINEAS})
      SELECT p.id, p.numero, p.tipo, to_char(p.cerrado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') AS fecha,
             m.nombre AS mesa, coalesce(cl.nombre, p.nombre_cliente) AS cliente, p.costo_envio,
             total_pedido(p.id) AS total,
             coalesce((SELECT sum(l.total - l.total / (1 + l.tasa / 100)) FROM l WHERE l.pedido_id = p.id AND l.tipo = 'INC'), 0) AS inc,
             coalesce((SELECT sum(l.total - l.total / (1 + l.tasa / 100)) FROM l WHERE l.pedido_id = p.id AND l.tipo = 'IVA'), 0) AS iva,
             coalesce((SELECT sum(l.costo) FROM l WHERE l.pedido_id = p.id), 0) AS costo,
             (SELECT string_agg(pg.medio || ' ' || pg.valor::bigint, ' + ' ORDER BY pg.id) FROM pago pg WHERE pg.pedido_id = p.id) AS medios,
             (SELECT d.tipo || ' ' || d.prefijo || d.numero FROM documento_electronico d
               WHERE d.pedido_id = p.id AND d.tipo IN ('POS', 'FACTURA') AND d.estado = 'aceptado' AND NOT (d.datos ? 'anulado_por')
               ORDER BY d.id DESC LIMIT 1) AS documento
        FROM pedido p
        LEFT JOIN mesa m ON m.id = p.mesa_id
        LEFT JOIN cliente cl ON cl.id = p.cliente_id
       WHERE p.estado = 'pagado' AND (p.cerrado_en AT TIME ZONE 'America/Bogota')::date BETWEEN $1 AND $2
       ORDER BY p.cerrado_en`, p),
    // Impuestos por tarifa
    pool.query(`
      WITH l AS (${SQL_LINEAS})
      SELECT coalesce(nullif(tipo, 'EXCLUIDO'), 'EXCLUIDO') AS tipo, tasa,
             sum(total) AS total, sum(total / (1 + tasa / 100)) AS base, sum(total - total / (1 + tasa / 100)) AS impuesto
        FROM l GROUP BY 1, 2 ORDER BY 1, 2`, p),
    pool.query(`
      SELECT pg.medio, count(DISTINCT pg.pedido_id)::int AS pedidos, sum(pg.valor) AS valor
        FROM pago pg JOIN pedido p ON p.id = pg.pedido_id
       WHERE p.estado = 'pagado' AND (p.cerrado_en AT TIME ZONE 'America/Bogota')::date BETWEEN $1 AND $2
       GROUP BY pg.medio ORDER BY valor DESC`, p),
    // Todos los gastos (incluidos los anulados, marcados)
    pool.query(`
      SELECT to_char(g.fecha, 'YYYY-MM-DD') AS fecha, g.categoria, pr.nombre AS proveedor, pr.nit, e.nombre AS empleado,
             g.descripcion, g.valor, g.medio_pago, g.pagado_de_caja, g.anulado, g.motivo_anulacion
        FROM gasto g
        LEFT JOIN proveedor pr ON pr.id = g.proveedor_id
        LEFT JOIN empleado e ON e.id = g.empleado_id
       WHERE g.fecha BETWEEN $1 AND $2 ORDER BY g.fecha, g.id`, p),
    // Detalle de compras de insumos
    pool.query(`
      SELECT to_char(g.fecha, 'YYYY-MM-DD') AS fecha, pr.nombre AS proveedor, pr.nit, i.nombre AS insumo, gi.cantidad, i.unidad,
             gi.costo_total, g.medio_pago, g.anulado
        FROM gasto_item gi JOIN gasto g ON g.id = gi.gasto_id
        JOIN insumo i ON i.id = gi.insumo_id
        LEFT JOIN proveedor pr ON pr.id = g.proveedor_id
       WHERE g.fecha BETWEEN $1 AND $2 ORDER BY g.fecha, g.id`, p),
    // Documentos electrónicos emitidos
    pool.query(`
      SELECT to_char(d.creado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') AS fecha, d.tipo, d.prefijo || d.numero AS numero,
             d.datos->'adquiriente'->>'nombre' AS cliente, d.datos->'adquiriente'->>'numero' AS documento_cliente,
             d.subtotal, d.total - d.subtotal AS impuestos, d.total, d.estado, (d.datos ? 'anulado_por') AS anulado, d.cufe, d.ambiente
        FROM documento_electronico d
       WHERE (d.creado_en AT TIME ZONE 'America/Bogota')::date BETWEEN $1 AND $2 ORDER BY d.id`, p),
    pool.query(`SELECT coalesce(sum(valor), 0) AS valor FROM v_stock WHERE activo`),
    pool.query(`SELECT clave, valor FROM ajuste WHERE clave IN ('nombre_negocio', 'fe_razon_social', 'fe_nit', 'fe_dv', 'direccion', 'ciudad', 'telefono')`)
  ]);

  // ─── Resumen del periodo ───
  const sum = (rows, k) => rows.reduce((s, x) => s + n(x[k]), 0);
  const ingresosBrutos = sum(ventas.rows, 'total');
  const totalInc = sum(ventas.rows, 'inc');
  const totalIva = sum(ventas.rows, 'iva');
  const costoVentas = sum(dias.rows, 'costo_ventas');
  const mermas = sum(dias.rows, 'mermas');
  const gastosValidos = gastos.rows.filter((g) => !g.anulado);
  const gastosOperativos = gastosValidos.filter((g) => g.categoria !== 'COMPRA_INSUMOS');
  const ingresosNetos = ingresosBrutos - totalInc - totalIva;
  const totalGastos = sum(gastosOperativos, 'valor');

  const porCategoria = Object.values(gastosValidos.reduce((acc, g) => {
    acc[g.categoria] ||= { categoria: g.categoria, cantidad: 0, valor: 0 };
    acc[g.categoria].cantidad++;
    acc[g.categoria].valor += n(g.valor);
    return acc;
  }, {})).sort((a, b) => b.valor - a.valor);

  const porProveedor = Object.values(gastosValidos.filter((g) => g.proveedor).reduce((acc, g) => {
    const k = `${g.proveedor}|${g.nit || ''}`;
    acc[k] ||= { proveedor: g.proveedor, nit: g.nit, compras: 0, valor: 0 };
    acc[k].compras++;
    acc[k].valor += n(g.valor);
    return acc;
  }, {})).sort((a, b) => b.valor - a.valor);

  const nomina = Object.values(gastosValidos.filter((g) => g.categoria === 'NOMINA').reduce((acc, g) => {
    const k = g.empleado || 'Sin empleado asignado';
    acc[k] ||= { empleado: k, pagos: 0, valor: 0 };
    acc[k].pagos++;
    acc[k].valor += n(g.valor);
    return acc;
  }, {})).sort((a, b) => b.valor - a.valor);

  // ─── Mes a mes ───
  const meses = {};
  const mes = (f) => (meses[f.slice(0, 7)] ||= { mes: f.slice(0, 7), pedidos: 0, ingresos_brutos: 0, inc: 0, iva: 0, costo_ventas: 0, mermas: 0, gastos: 0, compras: 0 });
  for (const d of dias.rows) {
    const m = mes(typeof d.fecha === 'string' ? d.fecha : d.fecha.toISOString().slice(0, 10));
    m.costo_ventas += n(d.costo_ventas);
    m.mermas += n(d.mermas);
  }
  for (const v of ventas.rows) { const m = mes(v.fecha); m.pedidos++; m.ingresos_brutos += n(v.total); m.inc += n(v.inc); m.iva += n(v.iva); }
  for (const g of gastosValidos) { const m = mes(g.fecha); if (g.categoria === 'COMPRA_INSUMOS') m.compras += n(g.valor); else m.gastos += n(g.valor); }
  const mensual = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => {
    const netos = m.ingresos_brutos - m.inc - m.iva;
    return { ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])),
             ingresos_netos: r2(netos), utilidad: r2(netos - m.costo_ventas - m.mermas - m.gastos) };
  });

  const docs = documentos.rows;
  const docsVigentes = docs.filter((d) => d.estado === 'aceptado' && !d.anulado && d.tipo !== 'NOTA_CREDITO');
  res.json({
    desde, hasta,
    empresa: Object.fromEntries(ajustes.rows.map((x) => [x.clave, x.valor])),
    resumen: {
      pedidos: ventas.rows.length,
      ingresos_brutos: r2(ingresosBrutos),
      inc: r2(totalInc),
      iva: r2(totalIva),
      ingresos_netos: r2(ingresosNetos),
      costo_ventas: r2(costoVentas),
      utilidad_bruta: r2(ingresosNetos - costoVentas),
      mermas: r2(mermas),
      gastos_operativos: r2(totalGastos),
      utilidad_antes_impuestos: r2(ingresosNetos - costoVentas - mermas - totalGastos),
      compras_insumos: r2(sum(gastosValidos.filter((g) => g.categoria === 'COMPRA_INSUMOS'), 'valor')),
      nomina: r2(sum(nomina, 'valor')),
      inventario_actual: r2(inventario.rows[0].valor),
      ticket_promedio: ventas.rows.length ? r2(ingresosBrutos / ventas.rows.length) : 0,
      documentos_vigentes: docsVigentes.length,
      facturado_electronicamente: r2(sum(docsVigentes, 'total'))
    },
    mensual,
    impuestos: impuestos.rows.map((x) => ({ tipo: x.tipo, tasa: n(x.tasa), total: r2(x.total), base: r2(x.base), impuesto: r2(x.impuesto) })),
    medios: medios.rows,
    gastos_por_categoria: porCategoria,
    proveedores: porProveedor,
    nomina,
    ventas: ventas.rows.map((v) => ({ ...v, total: n(v.total), inc: r2(v.inc), iva: r2(v.iva), costo: r2(v.costo),
                                      base: r2(n(v.total) - n(v.inc) - n(v.iva)) })),
    gastos: gastos.rows,
    compras: compras.rows,
    documentos: docs
  });
}));

export default r;
