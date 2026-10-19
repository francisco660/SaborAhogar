// Proveedor "Simulador": se comporta como un proveedor tecnológico real (valida,
// devuelve CUFE/CUDE, QR y estado), pero NO envía nada a la DIAN.
// Sirve para probar todo el flujo del POS mientras se contrata el proveedor.
import crypto from 'node:crypto';

const URL_QR = {
  pruebas: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=',
  produccion: 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='
};

export default {
  id: 'simulador',
  nombre: 'Simulador (pruebas — no envía a la DIAN)',
  necesitaCredenciales: false,

  async probar() {
    return { ok: true, mensaje: 'Simulador listo. Los documentos se marcan como aceptados sin enviarse a la DIAN.' };
  },

  // datos = foto completa del documento (ver construirDatos en documentos.js)
  async enviar(datos, config) {
    await new Promise((r) => setTimeout(r, 300));
    const d = datos.documento;
    const faltan = [];
    if (!datos.emisor.nit) faltan.push('NIT del emisor');
    if (!datos.emisor.razon_social) faltan.push('razón social del emisor');
    if (d.tipo === 'FACTURA' && !datos.adquiriente.email) faltan.push('correo del cliente');
    if (faltan.length) {
      return { estado: 'rechazado', mensaje: `Rechazado (simulado): falta ${faltan.join(', ')}` };
    }
    // CUFE/CUDE: SHA-384 de los datos clave, como lo calcula la DIAN (con una clave técnica de prueba)
    const imp = (t) => (datos.totales.impuestos.find((x) => x.tipo === t)?.valor || 0).toFixed(2);
    const semilla = [
      `${d.prefijo}${d.numero}`, d.fecha, d.hora, datos.totales.subtotal.toFixed(2),
      '01', imp('IVA'), '04', imp('INC'), '03', '0.00', datos.totales.total.toFixed(2),
      datos.emisor.nit, datos.adquiriente.numero, 'CLAVE-TECNICA-SIMULADOR', config.fe_ambiente === 'produccion' ? '1' : '2'
    ].join('');
    const cufe = crypto.createHash('sha384').update(semilla).digest('hex');
    return {
      estado: 'aceptado',
      cufe,
      qr: (URL_QR[config.fe_ambiente] || URL_QR.pruebas) + cufe,
      pdf_url: null,
      xml_url: null,
      mensaje: 'Aceptado (simulado, no enviado a la DIAN)',
      respuesta: { simulado: true, recibido: new Date().toISOString() }
    };
  }
};
