// ============================================================================
//  PLANTILLA PARA CONECTAR EL PROVEEDOR TECNOLÓGICO REAL
//
//  1. Copie este archivo con el nombre del proveedor (ej. plemsi.js) y cambie `id` y `nombre`.
//  2. Complete `autenticar`, `aFormatoProveedor` y `enviar` según la documentación de su API.
//  3. Regístrelo en proveedores/index.js.
//  4. En la app: Facturas → Configuración → elija el proveedor, ponga URL y credenciales,
//     use "Probar conexión" y emita documentos en ambiente de PRUEBAS antes de producción.
//
//  `datos` trae todo lo necesario (ver construirDatos en documentos.js):
//    datos.emisor        { nit, dv, razon_social, tipo_persona, regimen, responsabilidad, email, direccion, municipio, telefono }
//    datos.resolucion    { numero, prefijo, desde, hasta, fecha_desde, fecha_hasta }
//    datos.documento     { tipo: 'POS'|'FACTURA'|'NOTA_CREDITO', prefijo, numero, fecha 'YYYY-MM-DD', hora 'HH:MM:SS', moneda 'COP' }
//    datos.adquiriente   { tipo_doc, numero, dv, tipo_persona, nombre, email, telefono, direccion, ciudad, responsabilidad, consumidor_final }
//    datos.items[]       { codigo, descripcion, cantidad, precio_unit, total, base, impuesto: { tipo, tasa, valor } }
//    datos.totales       { subtotal, impuestos: [{ tipo, tasa, base, valor }], total }
//    datos.pagos[]       { medio, valor }
//    datos.referencia    (solo nota crédito) { tipo, prefijo, numero, cufe, fecha }
//    datos.motivo        (solo nota crédito)
//
//  `enviar` debe devolver:
//    { estado: 'aceptado' | 'rechazado', cufe, qr, pdf_url, xml_url, mensaje, respuesta }
//  Si el proveedor no responde (red caída, 5xx), lance un Error: el documento queda
//  en "error" y el sistema lo reintenta solo.
// ============================================================================

// Códigos habituales de la DIAN (anexo técnico) para mapear los datos
export const DIAN = {
  tipoDocumento: { CC: '13', NIT: '31', CE: '22', PP: '41', TI: '12', NIT_EXT: '42', PEP: '47' },
  impuesto: { IVA: '01', INC: '04' },
  medioPago: { EFECTIVO: '10', TARJETA: '48', TRANSFERENCIA: '42', NEQUI: '42', DAVIPLATA: '42' }
};

export default {
  id: 'plantilla',
  nombre: 'Proveedor real (plantilla, sin completar)',
  necesitaCredenciales: true,

  async probar(config) {
    await autenticar(config);
    return { ok: true, mensaje: 'Conexión correcta con el proveedor' };
  },

  async enviar(datos, config) {
    const token = await autenticar(config);
    const r = await fetch(`${config.fe_api_url}/RUTA-DEL-PROVEEDOR`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(aFormatoProveedor(datos, config))
    });
    const j = await r.json().catch(() => ({}));
    if (r.status >= 500) throw new Error(`El proveedor no respondió (${r.status})`);
    if (!r.ok) return { estado: 'rechazado', mensaje: j.message || `Rechazado (${r.status})`, respuesta: j };
    return {
      estado: 'aceptado',             // o según el estado que devuelva la DIAN a través del proveedor
      cufe: j.cufe,                   // ajustar a los nombres reales de la respuesta
      qr: j.qr,
      pdf_url: j.pdf_url,
      xml_url: j.xml_url,
      mensaje: j.message,
      respuesta: j
    };
  }
};

async function autenticar(config) {
  if (!config.fe_api_url || !config.fe_api_token) throw new Error('Falta la URL o el token del proveedor');
  // Muchos proveedores usan un token fijo; otros piden login (OAuth). Ajustar aquí.
  return config.fe_api_token;
}

function aFormatoProveedor(datos) {
  // Convertir `datos` al JSON que pide el proveedor. Ejemplo orientativo:
  return {
    type: datos.documento.tipo,
    prefix: datos.documento.prefijo,
    number: datos.documento.numero,
    customer: {
      identification_type: DIAN.tipoDocumento[datos.adquiriente.tipo_doc],
      identification: datos.adquiriente.numero,
      dv: datos.adquiriente.dv,
      name: datos.adquiriente.nombre,
      email: datos.adquiriente.email
    },
    items: datos.items.map((i) => ({
      code: String(i.codigo),
      description: i.descripcion,
      quantity: i.cantidad,
      price: i.precio_unit,
      tax: i.impuesto.tipo === 'EXCLUIDO' ? null : { code: DIAN.impuesto[i.impuesto.tipo], rate: i.impuesto.tasa }
    })),
    payment_method: DIAN.medioPago[datos.pagos[0]?.medio] || '10',
    reference: datos.referencia,
    reason: datos.motivo
  };
}
