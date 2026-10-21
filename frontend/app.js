'use strict';
// POS "Con Sabor a Hogar" — aplicación web sin compilación

// ═══ Utilidades ══════════════════════════════════════════════════════════════
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FMT = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos = (v) => FMT.format(Math.round(Number(v) || 0));
const num = (v) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(v) || 0);
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : '—');
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hora = (d) => (d ? new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '');
const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }) : '');
const minutos = (d) => Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000));
const UNIDAD = { g: 'g', ml: 'ml', und: 'und' };
const ROL = { admin: 'Administrador', cajero: 'Caja', mesero: 'Mesero', cocina: 'Cocina', domiciliario: 'Domiciliario' };
const ESTADO_ITEM = { pendiente: 'Sin enviar', en_cocina: 'En cocina', preparando: 'En preparación', listo: 'Listo', entregado: 'Entregado', anulado: 'Anulado' };
const TIPO = { MESA: 'Mesa', LLEVAR: 'Para llevar', DOMICILIO: 'Domicilio' };
const MEDIOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TARJETA', 'TRANSFERENCIA'];
const MEDIO = { EFECTIVO: 'Efectivo', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CREDITO: 'Crédito' };
const CATEGORIAS_GASTO = {
  COMPRA_INSUMOS: 'Compra de insumos', ARRIENDO: 'Arriendo', SERVICIOS: 'Servicios públicos', NOMINA: 'Nómina',
  GAS: 'Gas', MANTENIMIENTO: 'Mantenimiento', DOMICILIOS: 'Domicilios', OTROS: 'Otros'
};
const TIPO_MOV = {
  INICIAL: 'Inventario inicial', COMPRA: 'Compra', REVERSO_COMPRA: 'Compra anulada', CONSUMO_VENTA: 'Venta',
  REVERSO_VENTA: 'Venta anulada', MERMA: 'Merma', AJUSTE_CONTEO: 'Ajuste por conteo'
};

const almacen = {
  leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  borrar(k) { try { localStorage.removeItem(k); } catch { /* nada */ } }
};

// ─── Apariencia (tema por restaurante) ──────────────────────────────────────
// Se guarda en los ajustes del restaurante (tema_*) y se recuerda en el equipo
// para pintar el login con los colores del último restaurante usado.
const TEMAS = {
  hogar:    { nombre: 'Hogar',     primario: '#ff5a36', acento: '#ffbe3d', barra: '#1e1716', barra2: '#43312e', icono: '' },
  brasa:    { nombre: 'Brasa',     primario: '#c62828', acento: '#ff9800', barra: '#120d0b', barra2: '#3b2418', icono: '🔥' },
  campo:    { nombre: 'Campestre', primario: '#2e7d32', acento: '#c9a227', barra: '#16231a', barra2: '#33503a', icono: '🌿' },
  mar:      { nombre: 'Mar',       primario: '#0277bd', acento: '#26c6da', barra: '#0b1726', barra2: '#1b3a5c', icono: '🐟' },
  elegante: { nombre: 'Elegante',  primario: '#8e2442', acento: '#d4af37', barra: '#121212', barra2: '#2d2a26', icono: '' },
  cafe:     { nombre: 'Café',      primario: '#8d5524', acento: '#e0a458', barra: '#1c130d', barra2: '#4a3324', icono: '☕' }
};
const temaDe = (aj = {}) => ({
  primario: aj.tema_primario || TEMAS.hogar.primario,
  acento: aj.tema_acento || TEMAS.hogar.acento,
  barra: aj.tema_barra || TEMAS.hogar.barra,
  barra2: aj.tema_barra2 || TEMAS.hogar.barra2,
  icono: aj.tema_icono ?? ''
});
function aplicarTema(t) {
  const r = document.documentElement.style;
  const mezcla = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  r.setProperty('--rojo', t.primario);
  r.setProperty('--rojo-osc', mezcla(t.primario, 'black', 85));
  r.setProperty('--rojo-suave', mezcla(t.primario, 'white', 25));
  r.setProperty('--naranja', mezcla(t.primario, t.acento, 50));
  r.setProperty('--naranja-claro', mezcla(t.primario, 'white', 12));
  r.setProperty('--amarillo', t.acento);
  r.setProperty('--amarillo-claro', mezcla(t.acento, 'white', 30));
  r.setProperty('--cafe', t.barra);
  r.setProperty('--cafe-medio', t.barra2);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.barra);
}
aplicarTema(almacen.leer('pos_tema') || temaDe());

// ─── Menú lateral ───────────────────────────────────────────────────────────
const cerrarLateral = () => document.body.classList.remove('lateral-abierto');
if (almacen.leer('pos_lateral_mini')) document.body.classList.add('lateral-mini');
$('#abrir-menu').addEventListener('click', () => document.body.classList.add('lateral-abierto'));
$('#lateral-fondo').addEventListener('click', cerrarLateral);
$('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) cerrarLateral(); });
$('#plegar').addEventListener('click', () => {
  const mini = document.body.classList.toggle('lateral-mini');
  $('#plegar').textContent = mini ? '»' : '«';
  almacen.guardar('pos_lateral_mini', mini);
});
if (document.body.classList.contains('lateral-mini')) $('#plegar').textContent = '»';

// Estado global
const usuarioGuardado = almacen.leer('pos_usuario');
const S = {
  usuario: usuarioGuardado && usuarioGuardado.token ? usuarioGuardado : null,
  menu: null,
  ajustes: {},
  acc: {},          // acciones de la vista actual (data-acc)
  vista: null,
  carrito: [],
  carritoClave: null,
  nuevo: {},        // datos de un pedido nuevo
  inv: { tab: 'stock' },
  cocinaVistos: new Set(),
  avisoListo: new Set()
};

async function api(ruta, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.usuario) headers.Authorization = 'Bearer ' + S.usuario.token;
  const r = await fetch('/api' + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (r.status === 401 && S.usuario) { salir(); throw new Error('La sesión expiró. Ingrese de nuevo.'); }
  if (!r.ok) {
    const e = new Error(j?.error || `Error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

function toast(msg, tipo = '', ms) {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms || (tipo === 'error' ? 5000 : 2600));
}

async function ejecutar(fn, boton) {
  try {
    if (boton) boton.disabled = true;
    await fn();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (boton?.isConnected) boton.disabled = false;
  }
}

const tiene = (...roles) => S.usuario && (S.usuario.rol === 'admin' || roles.includes(S.usuario.rol));

// ─── Modal ───────────────────────────────────────────────────────────────────
function abrirModal(html, acciones = {}, { ancho = false, alCerrar = null } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(fondo);
  const m = fondo.firstElementChild;
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    fondo.remove();
    document.removeEventListener('keydown', esc_);
    alCerrar?.();
  };
  const esc_ = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', esc_);
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    if (b.dataset.acc === 'cerrar') return cerrar();
    const fn = acciones[b.dataset.acc];
    if (fn) ejecutar(() => fn(b, m, cerrar), b);
  });
  m.addEventListener('submit', (e) => {
    e.preventDefault();
    if (acciones.submit) ejecutar(() => acciones.submit(e.target, m, cerrar), e.submitter);
  });
  if (acciones.input) m.addEventListener('input', (e) => acciones.input(e, m));
  if (acciones.change) m.addEventListener('change', (e) => acciones.change(e, m));
  setTimeout(() => m.querySelector('[autofocus]')?.focus(), 30);
  return { m, cerrar };
}

const cabeceraModal = (titulo) =>
  `<h3><span>${titulo}</span><button type="button" class="peq icono" data-acc="cerrar" aria-label="Cerrar">✕</button></h3>`;

// Confirmación dentro de la página (sin confirm() del navegador)
function confirmar(mensaje, { boton = 'Confirmar', peligro = false, campo = null } = {}) {
  return new Promise((resolve) => {
    let respuesta = null;
    abrirModal(`
      ${cabeceraModal('Confirmar')}
      <form>
        <p>${mensaje}</p>
        ${campo ? `<div class="campo"><label>${esc(campo)}</label><input name="valor" required autofocus></div>` : ''}
        <div class="pie">
          <button type="button" data-acc="cerrar">Cancelar</button>
          <button class="${peligro ? 'primario' : 'exito'}" ${campo ? '' : 'autofocus'}>${esc(boton)}</button>
        </div>
      </form>`, {
      submit: (f, _m, cerrar) => { respuesta = campo ? f.valor.value.trim() : true; cerrar(); }
    }, { alCerrar: () => resolve(respuesta) });
  });
}

// ─── Impresión de tickets (impresora térmica de 80 o 58 mm) ──────────────────
// Los tamaños van en "em" para que en papel de 58 mm todo se reduzca en proporción.
const cssTicket = (ancho) => `
  @page { size: ${ancho}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  html { background: #fff; }
  body { font: ${ancho <= 58 ? 12 : 14}px/1.35 Arial, Helvetica, sans-serif; width: ${ancho - 6}mm; margin: 0 auto; padding: 2mm 0; color: #000;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 1.5em; text-align: center; margin: 0 0 .15em; line-height: 1.1; }
  p { margin: .2em 0; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .g { font-size: 1.15em; font-weight: 600; } .o { padding-left: .9em; font-size: .9em; }
  .chico { font-size: .86em; } .b { font-weight: 600; }
  hr { border: 0; border-top: 1px dashed #000; margin: .45em 0; }
  hr.doble { border-top: 3px double #000; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; padding: .12em 0; }
  th { font-size: .82em; text-align: left; border-bottom: 1px solid #000; padding-bottom: .2em; }
  .titulo { text-align: center; font-size: 1.2em; font-weight: 700; letter-spacing: .1em; margin: .3em 0; }
  .sub { text-align: center; font-size: .82em; margin-top: -.2em; }
  .invertido { background: #000; color: #fff; text-align: center; font-weight: 700; padding: .25em .3em; font-size: 1.6em; border-radius: 4px; margin: .25em 0; }
  .datos td { font-size: .95em; } .datos td:first-child { width: 36%; font-weight: 600; }
  .linea td { padding: .25em 0; border-bottom: 1px dotted #999; }
  .linea .cant { width: 2.2em; font-weight: 600; }
  .total td { font-size: 1.45em; font-weight: 700; padding-top: .2em; }
  .item-cmd { border-bottom: 1px dashed #000; padding: .35em 0; }
  .item-cmd .n { font-size: 1.4em; font-weight: 700; line-height: 1.15; }
  .item-cmd .op { font-size: 1.08em; padding-left: 1em; }
  .item-cmd .ya { font-size: .85em; font-style: italic; }
  .nota-cmd { border: 2px solid #000; padding: .2em .4em; margin-top: .25em; font-size: 1.1em; font-weight: 600; }
  .aviso { border: 1px solid #000; padding: .3em .4em; font-size: .82em; margin: .35em 0; }
  .pie { text-align: center; font-size: .82em; margin-top: .5em; }
  .cufe { font-size: .68em; word-break: break-all; }
`;
const paginaTicket = (html, ancho) => `<!doctype html><html><head><meta charset="utf-8"><style>${cssTicket(ancho)}</style></head><body>${html}</body></html>`;

// Muestra la vista previa del ticket y permite imprimirlo
function imprimir(html, titulo = 'Vista previa') {
  const ancho = Number(S.ajustes?.ancho_ticket) || 80;
  const { m } = abrirModal(`
    ${cabeceraModal(titulo)}
    <div class="ticket-previa"><iframe title="Ticket" style="width:calc(${ancho}mm + 4mm)"></iframe></div>
    <div class="pie"><button type="button" data-acc="cerrar">Cerrar</button><button class="primario" data-acc="imprimirYa" autofocus>🖨️ Imprimir</button></div>`, {
    imprimirYa: () => { const w = $('iframe', m).contentWindow; w.focus(); w.print(); }
  });
  const f = $('iframe', m);
  f.onload = () => { f.style.height = `${f.contentDocument.documentElement.scrollHeight + 8}px`; };
  f.srcdoc = paginaTicket(html, ancho);
}

// Encabezado con los datos del negocio (y los fiscales, si están configurados)
function encabezadoNegocio() {
  const a = S.ajustes || {};
  const nombre = a.nombre_negocio || S.usuario?.restaurante || '';
  const icono = temaDe(a).icono;
  const lineas = [
    a.fe_razon_social && a.fe_razon_social !== nombre ? esc(a.fe_razon_social) : '',
    a.fe_nit ? `NIT ${esc(a.fe_nit)}${a.fe_dv ? `-${esc(a.fe_dv)}` : ''}` : '',
    a.fe_regimen ? esc(a.fe_regimen) : '',
    [a.direccion, a.ciudad].filter(Boolean).map(esc).join(' · '),
    a.telefono ? `Tel. ${esc(a.telefono)}` : ''
  ].filter(Boolean);
  return `<h1>${icono ? `${esc(icono)} ` : ''}${esc(nombre)}</h1>${lineas.length ? `<p class="c chico">${lineas.join('<br>')}</p>` : ''}`;
}

const filaDato = (k, v) => (v ? `<tr><td>${k}</td><td>${v}</td></tr>` : '');

function ticketPedido(p, tipo = 'cuenta') {
  const a = S.ajustes || {};
  const items = p.items.filter((i) => i.estado !== 'anulado');
  const destino = p.tipo === 'MESA' ? p.mesa : TIPO[p.tipo];
  const cliente = p.cliente || p.nombre_cliente;
  const unidades = items.reduce((s, i) => s + i.cantidad, 0);
  const impreso = `Impreso: ${fechaHora(new Date())} · ${esc(S.usuario?.nombre || '')}`;

  if (tipo === 'comanda') {
    const enviado = items.map((i) => i.enviado_en).filter(Boolean).sort()[0];
    return `
      <div class="titulo">COMANDA</div>
      <div class="invertido">${esc(String(destino).toUpperCase())}</div>
      ${p.tipo !== 'MESA' && cliente ? `<p class="c g">${esc(cliente)}</p>` : ''}
      <table class="datos">
        ${filaDato('Pedido', `<b>#${p.numero}</b>`)}
        ${filaDato('Tomado', `${hora(p.creado_en)} · ${fechaHora(p.creado_en).split(',')[0]}`)}
        ${filaDato('A cocina', enviado ? hora(enviado) : 'Sin enviar')}
        ${filaDato('Mesero', esc(p.mesero || ''))}
      </table>
      <hr class="doble">
      ${items.map((i) => `<div class="item-cmd">
        <div class="n">${i.cantidad} × ${esc(i.nombre)}</div>
        ${i.opciones.map((o) => `<div class="op">• ${esc(o)}</div>`).join('')}
        ${i.nota ? `<div class="nota-cmd">⚠ ${esc(i.nota)}</div>` : ''}
        ${i.estado === 'entregado' ? '<div class="ya">(ya entregado)</div>' : ''}
      </div>`).join('')}
      <p class="c g" style="margin-top:.4em">${unidades} producto${unidades === 1 ? '' : 's'}</p>
      ${p.nota ? `<div class="nota-cmd">NOTA DEL PEDIDO: ${esc(p.nota)}</div>` : ''}
      ${p.tipo === 'DOMICILIO' ? `<p class="chico"><b>Domicilio:</b> ${esc(p.direccion_entrega || '')} ${esc(p.barrio || '')}${p.telefono ? ` · Tel. ${esc(p.telefono)}` : ''}</p>` : ''}
      <p class="pie">${impreso}</p>`;
  }

  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio_unit, 0);
  const impuestos = {};
  items.forEach((i) => {
    if (!i.impuesto_tipo || i.impuesto_tipo === 'EXCLUIDO' || !Number(i.impuesto_tasa)) return;
    const t = i.cantidad * i.precio_unit;
    const k = `${i.impuesto_tipo === 'INC' ? 'Impuesto al consumo' : 'IVA'} ${Number(i.impuesto_tasa)}%`;
    impuestos[k] = (impuestos[k] || 0) + (t - t / (1 + Number(i.impuesto_tasa) / 100));
  });
  const pagado = p.estado === 'pagado';
  const pagos = p.pagos.reduce((s, x) => s + Number(x.valor), 0);
  const propina = Number(a.propina_sugerida) || 0;
  const doc = typeof documentoVigente === 'function' ? documentoVigente(p) : null;
  const titulo = p.estado === 'anulado' ? 'PEDIDO ANULADO' : pagado ? 'RECIBO DE PAGO' : 'CUENTA';

  return `
    ${encabezadoNegocio()}
    <hr>
    <div class="titulo">${titulo}</div>
    ${!pagado && p.estado !== 'anulado' ? '<div class="sub">Pre-cuenta · no es factura de venta</div>' : ''}
    <table class="datos" style="margin-top:.3em">
      ${filaDato('Pedido', `<b>#${p.numero}</b>`)}
      ${filaDato(p.tipo === 'MESA' ? 'Mesa' : 'Tipo', `<b>${esc(destino)}</b>`)}
      ${filaDato('Fecha', fechaHora(p.creado_en))}
      ${pagado ? filaDato('Pagado', fechaHora(p.cerrado_en)) : ''}
      ${filaDato('Atendió', esc(p.mesero || ''))}
      ${filaDato('Cliente', esc(cliente || ''))}
      ${filaDato('Teléfono', esc(p.telefono || ''))}
      ${filaDato('Dirección', p.direccion_entrega ? `${esc(p.direccion_entrega)}${p.barrio ? `, ${esc(p.barrio)}` : ''}` : '')}
      ${filaDato('Domiciliario', esc(p.domiciliario || ''))}
    </table>
    <hr>
    <table>
      <tr><th>Cant</th><th>Descripción</th><th class="r">Valor</th></tr>
      ${items.map((i) => `<tr class="linea">
        <td class="cant">${i.cantidad}</td>
        <td>${esc(i.nombre)}
          ${i.opciones.length ? `<div class="o">${esc(i.opciones.join(', '))}</div>` : ''}
          ${i.nota ? `<div class="o">» ${esc(i.nota)}</div>` : ''}
          ${i.cantidad > 1 ? `<div class="o">${i.cantidad} × ${pesos(i.precio_unit)}</div>` : ''}</td>
        <td class="r">${pesos(i.cantidad * i.precio_unit)}</td></tr>`).join('')}
    </table>
    <hr>
    <table>
      <tr><td>Subtotal (${unidades} producto${unidades === 1 ? '' : 's'})</td><td class="r">${pesos(subtotal)}</td></tr>
      ${p.costo_envio > 0 ? `<tr><td>Domicilio</td><td class="r">${pesos(p.costo_envio)}</td></tr>` : ''}
    </table>
    <hr class="doble">
    <table class="total"><tr><td>TOTAL</td><td class="r">${pesos(p.total)}</td></tr></table>
    ${Object.keys(impuestos).length ? `<table class="chico">${Object.entries(impuestos).map(([k, v]) =>
      `<tr><td>${k} incluido</td><td class="r">${pesos(v)}</td></tr>`).join('')}</table>` : ''}
    ${!pagado && propina > 0 ? `<hr><table>
        <tr><td>Propina voluntaria sugerida (${propina}%)</td><td class="r">${pesos(Math.round(p.total * propina / 100))}</td></tr>
        <tr><td class="b">Total con propina</td><td class="r b">${pesos(Math.round(p.total * (1 + propina / 100)))}</td></tr></table>
      <div class="aviso">La propina es voluntaria: usted puede aceptarla, modificar su valor o rechazarla. Infórmelo a quien lo atiende.</div>` : ''}
    ${p.pagos.length ? `<hr><table>
      ${p.pagos.map((pg) => `<tr><td>${MEDIO[pg.medio]}${pg.por_liquidar ? ' (contra entrega)' : ''}</td><td class="r">${pesos(pg.valor)}</td></tr>`).join('')}
      ${!pagado && pagos < p.total ? `<tr><td class="b">Pendiente</td><td class="r b">${pesos(p.total - pagos)}</td></tr>` : ''}
    </table>` : ''}
    ${doc ? `<hr><p class="chico"><b>${esc(TIPO_DOC[doc.tipo])} ${esc(numDoc(doc))}</b></p>
      ${doc.cufe ? `<p class="cufe">${doc.tipo === 'FACTURA' ? 'CUFE' : 'CUDE'}: ${esc(doc.cufe)}</p>` : ''}` : ''}
    ${p.nota ? `<hr><p class="chico"><b>Nota:</b> ${esc(p.nota)}</p>` : ''}
    <hr>
    <p class="c b">${esc(a.pie_ticket || '¡Gracias por su compra!')}</p>
    <p class="pie">${impreso}</p>`;
}

// ─── Sonido corto para avisos en cocina ──────────────────────────────────────
let audioCtx;
function pitido() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.25, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.start(); o.stop(audioCtx.currentTime + 0.5);
  } catch { /* sin audio */ }
}

// ═══ Sesión y navegación ═════════════════════════════════════════════════════
const NAV = [
  ['pedidos', 'Pedidos', ['cajero', 'mesero']],
  ['cocina', 'Cocina', ['cajero', 'cocina']],
  ['domicilios', 'Domicilios', ['cajero', 'domiciliario']],
  ['caja', 'Caja', ['cajero']],
  ['facturas', 'Facturas', ['cajero']],
  ['inventario', 'Inventario', ['cajero']],
  ['gastos', 'Gastos', ['cajero']],
  ['menu', 'Menú', []],
  ['reportes', 'Reportes', []],
  ['contabilidad', 'Contabilidad', []],
  ['personal', 'Personal', []],
  ['ajustes', 'Ajustes', []],
  ['restaurantes', 'Restaurantes', 'superadmin']
];
const ICONO_NAV = { pedidos: '🧾', cocina: '🍳', domicilios: '🛵', caja: '💵', facturas: '📄', inventario: '📦', gastos: '💸',
  menu: '📋', reportes: '📊', contabilidad: '📚', personal: '👥', ajustes: '⚙️', restaurantes: '🏪' };
// Vistas por rol; "superadmin" es solo para quien administra todos los restaurantes
const puedeVer = (roles) => (roles === 'superadmin' ? !!S.usuario?.superadmin : tiene(...roles));
const PERMISO_VISTA = { pedido: ['cajero', 'mesero'] };

function inicioRol() {
  return { cocina: 'cocina', domiciliario: 'domicilios' }[S.usuario.rol] || 'pedidos';
}

$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  const boton = e.submitter;
  ejecutar(async () => {
    $('#login-error').hidden = true;
    try {
      const u = await api('/login', { method: 'POST', body: { email: $('#email').value, clave: $('#clave').value } });
      S.usuario = u;
      almacen.guardar('pos_usuario', u);
      iniciar();
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#login-error').hidden = false;
    }
  }, boton);
});

$('#salir').addEventListener('click', () => salir());

function salir() {
  S.usuario = null;
  Object.assign(S, { menu: null, catActiva: null, ajustes: null, carrito: [], carritoClave: null, miAsistencia: null, preguntoEntrada: false });
  $('#reloj').hidden = true;
  $('#reloj-movil').hidden = true;
  almacen.borrar('pos_usuario');
  cerrarEventos();
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#clave').value = '';
}

async function iniciar() {
  if (!S.usuario || !S.usuario.token) {
    S.usuario = null;
    almacen.borrar('pos_usuario');
    $('#login').hidden = false;
    $('#app').hidden = true;
    return;
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#u-nombre').textContent = S.usuario.nombre;
  $('#u-rol').textContent = ROL[S.usuario.rol] + (S.usuario.superadmin && S.usuario.restaurante ? ` · ${S.usuario.restaurante}` : '');
  $('#nav').innerHTML = NAV.filter(([, , r]) => puedeVer(r))
    .map(([v, t]) => `<a href="#${v}" data-v="${v}" title="${t}"><span class="ico">${ICONO_NAV[v] || '•'}</span><span class="txt">${t}</span></a>`).join('');
  try { S.ajustes = await api('/ajustes'); } catch { /* sigue */ }
  aplicarTema(temaDe(S.ajustes));
  almacen.guardar('pos_tema', temaDe(S.ajustes));
  pintarMarca();
  abrirEventos();
  actualizarReloj().then(() => {
    if (S.usuario?.rol !== 'admin' && S.miAsistencia && !S.miAsistencia.abierta && !S.preguntoEntrada) {
      S.preguntoEntrada = true;
      ejecutar(marcarReloj);
    }
  });
  if (!location.hash) location.hash = inicioRol();
  else navegar();
}

// Nombre del restaurante en la barra: la última palabra va en cursiva
function pintarMarca() {
  const nombre = (S.ajustes?.nombre_negocio || S.usuario?.restaurante || '').trim();
  if (!nombre) return;
  const partes = nombre.split(/\s+/);
  const ultima = partes.length > 1 ? partes.pop() : '';
  const icono = temaDe(S.ajustes).icono;
  $$('#app .logo').forEach((l) => {
    l.innerHTML = `${icono ? `<span class="icono-marca">${esc(icono)}</span>` : ''}${esc(partes.join(' '))}${ultima ? ` <small>${esc(ultima)}</small>` : ''}`;
  });
  document.title = `${nombre} · POS`;
}

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!S.usuario) return;
  const [nombre, ...args] = (location.hash.slice(1) || inicioRol()).split('/');
  const permitido = NAV.find(([v]) => v === nombre)?.[2] ?? PERMISO_VISTA[nombre];
  if (!VISTAS[nombre] || !permitido || !puedeVer(permitido)) { location.hash = inicioRol(); return; }
  S.vista = { nombre, args };
  S.acc = {};
  if (S.ajustes) aplicarTema(temaDe(S.ajustes));
  clearInterval(S.reloj);
  $$('#nav a').forEach((a) => a.classList.toggle('activo', a.dataset.v === (nombre === 'pedido' ? 'pedidos' : nombre)));
  const el = $('#vista');
  el.className = '';
  try {
    await VISTAS[nombre](el, ...args);
  } catch (e) {
    el.innerHTML = `<div class="tarjeta error">${esc(e.message)}</div>`;
  }
}

// ─── Menú de acciones (⋯) ───────────────────────────────────────────────────
// items: [{ acc, id, texto, peligro, extra }]. El botón ⋯ abre una ventanita en el
// centro de la pantalla; cada opción ejecuta S.acc[acc] como un botón normal.
const menuAcciones = (items, titulo = 'Acciones') => `<button class="peq icono menu-btn" data-menu aria-label="Acciones" title="Acciones">⋯</button>
  <template><div class="menu-titulo">${esc(titulo)}</div>${items.map((i) => `<button class="${i.peligro ? 'peligro' : ''}" data-acc="${i.acc}" data-id="${i.id}" ${i.extra || ''}>${i.texto}</button>`).join('')}</template>`;
function abrirMenuAcciones(boton) {
  const fondo = document.createElement('div');
  fondo.className = 'menu-fondo';
  fondo.innerHTML = '<div class="menu-lista" role="menu"></div>';
  fondo.firstElementChild.append(boton.nextElementSibling.content.cloneNode(true));
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', tecla);
  fondo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acc]');
    if (e.target === fondo) return cerrar();
    if (!b) return;
    cerrar();
    if (S.acc[b.dataset.acc]) ejecutar(() => S.acc[b.dataset.acc](b));
  });
  document.body.appendChild(fondo);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]');
  if (b) abrirMenuAcciones(b);
});

// Clics en la vista: <button data-acc="nombre" data-id="...">
$('#vista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acc]');
  if (!b || !S.acc[b.dataset.acc]) return;
  ejecutar(() => S.acc[b.dataset.acc](b), b);
});
$('#vista').addEventListener('input', (e) => S.acc._input?.(e));
$('#vista').addEventListener('change', (e) => S.acc._change?.(e));
$('#vista').addEventListener('submit', (e) => {
  e.preventDefault();
  const fn = S.acc[e.target.dataset.submit];
  if (fn) ejecutar(() => fn(e.target), e.submitter);
});

// ─── Tiempo real ─────────────────────────────────────────────────────────────
let fuente = null;
let refrescoPendiente = null;
function abrirEventos() {
  cerrarEventos();
  fuente = new EventSource('/api/eventos?token=' + encodeURIComponent(S.usuario.token));
  fuente.onopen = () => $('#conexion').classList.add('ok');
  fuente.onerror = () => $('#conexion').classList.remove('ok');
  const refrescar = () => {
    clearTimeout(refrescoPendiente);
    refrescoPendiente = setTimeout(() => {
      const foco = document.activeElement;
      if (foco && $('#vista').contains(foco) && foco.matches('input, select, textarea')) return;
      const v = S.vista?.nombre;
      if (['pedidos', 'cocina', 'domicilios', 'caja'].includes(v)) VISTAS[v]($('#vista'), ...S.vista.args);
      if (v === 'pedido' && S.vista.args[0] !== 'nuevo') pintarCuenta();
    }, 250);
  };
  // Notificaciones: avisar al mesero cuando la cocina marque ítems como "listo"
  fuente.addEventListener('pedidos', async (ev) => {
    try {
      const datos = JSON.parse(ev.data || '{}');
      const id = datos.id;
      if (!id || !tiene('mesero', 'cajero')) return;
      const pedido = await api(`/pedidos/${id}`);
      const nuevos = pedido.items.filter((i) => i.estado === 'listo' && !S.avisoListo.has(`${pedido.id}:${i.id}`));
      if (nuevos.length) {
        nuevos.forEach((i) => S.avisoListo.add(`${pedido.id}:${i.id}`));
        const destino = pedido.tipo === 'MESA'
          ? (pedido.mesa || `Mesa ${pedido.mesa_id}`)
          : pedido.tipo === 'LLEVAR'
            ? 'Para llevar'
            : 'Domicilio';
        const texto = pedido.tipo === 'MESA'
          ? `${destino}: pedido listo (${nuevos.length} item${nuevos.length > 1 ? 's' : ''})`
          : `Pedido #${pedido.numero}: ${destino} listo (${nuevos.length} item${nuevos.length > 1 ? 's' : ''})`;
        pitido();
        toast(texto, 'ok', 8000);
        if (S.vista?.nombre === 'pedido' && String(S.vista.args[0]) === String(pedido.id)) {
          VISTAS['pedido']($('#vista'), String(pedido.id));
        } else if (S.vista?.nombre === 'pedidos') {
          VISTAS['pedidos']($('#vista'));
        }
      }
    } catch (e) { /* silencioso */ }
  });
  fuente.addEventListener('pedidos', refrescar);
  fuente.addEventListener('caja', refrescar);
  fuente.addEventListener('facturacion', (ev) => {
    const d = JSON.parse(ev.data || '{}');
    if (S.vista?.nombre === 'facturas' && !$('.modal-fondo')) vistaFacturas($('#vista'));
    if (S.vista?.nombre === 'pedido' && String(S.vista.args[0]) === String(d.pedido_id)) pintarCuenta();
  });
  fuente.addEventListener('personal', () => {
    actualizarReloj();
    if (S.vista?.nombre === 'personal' && !$('.modal-fondo')) vistaPersonal($('#vista'));
  });
  fuente.addEventListener('menu', () => {
    S.menu = null;
    if (S.vista?.nombre === 'pedido') cargarMenu().then(() => $('#prods') && pintarProductos()).catch(() => {});
  });
}
function cerrarEventos() {
  if (fuente) fuente.close();
  fuente = null;
  $('#conexion')?.classList.remove('ok');
}

async function cargarMenu(forzar = false) {
  if (!S.menu || forzar) S.menu = await api('/menu');
  return S.menu;
}
const productosMenu = () => S.menu.flatMap((c) => c.productos);

// ═══ VISTA: Pedidos (mesas y pedidos abiertos) ═══════════════════════════════
async function vistaPedidos(el) {
  const [mesas, pedidos] = await Promise.all([api('/mesas'), api('/pedidos?estado=abierto')]);
  const otros = pedidos.filter((p) => p.tipo !== 'MESA');
  const resumenCocina = (p) => {
    const c = {};
    p.items.forEach((i) => { c[i.estado] = (c[i.estado] || 0) + 1; });
    return ['pendiente', 'en_cocina', 'preparando', 'listo'].filter((k) => c[k])
      .map((k) => `<span class="chip ${k}">${c[k]} ${ESTADO_ITEM[k]}</span>`).join(' ');
  };
  el.innerHTML = `
    <div class="titulo-vista">
      <h2>Pedidos</h2>
      <div class="fila">
        <a class="btn" href="#pedido/nuevo/LLEVAR">+ Para llevar</a>
        <a class="btn primario" href="#pedido/nuevo/DOMICILIO">+ Domicilio</a>
      </div>
    </div>
    <div class="mesas">
      ${mesas.map((m) => `
        <button class="mesa ${m.pedido_id ? 'ocupada' : ''} ${m.listos ? 'alerta-pedido' : ''}" data-acc="mesa" data-id="${m.id}" data-pedido="${m.pedido_id || ''}">
          <span class="nom">${esc(m.nombre)}</span>
          <span class="det">${m.pedido_id ? `${pesos(m.total)} · ${minutos(m.creado_en)} min` : 'Libre'}</span>
          ${m.listos ? `<span class="platos-listos" title="${m.listos} listo${m.listos > 1 ? 's' : ''} para entregar" aria-label="${m.listos} listo${m.listos > 1 ? 's' : ''} para entregar">${'<span class="plato"><i></i><i></i><i></i><b>🍽️</b></span>'.repeat(6)}</span>` : ''}
          ${m.preparando ? `<span class="fuegos" title="${m.preparando} en preparación" aria-label="${m.preparando} en preparación">${'<span>🔥</span>'.repeat(6)}</span>` : ''}
          ${m.por_cobrar ? `<span class="billetes" title="Pendiente de pago" aria-label="Pendiente de pago">${'<span>💵</span>'.repeat(6)}</span>` : ''}
          ${m.en_cocina ? `<span class="chip en_cocina">${m.en_cocina} en cocina</span>` : ''}
        </button>`).join('')}
    </div>
    <div class="seccion">
      <h3>Para llevar y domicilios</h3>
      ${otros.length ? `<div class="lista-pedidos">${otros.map((p) => `
        <button class="tarjeta pedido-card ${p.items.some((i) => i.estado === 'listo') ? 'alerta-pedido' : ''}" data-acc="ver" data-id="${p.id}">
          <div class="entre"><b>#${p.numero} · ${TIPO[p.tipo]}</b><b>${pesos(p.total)}</b></div>
          <div class="suave chico">${esc(p.cliente || p.nombre_cliente || '')} ${p.barrio ? '· ' + esc(p.barrio) : ''} · ${hora(p.creado_en)}</div>
          <div style="margin-top:.4rem">${resumenCocina(p) || '<span class="suave chico">Sin ítems</span>'}</div>
        </button>`).join('')}</div>` : '<p class="vacio">No hay pedidos para llevar ni domicilios abiertos.</p>'}
    </div>
    ${tiene('cajero') ? '<div class="seccion"><a href="#pedidos" data-acc="hoy">Ver todos los pedidos de hoy →</a></div><div id="hoy"></div>' : ''}`;

  S.acc = {
    mesa: (b) => { location.hash = b.dataset.pedido ? `pedido/${b.dataset.pedido}` : `pedido/nuevo/MESA/${b.dataset.id}`; },
    ver: (b) => { location.hash = `pedido/${b.dataset.id}`; },
    hoy: async () => {
      const lista = await api(`/pedidos?estado=todos&dia=${hoyISO()}`);
      $('#hoy').innerHTML = `<div class="tarjeta tabla-cont"><table>
        <thead><tr><th>#</th><th>Hora</th><th>Tipo</th><th>Cliente / mesa</th><th>Estado</th><th class="num">Total</th></tr></thead>
        <tbody>${lista.map((p) => `<tr data-acc="ver" data-id="${p.id}" style="cursor:pointer">
          <td>${p.numero}</td><td>${hora(p.creado_en)}</td><td>${TIPO[p.tipo]}</td>
          <td>${esc(p.mesa || p.cliente || p.nombre_cliente || '')}</td>
          <td><span class="chip ${p.estado}">${p.estado}</span></td><td class="num">${pesos(p.total)}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
  };
}

// ═══ VISTA: Pedido (tomar pedido / detalle / cobrar) ═════════════════════════
async function vistaPedido(el, id, tipo, mesaId) {
  await cargarMenu();
  const clave = id === 'nuevo' ? `nuevo/${tipo}/${mesaId || ''}` : id;
  if (S.carritoClave !== clave) {
    S.carrito = [];
    S.carritoClave = clave;
    S.nuevo = { tipo, mesa_id: mesaId ? Number(mesaId) : null, costo_envio: Number(S.ajustes.costo_envio) || 0, cliente: {} };
  }
  S.pedido = null;
  S.catActiva = S.catActiva || S.menu[0]?.id;
  el.innerHTML = `
    <div class="pos">
      <section>
        <div class="entre" style="margin-bottom:.6rem">
          <a href="#pedidos">← Pedidos</a>
          <input id="buscar" type="search" name="buscar-plato" placeholder="Buscar plato…" style="max-width:260px" autocomplete="off" value="">
        </div>
        <div class="cats" id="cats"></div>
        <div class="prods" id="prods"></div>
      </section>
      <aside class="tarjeta cuenta" id="cuenta"></aside>
    </div>`;

  if (id === 'nuevo' && tipo === 'MESA') S.mesas = await api('/mesas');
  pintarProductos();
  await pintarCuenta();

  S.acc = {
    cat: (b) => { S.catActiva = Number(b.dataset.id); $('#buscar').value = ''; pintarProductos(); },
    prod: (b) => agregarProducto(productosMenu().find((p) => p.id === Number(b.dataset.id))),
    mas: (b) => { S.carrito[b.dataset.i].cantidad++; pintarCuenta(); },
    menos: (b) => {
      const l = S.carrito[b.dataset.i];
      if (--l.cantidad <= 0) S.carrito.splice(b.dataset.i, 1);
      pintarCuenta();
    },
    quitar: (b) => { S.carrito.splice(b.dataset.i, 1); pintarCuenta(); },
    enviar: enviarPedido,
    editarCliente: () => modalDatosDomicilio(S.pedido, pintarCuenta),
    itemEstado: async (b) => {
      if (b.dataset.estado === 'anulado') {
        const ok = await confirmar('¿Anular este ítem? Si ya estaba preparado, su costo queda como merma.', { boton: 'Anular', peligro: true });
        if (!ok) return;
      }
      await api(`/items/${b.dataset.id}`, { method: 'PATCH', body: { estado: b.dataset.estado } });
      await pintarCuenta();
    },
    borrarItem: async (b) => { await api(`/items/${b.dataset.id}`, { method: 'DELETE' }); await pintarCuenta(); },
    enviarPendientes: async () => {
      await api(`/pedidos/${S.pedido.id}/enviar`, { method: 'POST' });
      toast('Enviado a cocina', 'ok');
      await pintarCuenta();
    },
    cobrar: () => modalCobro(S.pedido),
    anular: async () => {
      const motivo = await confirmar(`¿Anular el pedido #${S.pedido.numero}? Los ítems que no se han preparado vuelven al inventario.`,
        { boton: 'Anular pedido', peligro: true, campo: 'Motivo' });
      if (!motivo) return;
      await api(`/pedidos/${S.pedido.id}/anular`, { method: 'POST', body: { motivo } });
      toast('Pedido anulado');
      location.hash = 'pedidos';
    },
    imprimirCuenta: () => imprimir(ticketPedido(S.pedido, 'cuenta'), `Cuenta · pedido #${S.pedido.numero}`),
    imprimirDoc: (b) => imprimirDocumento(Number(b.dataset.id)),
    pedirFactura: () => modalFacturaPedido(S.pedido, pintarCuenta),
    emitirPos: async () => {
      const d = await api(`/pedidos/${S.pedido.id}/documento`, { method: 'POST', body: { tipo: 'POS' } });
      toast(`POS electrónico ${numDoc(d)} en proceso`, 'ok');
      pintarCuenta();
    },
    imprimirComanda: () => imprimir(ticketPedido(S.pedido, 'comanda'), `Comanda · pedido #${S.pedido.numero}`),
    despachar: async () => {
      const did = $('#sel-domi').value;
      if (!did) throw new Error('Elija el domiciliario');
      await api(`/pedidos/${S.pedido.id}/domicilio`, { method: 'POST', body: { domiciliario_id: Number(did) } });
      toast('Domicilio despachado', 'ok');
      await pintarCuenta();
    },
    _input: (e) => {
      const t = e.target;
      if (t.id === 'buscar') return pintarProductos();
      if (t.dataset.campo) {
        const [a, b] = t.dataset.campo.split('.');
        if (b) S.nuevo[a][b] = t.value; else S.nuevo[a] = t.value;
        if (t.dataset.campo === 'costo_envio') pintarTotales();
        if (t.dataset.campo === 'cliente.telefono') buscarCliente(t.value);
      }
    },
    _change: (e) => {
      if (e.target.dataset.campo === 'mesa_id') S.nuevo.mesa_id = Number(e.target.value);
    }
  };
}

function pintarProductos() {
  // La categoría elegida puede no existir (menú cambiado u otro restaurante): usar la primera con productos
  if (!S.menu.some((c) => c.id === S.catActiva)) S.catActiva = (S.menu.find((c) => c.productos.length) || S.menu[0])?.id;
  const q = $('#buscar')?.value.trim().toLowerCase();
  $('#cats').innerHTML = S.menu.map((c) =>
    `<button class="peq ${!q && c.id === S.catActiva ? 'activo' : ''}" data-acc="cat" data-id="${c.id}">${esc(c.nombre)}</button>`).join('');
  const lista = q
    ? productosMenu().filter((p) => p.nombre.toLowerCase().includes(q))
    : S.menu.find((c) => c.id === S.catActiva)?.productos || [];
  $('#prods').innerHTML = lista.map((p) => `
    <button class="prod" data-acc="prod" data-id="${p.id}">
      <span>${esc(p.nombre)}</span>
      ${p.grupos.length ? `<span class="op">Elegir: ${esc(p.grupos.map((g) => g.nombre).join(', '))}</span>` : ''}
      <span class="precio">${pesos(p.precio)}</span>
    </button>`).join('') || `<p class="vacio">${
      !S.menu.some((c) => c.productos.length)
        ? `Este restaurante todavía no tiene productos.${tiene() ? ' Créelos en la pestaña <a href="#menu">Menú</a>.' : ' Pida al administrador que cree el menú.'}`
        : q ? `No hay productos que coincidan con "${esc(q)}".` : 'No hay productos en esta categoría.'}</p>`;
}

function agregarProducto(p) {
  if (!p.grupos.length) {
    const igual = S.carrito.find((l) => l.producto_id === p.id && !l.opciones.length && !l.nota);
    if (igual) igual.cantidad++;
    else S.carrito.push({ producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, opciones: [], nombresOp: [], nota: '' });
    toast(`+ ${p.nombre}`);
    return pintarCuenta();
  }
  abrirModal(`
    ${cabeceraModal(esc(p.nombre))}
    <form>
      ${p.grupos.map((g) => `
        <fieldset class="grupo-op">
          <legend>${esc(g.nombre)} <span class="suave chico">(${g.min_sel === g.max_sel ? `elija ${g.min_sel}` : `de ${g.min_sel} a ${g.max_sel}`})</span></legend>
          ${g.opciones.map((o, i) => `
            <label class="check"><input type="${g.max_sel === 1 ? 'radio' : 'checkbox'}" name="g${g.id}" value="${o.id}"
              ${g.max_sel === 1 && g.min_sel === 1 && i === 0 ? 'checked' : ''}>
              ${esc(o.nombre)} ${o.precio_extra ? `<span class="suave">+${pesos(o.precio_extra)}</span>` : ''}</label>`).join('')}
        </fieldset>`).join('')}
      <div class="campos">
        <div><label>Cantidad</label><input name="cantidad" type="number" min="1" value="1" inputmode="numeric"></div>
        <div style="grid-column: span 2"><label>Nota para cocina</label><input name="nota" placeholder="Ej: sin cebolla, huevos pericos"></div>
      </div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Agregar</button></div>
    </form>`, {
    submit: (f, _m, cerrar) => {
      const opciones = [];
      const nombresOp = [];
      let extra = 0;
      for (const g of p.grupos) {
        const sel = $$(`input[name="g${g.id}"]:checked`, f).map((x) => Number(x.value));
        if (sel.length < g.min_sel || sel.length > g.max_sel) throw new Error(`Revise "${g.nombre}"`);
        for (const oid of sel) {
          const o = g.opciones.find((x) => x.id === oid);
          opciones.push(oid); nombresOp.push(o.nombre); extra += Number(o.precio_extra);
        }
      }
      S.carrito.push({
        producto_id: p.id, nombre: p.nombre, precio: p.precio + extra, opciones, nombresOp,
        cantidad: Math.max(1, parseInt(f.cantidad.value, 10) || 1), nota: f.nota.value.trim()
      });
      cerrar();
      pintarCuenta();
    }
  });
}

// Corregir teléfono / dirección de un domicilio que aún no se ha entregado
const domicilioEditable = (p) => p.tipo === 'DOMICILIO' && p.estado !== 'anulado' && !p.entregado_en;
function modalDatosDomicilio(p, listo) {
  abrirModal(`
    ${cabeceraModal(`Datos del domicilio #${p.numero}`)}
    <form>
      <div class="campos">
        <div><label>Teléfono *</label><input name="telefono" inputmode="tel" value="${esc(p.telefono || '')}" required autofocus></div>
        <div><label>Nombre</label><input name="nombre" value="${esc(p.cliente || '')}"></div>
        <div style="grid-column:1/-1"><label>Dirección *</label><input name="direccion" value="${esc(p.direccion_entrega || '')}" required></div>
        <div><label>Barrio</label><input name="barrio" value="${esc(p.barrio || '')}"></div>
      </div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button></div>
    </form>`, {
    submit: async (f, _m, cerrar) => {
      await api(`/pedidos/${p.id}/cliente`, { method: 'PATCH', body: {
        telefono: f.telefono.value, nombre: f.nombre.value, direccion: f.direccion.value, barrio: f.barrio.value } });
      cerrar();
      toast('Datos del domicilio actualizados', 'ok');
      listo();
    }
  });
}

let buscarClienteT;
function buscarCliente(tel) {
  clearTimeout(buscarClienteT);
  if (tel.replace(/\D/g, '').length < 7) return;
  buscarClienteT = setTimeout(async () => {
    const r = await api(`/clientes?telefono=${encodeURIComponent(tel)}`);
    const c = r.find((x) => x.telefono.replace(/\D/g, '') === tel.replace(/\D/g, '')) || (r.length === 1 ? r[0] : null);
    if (!c) return;
    Object.assign(S.nuevo.cliente, { telefono: c.telefono, nombre: c.nombre || '', direccion: c.direccion || '', barrio: c.barrio || '' });
    for (const k of ['nombre', 'direccion', 'barrio']) {
      const inp = $(`[data-campo="cliente.${k}"]`);
      if (inp) inp.value = S.nuevo.cliente[k];
    }
    toast(`Cliente encontrado: ${c.nombre || c.telefono}`, 'ok');
  }, 350);
}

const totalCarrito = () => S.carrito.reduce((s, l) => s + l.precio * l.cantidad, 0);

function pintarTotales() {
  const p = S.pedido;
  const envio = p ? 0 : (S.nuevo.tipo === 'DOMICILIO' ? Number(S.nuevo.costo_envio) || 0 : 0);
  const total = (p ? p.total : 0) + totalCarrito() + envio;
  const t = $('#total-cuenta');
  if (t) t.textContent = pesos(total);
}

async function pintarCuenta() {
  const id = S.vista.args[0];
  if (id !== 'nuevo') S.pedido = await api(`/pedidos/${id}`);
  const p = S.pedido;
  const c = $('#cuenta');
  if (!c) return;
  const editable = !p || p.estado === 'abierto';

  let cabecera;
  if (p) {
    const destino = p.tipo === 'MESA' ? esc(p.mesa) : p.tipo === 'DOMICILIO' ? 'Domicilio' : 'Para llevar';
    cabecera = `<h3><span>#${p.numero} · ${destino}</span><span class="chip ${p.estado}">${p.estado}</h3>
      <div class="suave chico">${hora(p.creado_en)} · ${esc(p.mesero || '')}
        ${p.cliente || p.nombre_cliente ? ` · ${esc(p.cliente || p.nombre_cliente)}` : ''}
        ${p.telefono ? ` · ${esc(p.telefono)}` : ''}</div>
      ${p.direccion_entrega ? `<div class="chico">📍 ${esc(p.direccion_entrega)} ${esc(p.barrio || '')}</div>` : ''}
      ${domicilioEditable(p) && tiene('mesero', 'cajero') ? '<button class="peq" data-acc="editarCliente" style="margin-top:.35rem">✏️ Editar teléfono / dirección</button>' : ''}
      ${p.nota ? `<div class="chico"><b>Nota:</b> ${esc(p.nota)}</div>` : ''}`;
  } else {
    const n = S.nuevo;
    cabecera = `<h3>Nuevo · ${TIPO[n.tipo]}</h3>`;
    if (n.tipo === 'MESA') {
      cabecera += `<div class="campo"><label>Mesa</label><select data-campo="mesa_id">
        ${S.mesas.map((m) => `<option value="${m.id}" ${m.id === n.mesa_id ? 'selected' : ''} ${m.pedido_id ? 'disabled' : ''}>${esc(m.nombre)}${m.pedido_id ? ' (ocupada)' : ''}</option>`).join('')}
      </select></div>`;
    } else if (n.tipo === 'LLEVAR') {
      cabecera += `<div class="campo"><label>A nombre de</label><input data-campo="nombre_cliente" value="${esc(n.nombre_cliente || '')}"></div>`;
    } else {
      const cl = n.cliente;
      cabecera += `<div class="campos">
        <div><label>Teléfono *</label><input data-campo="cliente.telefono" inputmode="tel" value="${esc(cl.telefono || '')}" autofocus></div>
        <div><label>Nombre</label><input data-campo="cliente.nombre" value="${esc(cl.nombre || '')}"></div>
        <div style="grid-column:1/-1"><label>Dirección *</label><input data-campo="cliente.direccion" value="${esc(cl.direccion || '')}"></div>
        <div><label>Barrio</label><input data-campo="cliente.barrio" value="${esc(cl.barrio || '')}"></div>
        <div><label>Costo envío</label><input data-campo="costo_envio" type="number" min="0" step="500" value="${esc(n.costo_envio)}"></div>
      </div>`;
    }
    cabecera += `<div class="campo" style="margin-top:.6rem"><label>Nota del pedido</label><input data-campo="nota" value="${esc(n.nota || '')}"></div>`;
  }

  const lineaExistente = (i) => {
    const acciones = [];
    if (p && p.estado !== 'anulado') {
      if (i.estado === 'pendiente' && editable) acciones.push(`<button class="peq peligro" data-acc="borrarItem" data-id="${i.id}">Borrar</button>`);
      if (i.estado === 'listo' && tiene('mesero', 'cajero')) acciones.push(`<button class="peq exito" data-acc="itemEstado" data-estado="entregado" data-id="${i.id}">Entregar</button>`);
      if (['en_cocina', 'preparando'].includes(i.estado) && tiene('cajero')) acciones.push(`<button class="peq" data-acc="itemEstado" data-estado="listo" data-id="${i.id}">Listo</button>`);
      if (!['pendiente', 'anulado'].includes(i.estado) && editable && tiene('cajero')) acciones.push(`<button class="peq peligro" data-acc="itemEstado" data-estado="anulado" data-id="${i.id}" title="Anular">✕</button>`);
    }
    return `<div class="linea ${i.estado === 'anulado' ? 'anulada' : ''}">
      <div class="info"><div class="n">${i.cantidad} × ${esc(i.nombre)}</div>
        ${i.opciones.length ? `<div class="o">${esc(i.opciones.join(' · '))}</div>` : ''}
        ${i.nota ? `<div class="nota">» ${esc(i.nota)}</div>` : ''}
        <span class="chip ${i.estado}">${ESTADO_ITEM[i.estado]}</span></div>
      <div class="acc"><span class="num">${pesos(i.cantidad * i.precio_unit)}</span>${acciones.join('')}</div>
    </div>`;
  };

  const lineaCarrito = (l, idx) => `<div class="linea">
    <div class="info"><div class="n">${esc(l.nombre)}</div>
      ${l.nombresOp.length ? `<div class="o">${esc(l.nombresOp.join(' · '))}</div>` : ''}
      ${l.nota ? `<div class="nota">» ${esc(l.nota)}</div>` : ''}
      <span class="num chico suave">${pesos(l.precio)} c/u</span></div>
    <div class="acc"><span class="cant">
      <button class="peq icono" data-acc="menos" data-i="${idx}" aria-label="Menos">−</button><span>${l.cantidad}</span>
      <button class="peq icono" data-acc="mas" data-i="${idx}" aria-label="Más">+</button></span>
      <span class="num">${pesos(l.precio * l.cantidad)}</span></div>
  </div>`;

  const pendientes = p?.items.some((i) => i.estado === 'pendiente');
  let acciones = '';
  if (editable) {
    if (S.carrito.length) acciones += `<button class="primario" style="width:100%" data-acc="enviar">Enviar a cocina (${S.carrito.reduce((s, l) => s + l.cantidad, 0)})</button>`;
    else if (pendientes) acciones += `<button class="primario" style="width:100%" data-acc="enviarPendientes">Enviar pendientes a cocina</button>`;
  }
  if (p) {
    acciones += '<div class="fila" style="margin-top:.5rem">';
    if (p.estado === 'abierto' && tiene('cajero') && p.total > 0 && !S.carrito.length) acciones += `<button class="exito crece" data-acc="cobrar">Cobrar ${pesos(p.total)}</button>`;
    acciones += `<button class="peq" data-acc="imprimirCuenta">🧾 Cuenta</button><button class="peq" data-acc="imprimirComanda">🍳 Comanda</button>`;
    if (p.estado === 'abierto' && tiene('cajero')) acciones += `<button class="peq peligro" data-acc="anular">Anular pedido</button>`;
    acciones += '</div>';
    if (p.tipo === 'DOMICILIO' && p.estado !== 'anulado' && tiene('cajero')) {
      const domis = S.domis || (S.domis = await api('/domiciliarios'));
      acciones += `<div class="etiqueta-seccion">Domiciliario</div>
        ${p.domiciliario ? `<p class="chico">🛵 ${esc(p.domiciliario)} · salió ${hora(p.despachado_en)}${p.entregado_en ? ` · entregado ${hora(p.entregado_en)}` : ''}</p>` : ''}
        ${!p.entregado_en ? `<div class="fila"><select id="sel-domi" class="crece">
          <option value="">Elegir…</option>${domis.map((d) => `<option value="${d.id}" ${d.id === p.domiciliario_id ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>
          <button class="peq aviso" data-acc="despachar">${p.domiciliario_id ? 'Cambiar' : 'Despachar'}</button></div>` : ''}`;
    }
    if (p.documentos?.length || (p.estado === 'pagado' && feActiva())) {
      const vig = documentoVigente(p);
      acciones += `<div class="etiqueta-seccion">Facturación electrónica</div>
        ${p.documentos.map((d) => `<div class="subtotal"><span>${TIPO_DOC[d.tipo]} ${esc(numDoc(d))}${d.cliente && d.tipo !== 'POS' ? ` · ${esc(d.cliente)}` : ''}</span>${chipDoc(d)}</div>`).join('')
          || '<p class="chico suave">Sin documento electrónico.</p>'}
        <div class="fila" style="margin-top:.4rem">
          ${vig ? `<button class="peq" data-acc="imprimirDoc" data-id="${vig.id}">🖨️ ${vig.tipo === 'FACTURA' ? 'Factura' : 'POS electrónico'}</button>` : ''}
          ${p.estado === 'pagado' && feActiva() && tiene('cajero') && vig?.tipo !== 'FACTURA' ? '<button class="peq primario" data-acc="pedirFactura">🧾 Factura electrónica</button>' : ''}
          ${p.estado === 'pagado' && feActiva() && tiene('cajero') && !vig ? '<button class="peq" data-acc="emitirPos">Emitir POS electrónico</button>' : ''}
        </div>`;
    }
    if (p.pagos.length) {
      acciones += `<div class="etiqueta-seccion">Pagos</div>${p.pagos.map((pg) =>
        `<div class="subtotal"><span>${MEDIO[pg.medio]}${pg.por_liquidar ? ' (lo cobra el domiciliario)' : ''}</span><span>${pesos(pg.valor)}</span></div>`).join('')}`;
    }
  }

  c.innerHTML = `
    ${cabecera}
    ${p?.items.length ? `<div class="etiqueta-seccion">En el pedido</div>${p.items.map(lineaExistente).join('')}` : ''}
    ${S.carrito.length ? `<div class="etiqueta-seccion">Por enviar</div>${S.carrito.map(lineaCarrito).join('')}` : ''}
    ${!p?.items.length && !S.carrito.length ? '<p class="vacio">Toque los platos del menú para agregarlos.</p>' : ''}
    ${p?.costo_envio > 0 ? `<div class="subtotal"><span>Domicilio</span><span>${pesos(p.costo_envio)}</span></div>` : ''}
    ${!p && S.nuevo.tipo === 'DOMICILIO' ? '<div class="subtotal"><span>Domicilio</span><span id="envio-nuevo"></span></div>' : ''}
    <div class="total"><span>Total</span><span id="total-cuenta"></span></div>
    ${acciones}`;
  if (!p && S.nuevo.tipo === 'DOMICILIO') $('#envio-nuevo').textContent = pesos(S.nuevo.costo_envio);
  pintarTotales();
}

async function enviarPedido() {
  const items = S.carrito.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, nota: l.nota, opciones: l.opciones }));
  if (S.pedido) {
    await api(`/pedidos/${S.pedido.id}/items`, { method: 'POST', body: { items, enviar: true } });
    S.carrito = [];
    toast('Enviado a cocina', 'ok');
    return pintarCuenta();
  }
  const n = S.nuevo;
  const p = await api('/pedidos', {
    method: 'POST',
    body: { tipo: n.tipo, mesa_id: n.mesa_id, nombre_cliente: n.nombre_cliente, cliente: n.cliente,
            costo_envio: n.costo_envio, nota: n.nota, items, enviar: true }
  });
  S.carrito = [];
  S.carritoClave = String(p.id);
  toast(`Pedido #${p.numero} enviado a cocina`, 'ok');
  location.hash = `pedido/${p.id}`;
}

function modalCobro(p) {
  const puedeLiquidar = p.tipo === 'DOMICILIO' && p.domiciliario_id;
  const modal = abrirModal(`
    ${cabeceraModal(`Cobrar pedido #${p.numero}`)}
    <form>
      <div class="total" style="border-top:0;margin-top:0"><span>Total</span><span>${pesos(p.total)}</span></div>
      ${puedeLiquidar ? `<label class="check" style="margin-bottom:.6rem"><input type="checkbox" name="liquidar">
        El domiciliario cobra en efectivo y lo entrega después en caja</label>` : ''}
      <div id="medios">
        <div class="fila" style="margin-bottom:.6rem">${MEDIOS.map((m) => `<button type="button" class="peq" data-acc="todo" data-m="${m}">Todo ${MEDIO[m]}</button>`).join('')}</div>
        ${MEDIOS.map((m) => `<div class="entre" style="margin-bottom:.4rem"><label style="margin:0;width:120px">${MEDIO[m]}</label>
          <input class="crece" name="${m}" type="number" min="0" step="100" inputmode="numeric" value="${m === 'EFECTIVO' ? p.total : ''}" style="max-width:180px"></div>`).join('')}
        <div class="campos" style="margin-top:.6rem">
          <div><label>Efectivo recibido</label><input name="recibido" type="number" min="0" step="100" inputmode="numeric" autofocus></div>
          <div><label>Cambio</label><div id="cambio" class="kpi" style="padding:.4rem .7rem"><span class="v" style="font-size:1.1rem">—</span></div></div>
        </div>
        <p id="restante" class="chico"></p>
      </div>
      ${feActiva() ? bloqueFactura() : ''}
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="exito" id="btn-cobrar">Cobrar</button></div>
    </form>`, {
    feElegir: (b) => fe.elegir(b),
    todo: (b, m) => {
      MEDIOS.forEach((x) => { m.querySelector(`[name=${x}]`).value = x === b.dataset.m ? p.total : ''; });
      recalcular(m);
    },
    input: (e, m) => { recalcular(m); fe?.alCambiar(e); },
    change: (e, m) => { recalcular(m); fe?.alCambiar(e); },
    submit: async (f, _m, cerrar) => {
      let body;
      if (f.liquidar?.checked) body = { por_liquidar: true };
      else body = { pagos: MEDIOS.map((x) => ({ medio: x, valor: Number(f[x].value) || 0 })).filter((x) => x.valor > 0) };
      if (fe?.pidio()) body.factura = { cliente_fiscal_id: await fe.guardar() };
      const r = await api(`/pedidos/${p.id}/cobrar`, { method: 'POST', body });
      cerrar();
      toast(`Pedido #${p.numero} cobrado`, 'ok');
      if (r.aviso_fe) toast(r.aviso_fe, 'error', 9000);
      S.pedido = r;
      const doc = documentoVigente(r);
      location.hash = 'pedidos';
      // Vista previa del recibo (o del documento electrónico) lista para imprimir
      if (doc) await imprimirDocumento(doc.id);
      else imprimir(ticketPedido(r, 'cuenta'), `Recibo · pedido #${r.numero}`);
    }
  });
  const fe = feActiva() ? controlFactura(modal.m) : null;
  recalcular(modal.m);
  function recalcular(m) {
    const liquidar = m.querySelector('[name=liquidar]')?.checked;
    $('#medios', m).style.opacity = liquidar ? '.4' : '1';
    $$('#medios input', m).forEach((i) => { i.disabled = !!liquidar; });
    const suma = MEDIOS.reduce((s, x) => s + (Number(m.querySelector(`[name=${x}]`).value) || 0), 0);
    const ef = Number(m.querySelector('[name=EFECTIVO]').value) || 0;
    const rec = Number(m.querySelector('[name=recibido]').value) || 0;
    $('#cambio .v', m).textContent = rec ? pesos(rec - ef) : '—';
    $('#cambio .v', m).className = 'v ' + (rec && rec < ef ? 'negativo' : '');
    const dif = p.total - suma;
    $('#restante', m).innerHTML = liquidar ? '' : dif === 0 ? '<span class="positivo">✔ Pagos completos</span>'
      : `<span class="negativo">${dif > 0 ? 'Faltan' : 'Sobran'} ${pesos(Math.abs(dif))}</span>`;
    $('#btn-cobrar', m).disabled = !liquidar && dif !== 0;
  }
}

// ═══ VISTA: Cocina ═══════════════════════════════════════════════════════════
async function vistaCocina(el) {
  const comandas = await api('/cocina');
  const nuevos = comandas.filter((c) => !S.cocinaVistos.has(c.id));
  if (S.cocinaVistos.size && nuevos.length && S.usuario.rol === 'cocina') pitido();
  comandas.forEach((c) => S.cocinaVistos.add(c.id));
  if (!S.cocinaVistos.size) S.cocinaVistos.add(0);

  el.innerHTML = `
    <div class="titulo-vista"><h2>Cocina</h2><span class="suave">${comandas.length} pedido(s) en cocina</span></div>
    ${comandas.length ? `<div class="cocina">${comandas.map((c) => {
      const min = minutos(c.desde);
      const destino = c.tipo === 'MESA' ? esc(c.mesa) : c.tipo === 'DOMICILIO' ? '🛵 Domicilio' : '🥡 Para llevar';
      return `<article class="comanda ${min >= 25 ? 'muy-tarde' : min >= 15 ? 'tarde' : ''}">
        <header><b>${destino} · #${c.numero}</b><span>${min} min</span></header>
        <div class="cuerpo">
          ${c.cliente ? `<div class="suave chico" style="padding-top:.3rem">${esc(c.cliente)}</div>` : ''}
          ${c.items.map((i) => `<div class="it ${i.estado}">
            <span class="c">${i.cantidad}</span>
            <div class="crece"><div class="n">${esc(i.nombre)}</div>
              ${i.opciones.length ? `<div class="o">${esc(i.opciones.join(' · '))}</div>` : ''}
              ${i.nota ? `<span class="nota">${esc(i.nota)}</span>` : ''}
              ${i.estado === 'preparando' ? '<span class="chip preparando">🔥 En preparación</span>' : ''}</div>
            ${i.estado === 'en_cocina' ? `<button class="peq icono" data-acc="preparar" data-id="${i.id}" aria-label="Empezar a preparar" title="Empezar a preparar">🔥</button>` : ''}
            <button class="peq exito icono" data-acc="listo" data-id="${i.id}" aria-label="Listo">✓</button></div>`).join('')}
          ${c.nota ? `<div class="nota-ped">${esc(c.nota)}</div>` : ''}
          ${c.items.some((i) => i.estado === 'en_cocina') ? `<button class="aviso" style="width:100%;margin-top:.6rem" data-acc="prepararTodo" data-id="${c.id}">🔥 Empezar a preparar</button>` : ''}
          <button class="exito" style="width:100%;margin-top:.6rem" data-acc="todo" data-id="${c.id}">Todo listo</button>
        </div></article>`;
    }).join('')}</div>` : '<p class="vacio">🍳 No hay pedidos pendientes. ¡Buen trabajo!</p>'}`;

  S.acc = {
    preparar: async (b) => { await api(`/items/${b.dataset.id}`, { method: 'PATCH', body: { estado: 'preparando' } }); vistaCocina(el); },
    prepararTodo: async (b) => { await api(`/pedidos/${b.dataset.id}/preparar`, { method: 'POST' }); vistaCocina(el); },
    listo: async (b) => { await api(`/items/${b.dataset.id}`, { method: 'PATCH', body: { estado: 'listo' } }); vistaCocina(el); },
    todo: async (b) => { await api(`/pedidos/${b.dataset.id}/listo`, { method: 'POST' }); vistaCocina(el); }
  };
  S.reloj = setInterval(() => { if (S.vista?.nombre === 'cocina') vistaCocina(el); }, 60000);
}

// ═══ VISTA: Domicilios ═══════════════════════════════════════════════════════
async function vistaDomicilios(el) {
  const esDomi = S.usuario.rol === 'domiciliario';
  const [todos, domis] = await Promise.all([
    api(`/pedidos?estado=todos&dia=${hoyISO()}`),
    esDomi ? [] : (S.domis = await api('/domiciliarios'))
  ]);
  const lista = todos.filter((p) => p.tipo === 'DOMICILIO' && p.estado !== 'anulado');
  const pend = lista.filter((p) => !p.entregado_en);
  const entregados = lista.filter((p) => p.entregado_en);
  const enCocina = (p) => p.items.some((i) => ['pendiente', 'en_cocina', 'preparando'].includes(i.estado));
  const cocina = (p) => enCocina(p)
    ? `<span class="chip en_cocina">${p.items.some((i) => i.estado === 'preparando') ? '🔥 En preparación' : 'En cocina'}</span>`
    : '<span class="chip listo">Listo para salir</span>';
  const pago = (p) => p.estado === 'pagado'
    ? (p.pagos.some((x) => x.por_liquidar) ? '<span class="chip abierto">Cobrar en efectivo</span>' : '<span class="chip pagado">Pagado</span>')
    : '<span class="chip abierto">Sin cobrar</span>';
  const tarjeta = (p) => `
    <div class="tarjeta">
      <div class="entre"><b>#${p.numero} · ${esc(p.cliente || '')}</b><b>${pesos(p.total)}</b></div>
      <div>📍 ${esc(p.direccion_entrega || '')} ${p.barrio ? '· ' + esc(p.barrio) : ''}
        <a class="chico" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.direccion_entrega, p.barrio, S.ajustes?.ciudad].filter(Boolean).join(', '))}">mapa</a></div>
      <div>📞 <a href="tel:${esc(p.telefono)}">${esc(p.telefono || '')}</a></div>
      <div class="chico suave">${p.items.filter((i) => i.estado !== 'anulado').map((i) => `${i.cantidad} ${esc(i.nombre)}`).join(', ')}</div>
      <div class="fila" style="margin-top:.4rem">${cocina(p)} ${pago(p)}
        ${p.domiciliario ? `<span class="chip entregado">🛵 ${esc(p.domiciliario)} ${hora(p.despachado_en)}</span>` : ''}</div>
      <div class="fila" style="margin-top:.6rem">
        ${!esDomi && !enCocina(p) ? `<select data-sel="${p.id}" style="max-width:200px"><option value="">Domiciliario…</option>
          ${domis.map((d) => `<option value="${d.id}" ${d.id === p.domiciliario_id ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>
          <button class="peq aviso" data-acc="despachar" data-id="${p.id}">Despachar</button>` : ''}
        ${!esDomi ? `<a class="btn peq" href="#pedido/${p.id}">Abrir</a>` : ''}
        ${enCocina(p) ? '<span class="suave chico">⏳ Esperando a cocina para despachar</span>' : ''}
        ${p.domiciliario_id && !p.entregado_en && !enCocina(p) ? `<button class="peq exito" data-acc="entregado" data-id="${p.id}">Entregado</button>` : ''}
        ${domicilioEditable(p) ? `<button class="peq" data-acc="editarCliente" data-id="${p.id}">✏️ Editar datos</button>` : ''}
      </div>
    </div>`;
  el.innerHTML = `
    <div class="titulo-vista"><h2>Domicilios de hoy</h2>
      ${!esDomi ? '<a class="btn primario" href="#pedido/nuevo/DOMICILIO">+ Domicilio</a>' : ''}</div>
    ${pend.length ? `<div class="lista-pedidos">${pend.map(tarjeta).join('')}</div>` : '<p class="vacio">No hay domicilios pendientes.</p>'}
    ${entregados.length ? `<div class="seccion"><h3>Entregados (${entregados.length})</h3><div class="tarjeta tabla-cont"><table>
      <thead><tr><th>#</th><th>Cliente</th><th>Domiciliario</th><th>Entregado</th><th class="num">Total</th></tr></thead>
      <tbody>${entregados.map((p) => `<tr><td>${p.numero}</td><td>${esc(p.cliente || '')}</td><td>${esc(p.domiciliario || '')}</td>
        <td>${hora(p.entregado_en)}</td><td class="num">${pesos(p.total)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;

  S.acc = {
    despachar: async (b) => {
      const did = $(`[data-sel="${b.dataset.id}"]`).value;
      if (!did) throw new Error('Elija el domiciliario');
      await api(`/pedidos/${b.dataset.id}/domicilio`, { method: 'POST', body: { domiciliario_id: Number(did) } });
      toast('Despachado', 'ok');
      vistaDomicilios(el);
    },
    editarCliente: (b) => modalDatosDomicilio(lista.find((p) => p.id === Number(b.dataset.id)), () => vistaDomicilios(el)),
    entregado: async (b) => {
      await api(`/pedidos/${b.dataset.id}/domicilio`, { method: 'POST', body: { entregado: true } });
      toast('Marcado como entregado', 'ok');
      vistaDomicilios(el);
    }
  };
}

// ═══ VISTA: Caja ═════════════════════════════════════════════════════════════
async function vistaCaja(el) {
  const [estado, porLiquidar, turnos] = await Promise.all([
    api('/caja/turno'), api('/caja/por-liquidar'), api('/caja/turnos')
  ]);
  const t = estado.turno;
  const c = estado.cuadre;
  const filaCuadre = (lbl, v, signo = '') => `<tr><td>${signo} ${lbl}</td><td class="num">${pesos(v)}</td></tr>`;

  el.innerHTML = `
    <div class="titulo-vista"><h2>Caja</h2>
      ${t ? `<span class="chip abierto">Turno #${t.id} abierto por ${esc(t.cajero)} · ${fechaHora(t.abierto_en)}</span>` : ''}</div>
    ${!t ? `
      <form class="tarjeta" data-submit="abrir" style="max-width:420px">
        <h3>Abrir turno de caja</h3>
        <p class="suave chico">Cuente el efectivo con el que empieza el día (la base).</p>
        <div class="campo"><label>Base inicial</label><input name="base" type="number" min="0" step="1000" required inputmode="numeric" autofocus></div>
        <button class="primario">Abrir caja</button>
      </form>` : `
      <div class="kpis">
        <div class="kpi destacado"><div class="t">Efectivo que debe haber</div><div class="v">${pesos(c.efectivo_esperado)}</div></div>
        <div class="kpi"><div class="t">Ventas del turno</div><div class="v">${pesos(c.total_ventas)}</div><div class="s">${c.pedidos} pedido(s)</div></div>
        ${MEDIOS.filter((m) => c.por_medio[m]).map((m) => `<div class="kpi"><div class="t">${MEDIO[m]}</div><div class="v">${pesos(c.por_medio[m])}</div></div>`).join('')}
      </div>
      <div class="dos-col seccion">
        <div class="tarjeta">
          <h3>Cuadre de efectivo</h3>
          <table class="cuadre">
            ${filaCuadre('Base inicial', c.base_inicial)}
            ${filaCuadre('Ventas en efectivo', c.ventas_efectivo, '+')}
            ${filaCuadre('Efectivo entregado por domiciliarios', c.liquidaciones_domiciliarios, '+')}
            ${filaCuadre('Gastos pagados de caja', c.gastos_caja, '−')}
            ${filaCuadre('Retiros', c.retiros, '−')}
            <tr class="res"><td>= Efectivo esperado</td><td class="num">${pesos(c.efectivo_esperado)}</td></tr>
          </table>
          <form data-submit="cerrar" class="seccion">
            <h3>Cerrar caja</h3>
            <div class="campos">
              <div><label>Efectivo contado</label><input name="contado" type="number" min="0" step="100" required inputmode="numeric"></div>
              <div><label>Diferencia</label><div class="kpi" style="padding:.4rem .7rem"><span class="v" id="dif" style="font-size:1.1rem">—</span></div></div>
            </div>
            <div class="campo" style="margin-top:.6rem"><label>Observaciones</label><input name="nota"></div>
            <button class="primario">Cerrar turno</button>
          </form>
        </div>
        <div>
          <div class="tarjeta">
            <div class="entre"><h3>Retiros</h3><button class="peq" data-acc="retiro">+ Retiro</button></div>
            ${estado.retiros.length ? estado.retiros.map((r) => `<div class="subtotal"><span>${hora(r.creado_en)} · ${esc(r.motivo)}</span><span>${pesos(r.valor)}</span></div>`).join('') : '<p class="suave chico">Sin retiros.</p>'}
            <div class="etiqueta-seccion">Gastos pagados de caja</div>
            ${estado.gastos.length ? estado.gastos.map((g) => `<div class="subtotal ${g.anulado ? 'suave' : ''}"><span>${esc(g.descripcion || CATEGORIAS_GASTO[g.categoria])}${g.anulado ? ' (anulado)' : ''}</span><span>${pesos(g.valor)}</span></div>`).join('') : '<p class="suave chico">Sin gastos de caja. Regístrelos en Gastos.</p>'}
          </div>
          <div class="tarjeta">
            <h3>Efectivo de domiciliarios por recibir</h3>
            ${porLiquidar.length ? `${porLiquidar.map((x) => `<label class="check"><input type="checkbox" name="liq" value="${x.id}" checked>
              #${x.pedido_numero} · ${esc(x.domiciliario)} · ${esc(x.cliente || '')} — <b>${pesos(x.valor)}</b>
              ${x.entregado_en ? '' : '<span class="chip en_cocina">en camino</span>'}</label>`).join('')}
              <button class="aviso" style="margin-top:.5rem" data-acc="liquidar">Recibir efectivo seleccionado</button>`
              : '<p class="suave chico">Nada pendiente.</p>'}
          </div>
        </div>
      </div>`}
    <div class="seccion tarjeta tabla-cont">
      <h3>Turnos anteriores</h3>
      <table><thead><tr><th>#</th><th>Cajero</th><th>Apertura</th><th>Cierre</th><th class="num">Ventas</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead>
      <tbody>${turnos.filter((x) => x.estado === 'cerrado').map((x) => `<tr>
        <td>${x.id}</td><td>${esc(x.cajero)}</td><td>${fechaHora(x.abierto_en)}</td><td>${fechaHora(x.cerrado_en)}</td>
        <td class="num">${pesos(x.resumen?.total_ventas)}</td><td class="num">${pesos(x.efectivo_esperado)}</td><td class="num">${pesos(x.efectivo_contado)}</td>
        <td class="num ${x.diferencia < 0 ? 'negativo' : x.diferencia > 0 ? 'positivo' : ''}">${pesos(x.diferencia)}</td></tr>`).join('')
        || '<tr><td colspan="8" class="suave">Aún no hay turnos cerrados.</td></tr>'}</tbody></table>
    </div>`;

  S.acc = {
    abrir: async (f) => {
      await api('/caja/abrir', { method: 'POST', body: { base_inicial: Number(f.base.value) } });
      toast('Caja abierta', 'ok');
      vistaCaja(el);
    },
    cerrar: async (f) => {
      const body = { efectivo_contado: Number(f.contado.value), nota: f.nota.value };
      const dif = body.efectivo_contado - c.efectivo_esperado;
      const ok = await confirmar(`Esperado ${pesos(c.efectivo_esperado)}, contado ${pesos(body.efectivo_contado)}.
        <br><b>${dif === 0 ? 'La caja cuadra exacto.' : dif < 0 ? `Faltante de ${pesos(-dif)}` : `Sobrante de ${pesos(dif)}`}</b>
        <br>Al cerrar, el turno queda bloqueado. ¿Continuar?`, { boton: 'Cerrar turno' });
      if (!ok) return;
      try {
        await api('/caja/cerrar', { method: 'POST', body });
      } catch (e) {
        if (e.status !== 409) throw e;
        if (!(await confirmar(esc(e.message), { boton: 'Cerrar de todos modos', peligro: true }))) return;
        await api('/caja/cerrar', { method: 'POST', body: { ...body, forzar: true } });
      }
      toast('Turno cerrado', 'ok');
      vistaCaja(el);
    },
    retiro: () => abrirModal(`${cabeceraModal('Retiro de caja')}
      <form><div class="campo"><label>Valor</label><input name="valor" type="number" min="1" step="100" required autofocus></div>
      <div class="campo"><label>Motivo</label><input name="motivo" required placeholder="Ej: consignación, pago al dueño"></div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Registrar</button></div></form>`, {
      submit: async (f, _m, cerrar) => {
        await api('/caja/retiro', { method: 'POST', body: { valor: Number(f.valor.value), motivo: f.motivo.value } });
        cerrar(); vistaCaja(el);
      }
    }),
    liquidar: async () => {
      const ids = $$('input[name=liq]:checked', el).map((i) => Number(i.value));
      await api('/caja/liquidar', { method: 'POST', body: { pago_ids: ids } });
      toast('Efectivo recibido', 'ok');
      vistaCaja(el);
    },
    _input: (e) => {
      if (e.target.name === 'contado' && c) {
        const d = (Number(e.target.value) || 0) - c.efectivo_esperado;
        $('#dif').textContent = e.target.value === '' ? '—' : pesos(d);
        $('#dif').className = 'v ' + (d < 0 ? 'negativo' : d > 0 ? 'positivo' : '');
      }
    }
  };
}

// ═══ VISTA: Inventario ═══════════════════════════════════════════════════════
async function vistaInventario(el) {
  const tab = S.inv.tab;
  const insumos = await api('/insumos');
  const alertas = insumos.filter((i) => i.alerta && i.activo);
  let cuerpo = '';
  if (tab === 'stock') {
    cuerpo = `<div class="tarjeta tabla-cont"><table>
      <thead><tr><th>Insumo</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Costo prom.</th><th class="num ocultar-movil">Valor</th><th></th></tr></thead>
      <tbody>${insumos.filter((i) => i.activo).map((i) => `<tr class="${i.alerta ? 'alerta' : ''}">
        <td>${esc(i.nombre)} ${i.alerta ? '<span class="chip alerta">Bajo</span>' : ''}</td>
        <td class="num"><b>${num(i.stock)}</b> ${UNIDAD[i.unidad]}</td>
        <td class="num">${num(i.stock_minimo)}</td>
        <td class="num">$ ${num(i.costo_promedio)}/${i.unidad}</td>
        <td class="num ocultar-movil">${pesos(i.valor)}</td>
        <td class="derecha"><button class="peq" data-acc="merma" data-id="${i.id}">Merma</button>
          ${tiene() ? `<button class="peq" data-acc="editar" data-id="${i.id}">Editar</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Valor total del inventario</td><td class="num ocultar-movil">${pesos(insumos.reduce((s, i) => s + i.valor, 0))}</td><td></td></tr></tfoot>
      </table></div>`;
  } else if (tab === 'conteo') {
    cuerpo = `<form class="tarjeta" data-submit="conteo">
      <p class="suave chico">Escriba lo que contó físicamente. Solo se ajustan los insumos que llene; la diferencia queda registrada como “Ajuste por conteo”.</p>
      <div class="tabla-cont"><table><thead><tr><th>Insumo</th><th class="num">Sistema</th><th>Contado</th></tr></thead>
      <tbody>${insumos.filter((i) => i.activo).map((i) => `<tr><td>${esc(i.nombre)}</td><td class="num">${num(i.stock)} ${i.unidad}</td>
        <td><input name="c${i.id}" type="number" min="0" step="any" inputmode="decimal" style="max-width:140px"></td></tr>`).join('')}</tbody></table></div>
      <div class="pie fila fin" style="margin-top:.6rem"><button class="primario">Guardar conteo</button></div></form>`;
  } else {
    const movs = await api('/movimientos');
    cuerpo = `<div class="tarjeta tabla-cont"><table>
      <thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th class="num">Cantidad</th><th>Detalle</th></tr></thead>
      <tbody>${movs.map((m) => `<tr><td>${fechaHora(m.creado_en)}</td><td>${esc(m.insumo)}</td><td>${TIPO_MOV[m.tipo]}</td>
        <td class="num ${m.cantidad < 0 ? 'negativo' : 'positivo'}">${m.cantidad > 0 ? '+' : ''}${num(m.cantidad)} ${m.unidad}</td>
        <td class="chico suave">${m.pedido_id ? `Pedido #${m.pedido_numero}` : ''} ${esc(m.nota || '')} ${esc(m.usuario || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  el.innerHTML = `
    <div class="titulo-vista"><h2>Inventario</h2>
      <div class="fila">${tiene() ? '<button data-acc="nuevo">+ Insumo</button>' : ''}<a class="btn" href="#gastos">+ Registrar compra</a></div></div>
    ${alertas.length ? `<div class="tarjeta" style="border-color:var(--rojo);margin-bottom:1rem"><b class="negativo">⚠ ${alertas.length} insumo(s) bajo el mínimo:</b>
      ${alertas.map((a) => esc(a.nombre)).join(', ')}</div>` : ''}
    <div class="tabs">${[['stock', 'Stock'], ['conteo', 'Conteo físico'], ['movimientos', 'Movimientos']].map(([k, t]) =>
      `<button class="${tab === k ? 'activo' : ''}" data-acc="tab" data-t="${k}">${t}</button>`).join('')}</div>
    ${cuerpo}`;

  const insumo = (id) => insumos.find((i) => i.id === Number(id));
  S.acc = {
    tab: (b) => { S.inv.tab = b.dataset.t; vistaInventario(el); },
    merma: (b) => {
      const i = insumo(b.dataset.id);
      abrirModal(`${cabeceraModal('Registrar merma · ' + esc(i.nombre))}
        <form><div class="campo"><label>Cantidad perdida (${i.unidad})</label><input name="cantidad" type="number" min="0" step="any" required autofocus></div>
        <div class="campo"><label>Causa</label><input name="nota" required placeholder="Ej: se dañó, se quemó, vencido"></div>
        <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Registrar</button></div></form>`, {
        submit: async (f, _m, cerrar) => {
          await api('/inventario/merma', { method: 'POST', body: { insumo_id: i.id, cantidad: Number(f.cantidad.value), nota: f.nota.value } });
          cerrar(); toast('Merma registrada', 'ok'); vistaInventario(el);
        }
      });
    },
    editar: (b) => modalInsumo(insumo(b.dataset.id), () => vistaInventario(el)),
    nuevo: () => modalInsumo(null, () => vistaInventario(el)),
    conteo: async (f) => {
      const conteos = insumos.map((i) => ({ insumo_id: i.id, contado: f[`c${i.id}`]?.value ?? '' })).filter((x) => x.contado !== '');
      if (!conteos.length) throw new Error('No escribió ningún conteo');
      const r = await api('/inventario/conteo', { method: 'POST', body: { conteos } });
      toast(`${r.ajustes} ajuste(s) registrados`, 'ok');
      S.inv.tab = 'stock';
      vistaInventario(el);
    }
  };
}

function modalInsumo(i, listo) {
  abrirModal(`${cabeceraModal(i ? 'Editar insumo' : 'Nuevo insumo')}
    <form>
      <div class="campo"><label>Nombre</label><input name="nombre" required value="${esc(i?.nombre || '')}" autofocus></div>
      <div class="campos">
        <div><label>Unidad</label><select name="unidad" ${i ? 'disabled' : ''}>
          ${['g', 'ml', 'und'].map((u) => `<option ${i?.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div><label>Stock mínimo</label><input name="minimo" type="number" min="0" step="any" value="${i?.stock_minimo ?? 0}"></div>
      </div>
      ${i ? `<label class="check" style="margin-top:.6rem"><input type="checkbox" name="activo" ${i.activo ? 'checked' : ''}> Activo</label>` : ''}
      <p class="suave chico">Compre en kilos o paquetes, pero registre en la unidad base (g, ml o und). El costo se calcula solo con las compras.</p>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button></div>
    </form>`, {
    submit: async (f, _m, cerrar) => {
      const body = { nombre: f.nombre.value, stock_minimo: Number(f.minimo.value) };
      if (i) await api(`/insumos/${i.id}`, { method: 'PATCH', body: { ...body, activo: f.activo.checked } });
      else await api('/insumos', { method: 'POST', body: { ...body, unidad: f.unidad.value } });
      cerrar(); listo();
    }
  });
}

// ═══ VISTA: Gastos ═══════════════════════════════════════════════════════════
async function vistaGastos(el) {
  S.gastosRango = S.gastosRango || { desde: hoyISO(), hasta: hoyISO() };
  const { desde, hasta } = S.gastosRango;
  const gastos = await api(`/gastos?desde=${desde}&hasta=${hasta}`);
  const total = gastos.filter((g) => !g.anulado).reduce((s, g) => s + g.valor, 0);
  const hoy = hoyISO();
  const inicioMes = hoy.slice(0, 8) + '01';
  el.innerHTML = `
    <div class="titulo-vista"><h2>Gastos e insumos</h2>
      <div class="fila"><button data-acc="proveedor">+ Proveedor</button><button class="primario" data-acc="nuevo">+ Registrar gasto</button></div></div>
    <form class="fila tarjeta" data-submit="filtrar" style="margin-bottom:1rem">
      <div><label>Desde</label><input type="date" name="desde" value="${desde}"></div>
      <div><label>Hasta</label><input type="date" name="hasta" value="${hasta}"></div>
      <button style="align-self:flex-end">Ver</button>
      <div class="fila" style="align-self:flex-end">${['Hoy', 'Ayer', '7 días', 'Este mes'].map((lbl, i) => '')}</div>
    </form>
    <div class="tarjeta tabla-cont"><table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th>Pago</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody>${gastos.map((g) => `<tr class="${g.anulado ? 'suave' : ''}">
        <td>${g.fecha.slice(0, 10)}</td><td>${CATEGORIAS_GASTO[g.categoria]}</td>
        <td>${esc(g.descripcion || '')} ${g.proveedor ? `<span class="suave">· ${esc(g.proveedor)}</span>` : ''}
          ${g.empleado ? `<span class="suave">· ${esc(g.empleado)}</span>` : ''}
          ${g.items.length ? `<div class="chico suave">${g.items.map((i) => `${num(i.cantidad)} ${i.unidad} ${esc(i.insumo)}`).join(', ')}</div>` : ''}
          ${g.anulado ? `<div class="chico negativo">Anulado: ${esc(g.motismo_anulacion || '')}</div>` : ''}</td>
        <td>${MEDIO[g.medio_pago]}${g.pagado_de_caja ? ' (caja)' : ''}</td>
        <td class="num">${pesos(g.valor)}</td>
        <td>${!g.anulado && tiene() ? `<button class="peq peligro" data-acc="anular" data-id="${g.id}">Anular</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="6" class="vacio">Sin gastos en estas fechas.</td></tr>'}</tbody></table></div>`;

  S.acc = {
    filtrar: (f) => { S.gastosRango = { desde: f.desde.value, hasta: f.hasta.value || f.desde.value }; vistaGastos(el); },
    nuevo: () => modalGasto(() => vistaGastos(el)),
    proveedor: () => abrirModal(`${cabeceraModal('Nuevo proveedor')}
      <form><div class="campo"><label>Nombre</label><input name="nombre" required autofocus></div>
      <div class="campos"><div><label>NIT / cédula</label><input name="nit"></div><div><label>Teléfono</label><input name="telefono"></div></div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button></div></form>`, {
      submit: async (f, _m, cerrar) => {
        await api('/proveedores', { method: 'POST', body: { nombre: f.nombre.value, nit: f.nit.value, telefono: f.telefono.value } });
        cerrar(); toast('Proveedor guardado', 'ok');
      }
    }),
    anular: async (b) => {
      const motivo = await confirmar('¿Anular este gasto? Si fue compra de insumos, se descuentan del inventario.', { boton: 'Anular', peligro: true, campo: 'Motivo' });
      if (!motivo) return;
      await api(`/gastos/${b.dataset.id}/anular`, { method: 'POST', body: { motivo } });
      vistaGastos(el);
    }
  };
}

async function modalGasto(listo) {
  const [insumos, proveedores, empleados] = await Promise.all([api('/insumos'), api('/proveedores'), api('/empleados')]);
  const opcInsumos = insumos.filter((i) => i.activo).map((i) => `<option value="${i.id}">${esc(i.nombre)} (${i.unidad})</option>`).join('');
  const opcEmpleados = empleados.filter((e) => e.activo).map((e) => `<option value="${e.id}">${esc(e.nombre)}${e.cargo ? ` · ${esc(e.cargo)}` : ''} · ${pesos(e.salario)}</option>`).join('');
  const linea = () => `<div class="fila linea-compra" style="margin-bottom:.4rem">
    <select name="insumo" class="crece" style="min-width:160px"><option value="">Insumo…</option>${opcInsumos}</select>
    <input name="cantidad" type="number" min="0" step="any" placeholder="Cantidad" style="width:110px">
    <input name="costo" type="number" min="0" step="100" placeholder="Valor total $" style="width:130px">
    <button type="button" class="peq icono peligro" data-acc="quitar" aria-label="Quitar">✕</button></div>`;
  abrirModal(`${cabeceraModal('Registrar gasto')}
    <form>
      <div class="campos">
        <div><label>Categoría</label><select name="categoria">${Object.entries(CATEGORIAS_GASTO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label>Fecha</label><input type="date" name="fecha" value="${hoyISO()}"></div>
        <div><label>Proveedor</label><select name="proveedor"><option value="">—</option>${proveedores.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>
      </div>
      <div class="campo" style="margin-top:.6rem"><label>Descripción</label><input name="descripcion" placeholder="Ej: mercado de la semana, recibo de luz"></div>
      <div class="campo" id="empleado-wrap" hidden>
        <label>Empleado</label>
        <select name="empleado"><option value="">Seleccione empleado…</option>${opcEmpleados}</select>
      </div>
      <div id="compra">
        <div class="etiqueta-seccion">Insumos comprados <span class="suave">(cantidad en g, ml o und)</span></div>
        <div id="lineas">${linea()}${linea()}</div>
        <button type="button" class="peq" data-acc="linea">+ Otra línea</button>
      </div>
      <div id="simple" hidden class="campo" style="margin-top:.6rem"><label>Valor</label><input name="valor" type="number" min="1" step="100"></div>
      <div class="campos" style="margin-top:.6rem">
        <div><label>Medio de pago</label><select name="medio">${['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TARJETA', 'TRANSFERENCIA', 'CREDITO'].map((m) => `<option value="${m}">${MEDIO[m]}</option>`).join('')}</select></div>
        <label class="check" style="align-self:flex-end"><input type="checkbox" name="caja"> Pagado con efectivo de la caja</label>
      </div>
      <div class="total"><span>Total</span><span id="total-gasto">${pesos(0)}</span></div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar gasto</button></div>
    </form>`, {
    linea: (_b, m) => $('#lineas', m).insertAdjacentHTML('beforeend', linea()),
    quitar: (b, m) => { b.closest('.linea-compra').remove(); recalcular(m); },
    input: (_e, m) => recalcular(m),
    change: (_e, m) => recalcular(m),
    submit: async (f, m, cerrar) => {
      const compra = f.categoria.value === 'COMPRA_INSUMOS';
      const items = compra ? $$('.linea-compra', m).map((l) => ({
        insumo_id: Number($('[name=insumo]', l).value), cantidad: Number($('[name=cantidad]', l).value), costo_total: Number($('[name=costo]', l).value)
      })).filter((x) => x.insumo_id && x.cantidad > 0) : [];
      if (compra && !items.length) throw new Error('Agregue al menos un insumo con su cantidad');
      if (f.categoria.value === 'NOMINA' && !f.empleado.value) throw new Error('Seleccione el empleado de la nómina');
      const valor = f.categoria.value === 'NOMINA' ? Number(f.valor.value || 0) : Number(f.valor.value);
      await api('/gastos', { method: 'POST', body: {
        categoria: f.categoria.value, fecha: f.fecha.value, proveedor_id: f.proveedor.value || null, empleado_id: f.categoria.value === 'NOMINA' ? Number(f.empleado.value) : null,
        descripcion: f.descripcion.value, valor, medio_pago: f.medio.value, pagado_de_caja: f.caja.checked, items
      } });
      cerrar(); toast('Gasto registrado', 'ok'); listo();
    }
  });
  function recalcular(m) {
    const compra = $('[name=categoria]', m).value === 'COMPRA_INSUMOS';
    const nomina = $('[name=categoria]', m).value === 'NOMINA';
    $('#compra', m).hidden = !compra;
    $('#simple', m).hidden = compra || nomina;
    $('#empleado-wrap', m).hidden = !nomina;
    const caja = $('[name=caja]', m).checked;
    $('[name=medio]', m).disabled = caja;
    if (caja) $('[name=medio]', m).value = 'EFECTIVO';
    let total = 0;
    if (compra) {
      total = $$('[name=costo]', m).reduce((s, i) => s + (Number(i.value) || 0), 0);
    } else if (nomina) {
      const empleadoSel = $('[name=empleado]', m);
      const emp = empleados.find((e) => String(e.id) === String(empleadoSel.value));
      total = emp ? Number(emp.salario) : Number($('[name=valor]', m).value) || 0;
    } else {
      total = Number($('[name=valor]', m).value) || 0;
    }
    $('#total-gasto', m).textContent = pesos(total);
  }
}

// ═══ VISTA: Menú (administración) ════════════════════════════════════════════
async function vistaMenu(el) {
  const [menu, insumos] = await Promise.all([api('/menu?todo=1'), api('/insumos')]);
  S.menuAdmin = { menu, insumos, recargar: () => vistaMenu(el) };
  // Productos del almuerzo que cambian cada día (proteínas, sopa, precio)
  const delDia = menu.find((c) => c.nombre === 'Almuerzo')?.productos.filter((p) => p.activo) || [];
  const opcionesInsumo = insumos.filter((i) => i.activo)
    .map((i) => `<option value="${i.id}">${esc(i.nombre)} (${esc(i.unidad)})</option>`).join('');
  const tarjetaDia = (p) => `
    <div class="tarjeta menu-dia">
      <h3>${esc(p.nombre)} de hoy</h3>
      <form class="campos" data-submit="guardarDia" data-id="${p.id}">
        <div style="grid-column: 1 / -1"><label>Descripción (sopa, acompañantes…)</label>
          <input name="descripcion" value="${esc(p.descripcion || '')}"></div>
        <div><label>Precio</label><input name="precio" type="number" min="0" step="100" value="${p.precio}" required></div>
        <button style="align-self:end">Guardar</button>
      </form>
      ${p.grupos.map((g) => `
        <fieldset class="grupo-op">
          <legend>${esc(g.nombre)} disponible hoy</legend>
          <div class="opciones-dia">${g.opciones.map((o) => `
            <label class="check"><input type="checkbox" data-opcion="${o.id}" ${o.activo ? 'checked' : ''}> ${esc(o.nombre)}</label>`).join('')}</div>
          ${g.opciones.some((o) => o.activo) ? '' : `<p class="negativo chico">Marque al menos una opción o no se podrá vender el ${esc(p.nombre)}.</p>`}
          <form class="fila" data-submit="nuevaOpcion" data-grupo="${g.id}" style="margin-top:.6rem">
            <input name="nombre" placeholder="Nueva, ej: Albóndigas" style="flex:2 1 180px">
            <select name="insumo_id" style="flex:1 1 170px"><option value="">Sin descontar inventario</option>${opcionesInsumo}</select>
            <input name="cantidad" type="number" min="0" step="any" placeholder="Cantidad" style="flex:0 1 110px">
            <button class="primario">+ Agregar</button>
          </form>
        </fieldset>`).join('')}
    </div>`;

  const total = menu.reduce((n, c) => n + c.productos.length, 0);
  const filaProducto = (p) => {
    const pc = p.precio ? (p.costo_base / p.precio) * 100 : NaN;
    const grupos = p.grupos.map((g) => `${esc(g.nombre)} (${g.opciones.filter((o) => o.activo).length})`).join(' · ');
    return `<tr class="${p.activo ? '' : 'suave'}" data-buscar="${esc((p.nombre + ' ' + (p.descripcion || '')).toLowerCase())}">
      <td><button type="button" class="enlace" data-acc="editarProducto" data-id="${p.id}"><strong>${esc(p.nombre)}</strong></button>
        ${p.activo ? '' : '<span class="chip anulado">inactivo</span>'}
        ${p.descripcion ? `<div class="chico suave">${esc(p.descripcion)}</div>` : ''}</td>
      <td class="chico">${grupos || '<span class="suave">—</span>'}</td>
      <td class="num">${pesos(p.precio)}</td>
      <td class="num">${pesos(p.costo_base)}</td>
      <td class="num ${pc > 40 ? 'negativo' : ''}">${pct(pc)}</td>
      <td class="derecha">${menuAcciones([
        { acc: 'editarProducto', id: p.id, texto: '✏️ Editar producto y opciones' },
        { acc: 'recetaProducto', id: p.id, texto: '🧾 Receta (inventario)' },
        { acc: 'activarProducto', id: p.id, texto: p.activo ? '⏸️ Desactivar (no se vende)' : '▶️ Activar', extra: `data-activo="${p.activo}"`, peligro: p.activo }
      ], p.nombre)}</td>
    </tr>`;
  };

  el.innerHTML = `
    <div class="titulo-vista"><h2>Menú</h2>
      <div class="fila">
        <button data-acc="nuevaCategoria">+ Categoría</button>
        <button class="primario" data-acc="nuevoProducto" ${menu.length ? '' : 'disabled title="Cree primero una categoría"'}>+ Producto</button>
      </div>
    </div>
    ${delDia.map(tarjetaDia).join('')}
    <div class="tarjeta">
      <div class="entre menu-cabecera">
        <h3>Carta <span class="suave chico">${menu.length} categorías · ${total} productos</span></h3>
        <input id="menu-buscar" type="search" placeholder="Buscar producto…" autocomplete="off" style="max-width:260px">
      </div>
      ${menu.length ? menu.map((c) => `
        <section class="menu-cat" data-cat="${c.id}">
          <div class="menu-cat-cab">
            <h3>${esc(c.nombre)} <span class="suave chico">${c.productos.length}</span>
              ${c.activo ? '' : '<span class="chip anulado">oculta en pedidos</span>'}</h3>
            ${menuAcciones([
              { acc: 'productoEnCategoria', id: c.id, texto: '➕ Agregar producto aquí' },
              { acc: 'editarCategoria', id: c.id, texto: '✏️ Renombrar / ordenar' },
              { acc: 'activarCategoria', id: c.id, texto: c.activo ? '🙈 Ocultar en pedidos' : '👁️ Mostrar en pedidos', extra: `data-activo="${c.activo}"` }
            ], c.nombre)}
          </div>
          ${c.productos.length ? `<div class="tabla-cont"><table>
            <thead><tr><th>Producto</th><th>Opciones para elegir</th><th class="num">Precio</th><th class="num">Costo</th><th class="num">% costo</th><th></th></tr></thead>
            <tbody>${c.productos.map(filaProducto).join('')}</tbody></table></div>`
          : `<p class="suave chico">Sin productos. <button type="button" class="enlace" data-acc="productoEnCategoria" data-id="${c.id}">Agregar el primero</button></p>`}
        </section>`).join('')
      : `<div class="vacio"><p>Este restaurante todavía no tiene menú.</p>
          <button class="primario" data-acc="nuevaCategoria">+ Crear la primera categoría</button></div>`}
      <p class="chico suave" style="margin-top:.8rem">El <b>costo</b> sale de la receta de cada producto y del costo promedio de sus insumos. En rojo, los que cuestan más del 40% de su precio.</p>
    </div>`;

  const producto = (id) => menu.flatMap((c) => c.productos).find((p) => p.id === Number(id));
  S.acc = {
    nuevaCategoria: () => modalCategoria(null),
    editarCategoria: (b) => modalCategoria(menu.find((c) => c.id === Number(b.dataset.id))),
    activarCategoria: async (b) => {
      await api(`/categorias/${b.dataset.id}`, { method: 'PATCH', body: { activo: b.dataset.activo !== 'true' } });
      vistaMenu(el);
    },
    nuevoProducto: () => modalProducto(null, menu[0]?.id),
    productoEnCategoria: (b) => modalProducto(null, Number(b.dataset.id)),
    editarProducto: (b) => modalProducto(producto(b.dataset.id)),
    recetaProducto: (b) => { const p = producto(b.dataset.id); modalReceta({ producto_id: p.id }, `Receta: ${p.nombre}`, () => vistaMenu(el)); },
    activarProducto: async (b) => {
      await api(`/productos/${b.dataset.id}`, { method: 'PATCH', body: { activo: b.dataset.activo !== 'true' } });
      vistaMenu(el);
    },
    guardarDia: async (f) => {
      await api(`/productos/${f.dataset.id}`, { method: 'PATCH', body: { descripcion: f.descripcion.value.trim(), precio: Number(f.precio.value) } });
      toast('Menú del día guardado', 'ok');
      vistaMenu(el);
    },
    nuevaOpcion: async (f) => {
      const nombre = f.nombre.value.trim();
      const insumo = Number(f.insumo_id.value);
      const cantidad = Number(f.cantidad.value);
      if (!nombre) throw new Error('Escriba el nombre de la opción');
      if (insumo && !(cantidad > 0)) throw new Error('Indique cuánto descuenta del inventario');
      const o = await api(`/grupos/${f.dataset.grupo}/opciones`, { method: 'POST', body: { nombre } });
      if (insumo) await api('/recetas', { method: 'PUT', body: { opcion_id: o.id, lineas: [{ insumo_id: insumo, cantidad }] } });
      toast(`${nombre} agregada`, 'ok');
      vistaMenu(el);
    },
    _input: (e) => {
      if (e.target.id !== 'menu-buscar') return;
      const q = e.target.value.trim().toLowerCase();
      $$('.menu-cat', el).forEach((sec) => {
        const filas = $$('tr[data-buscar]', sec);
        filas.forEach((tr) => { tr.hidden = !!q && !tr.dataset.buscar.includes(q); });
        sec.hidden = !!q && !filas.some((tr) => !tr.hidden);
      });
    },
    _change: (e) => {
      const id = e.target.dataset.opcion;
      if (!id) return;
      ejecutar(async () => {
        await api(`/opciones/${id}`, { method: 'PATCH', body: { activo: e.target.checked } });
        vistaMenu(el);
      });
    }
  };
}

// ─── Editor de menú: categoría ───────────────────────────────────────────────
function modalCategoria(c) {
  abrirModal(`
    ${cabeceraModal(c ? `Categoría: ${esc(c.nombre)}` : 'Nueva categoría')}
    <form>
      <div class="campos">
        <div><label>Nombre *</label><input name="nombre" value="${esc(c?.nombre || '')}" placeholder="Ej: Almuerzos, Bebidas" required autofocus></div>
        <div><label>Orden en el menú</label><input name="orden" type="number" min="0" value="${c?.orden ?? ''}" placeholder="Al final"></div>
      </div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">${c ? 'Guardar' : 'Crear categoría'}</button></div>
    </form>`, {
    submit: async (f, _m, cerrar) => {
      const body = { nombre: f.nombre.value, orden: f.orden.value };
      await api(c ? `/categorias/${c.id}` : '/categorias', { method: c ? 'PATCH' : 'POST', body });
      cerrar();
      toast(c ? 'Categoría guardada' : 'Categoría creada', 'ok');
      S.menuAdmin?.recargar();
    }
  });
}

// ─── Editor de menú: producto con sus grupos de opciones ─────────────────────
function modalProducto(p, categoriaId) {
  let prod = p;
  let cambio = false;
  const html = () => {
    const cats = S.menuAdmin.menu;
    const datos = `
      <form data-form="datos">
        <div class="campos">
          <div style="grid-column: 1 / -1"><label>Nombre *</label><input name="nombre" value="${esc(prod?.nombre || '')}" required ${prod ? '' : 'autofocus'}></div>
          <div><label>Categoría *</label><select name="categoria_id">${cats.map((c) =>
            `<option value="${c.id}" ${c.id === (prod?.categoria_id ?? categoriaId) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
          <div><label>Precio *</label><input name="precio" type="number" min="0" step="100" value="${prod?.precio ?? ''}" required></div>
          <div><label>Orden</label><input name="orden" type="number" min="0" value="${prod?.orden ?? ''}" placeholder="Al final"></div>
          <div><label>Impuesto (incluido en el precio)</label><select name="impuesto">${IMPUESTOS.map(([k, t]) =>
            `<option value="${k}" ${k === `${prod?.impuesto_tipo ?? 'INC'}|${Number(prod?.impuesto_tasa ?? 8)}` ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div style="grid-column: 1 / -1"><label>Descripción (lo que incluye)</label>
            <textarea name="descripcion" placeholder="Ej: Arroz, ensalada, papas y jugo natural">${esc(prod?.descripcion || '')}</textarea></div>
          ${prod ? `<label class="check" style="grid-column: 1 / -1"><input type="checkbox" name="activo" ${prod.activo ? 'checked' : ''}> Activo (se puede vender)</label>` : ''}
        </div>
        <div class="pie"><button class="primario">${prod ? 'Guardar datos' : 'Crear producto'}</button></div>
      </form>`;
    if (!prod) return `${cabeceraModal('Nuevo producto')}${datos}
      <p class="chico suave">Después de crearlo podrá agregarle opciones para elegir (proteína, bebida, término…) y su receta.</p>`;

    const grupos = prod.grupos.map((g) => `
      <div class="grupo-edit">
        <form class="grupo-cab" data-form="grupo" data-id="${g.id}">
          <input name="nombre" value="${esc(g.nombre)}" aria-label="Nombre del grupo" class="crece">
          <label class="mini">Mín<input name="min_sel" type="number" min="0" value="${g.min_sel}"></label>
          <label class="mini">Máx<input name="max_sel" type="number" min="1" value="${g.max_sel}"></label>
          <button class="peq">Guardar</button>
          <button type="button" class="peq peligro icono" data-acc="eliminarGrupo" data-id="${g.id}" title="Eliminar grupo" aria-label="Eliminar grupo">🗑️</button>
        </form>
        <div class="suave chico">${g.min_sel === 0 ? 'Opcional' : 'Obligatorio'} · ${g.max_sel === 1 ? 'se elige una' : `hasta ${g.max_sel}`}</div>
        ${g.opciones.map((o) => `
          <form class="opcion-fila ${o.activo ? '' : 'inactiva'}" data-form="opcion" data-id="${o.id}">
            <input name="nombre" value="${esc(o.nombre)}" aria-label="Opción" class="crece">
            <label class="mini">+ $<input name="precio_extra" type="number" min="0" step="100" value="${o.precio_extra}"></label>
            <label class="check mini-check" title="Disponible"><input type="checkbox" name="activo" ${o.activo ? 'checked' : ''}> Disp.</label>
            <button type="button" class="peq icono" data-acc="recetaOpcion" data-id="${o.id}" data-nombre="${esc(o.nombre)}" title="Receta de esta opción" aria-label="Receta">🧾</button>
            <button class="peq">Guardar</button>
          </form>`).join('')}
        <form class="opcion-fila nueva" data-form="nuevaOpcion" data-id="${g.id}">
          <input name="nombre" placeholder="Nueva opción, ej: Pechuga" class="crece">
          <label class="mini">+ $<input name="precio_extra" type="number" min="0" step="100" value="0"></label>
          <button class="peq primario">+ Agregar</button>
        </form>
      </div>`).join('');

    return `${cabeceraModal(`Producto: ${esc(prod.nombre)}`)}
      ${datos}
      <div class="seccion-modal">
        <div class="entre"><h4>Receta (descuenta del inventario)</h4>
          <button type="button" class="peq" data-acc="recetaProducto">🧾 Editar receta</button></div>
        <p class="chico suave">Costo actual de la receta: <b>${pesos(prod.costo_base)}</b>${prod.precio ? ` · ${pct((prod.costo_base / prod.precio) * 100)} del precio` : ''}</p>
      </div>
      <div class="seccion-modal">
        <h4>Opciones para elegir</h4>
        <p class="chico suave">Grupos que el mesero debe escoger al pedir (ej: <b>Proteína</b>, <b>Bebida</b>, <b>Término</b>). Mín 1 y Máx 1 = escoger una obligatoria. Mín 0 = opcional.</p>
        ${grupos || '<p class="suave chico">Este producto no tiene opciones.</p>'}
        <form class="fila nuevo-grupo" data-form="nuevoGrupo">
          <input name="nombre" placeholder="Nuevo grupo, ej: Proteína" class="crece">
          <label class="mini">Mín<input name="min_sel" type="number" min="0" value="1"></label>
          <label class="mini">Máx<input name="max_sel" type="number" min="1" value="1"></label>
          <button class="peq primario">+ Agregar grupo</button>
        </form>
      </div>
      <div class="pie"><button type="button" data-acc="cerrar">Listo</button></div>`;
  };

  // Recarga el menú y vuelve a pintar la ventana con los datos frescos
  const refrescar = async (m) => {
    cambio = true;
    S.menuAdmin.menu = await api('/menu?todo=1');
    if (prod) prod = S.menuAdmin.menu.flatMap((c) => c.productos).find((x) => x.id === prod.id) || prod;
    m.innerHTML = html();
  };

  abrirModal(html(), {
    submit: async (f, m) => {
      const v = (n) => f.elements[n]?.value;
      switch (f.dataset.form) {
        case 'datos': {
          const [impuesto_tipo, impuesto_tasa] = v('impuesto').split('|');
          const body = { nombre: v('nombre'), categoria_id: Number(v('categoria_id')), precio: v('precio'),
                         orden: v('orden'), descripcion: v('descripcion'), impuesto_tipo, impuesto_tasa: Number(impuesto_tasa) };
          if (prod) {
            body.activo = f.elements.activo.checked;
            await api(`/productos/${prod.id}`, { method: 'PATCH', body });
            toast('Producto guardado', 'ok');
          } else {
            prod = await api('/productos', { method: 'POST', body });
            toast('Producto creado. Ahora puede agregarle opciones y receta.', 'ok');
          }
          break;
        }
        case 'grupo':
          await api(`/grupos/${f.dataset.id}`, { method: 'PATCH', body: { nombre: v('nombre'), min_sel: v('min_sel'), max_sel: v('max_sel') } });
          toast('Grupo guardado', 'ok');
          break;
        case 'opcion':
          await api(`/opciones/${f.dataset.id}`, { method: 'PATCH', body: { nombre: v('nombre'), precio_extra: v('precio_extra'), activo: f.elements.activo.checked } });
          toast('Opción guardada', 'ok');
          break;
        case 'nuevaOpcion':
          await api(`/grupos/${f.dataset.id}/opciones`, { method: 'POST', body: { nombre: v('nombre'), precio_extra: v('precio_extra') } });
          break;
        case 'nuevoGrupo':
          await api(`/productos/${prod.id}/grupos`, { method: 'POST', body: { nombre: v('nombre'), min_sel: v('min_sel'), max_sel: v('max_sel') } });
          break;
      }
      await refrescar(m);
    },
    eliminarGrupo: async (b, m) => {
      if (!(await confirmar('¿Eliminar este grupo y sus opciones?', { boton: 'Eliminar', peligro: true }))) return;
      await api(`/grupos/${b.dataset.id}`, { method: 'DELETE' });
      await refrescar(m);
    },
    recetaProducto: (_b, m) => modalReceta({ producto_id: prod.id }, `Receta: ${prod.nombre}`, () => refrescar(m)),
    recetaOpcion: (b, m) => modalReceta({ opcion_id: Number(b.dataset.id) }, `Receta de la opción: ${b.dataset.nombre}`, () => refrescar(m))
  }, { ancho: true, alCerrar: () => { if (cambio) S.menuAdmin?.recargar(); } });
}

// ─── Editor de recetas (producto u opción) ───────────────────────────────────
async function modalReceta(dueno, titulo, listo) {
  const qs = dueno.producto_id ? `producto_id=${dueno.producto_id}` : `opcion_id=${dueno.opcion_id}`;
  const insumos = (S.menuAdmin?.insumos || await api('/insumos')).filter((i) => i.activo);
  let lineas = (await api(`/recetas?${qs}`)).map((l) => ({ insumo_id: l.insumo_id, cantidad: l.cantidad }));
  const insumo = (id) => insumos.find((i) => i.id === Number(id));
  const costo = () => lineas.reduce((t, l) => t + (Number(l.cantidad) || 0) * (insumo(l.insumo_id)?.costo_promedio || 0), 0);
  const leer = (m) => {
    lineas = $$('.receta-fila', m).map((r) => ({ insumo_id: Number(r.querySelector('select').value), cantidad: r.querySelector('input').value }));
  };
  const html = () => `
    ${cabeceraModal(esc(titulo))}
    <form>
      <p class="chico suave">Lo que se descuenta del inventario cada vez que se vende${dueno.opcion_id ? ' esta opción (además de la receta del producto)' : ''}.</p>
      <div class="receta-lista">${lineas.map((l) => `
        <div class="receta-fila">
          <select aria-label="Insumo">${insumos.map((i) => `<option value="${i.id}" ${i.id === Number(l.insumo_id) ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}</select>
          <input type="number" min="0" step="any" value="${esc(l.cantidad)}" aria-label="Cantidad" required>
          <span class="unidad">${esc(insumo(l.insumo_id)?.unidad || '')}</span>
          <button type="button" class="peq icono peligro" data-acc="quitar" aria-label="Quitar">✕</button>
        </div>`).join('') || '<p class="suave chico">Sin insumos. Agregue el primero.</p>'}</div>
      <button type="button" class="peq" data-acc="agregar" style="margin-top:.5rem" ${insumos.length ? '' : 'disabled'}>+ Agregar insumo</button>
      ${insumos.length ? '' : '<p class="chico negativo">No hay insumos. Créelos primero en Inventario.</p>'}
      <p class="entre" style="margin-top:.8rem"><span>Costo estimado</span><b>${pesos(costo())}</b></p>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar receta</button></div>
    </form>`;
  abrirModal(html(), {
    agregar: (_b, m) => { leer(m); lineas.push({ insumo_id: insumos[0].id, cantidad: '' }); m.innerHTML = html(); },
    quitar: (b, m) => {
      leer(m);
      lineas.splice($$('.receta-fila', m).indexOf(b.closest('.receta-fila')), 1);
      m.innerHTML = html();
    },
    change: (e, m) => { if (e.target.matches('.receta-fila select')) { leer(m); m.innerHTML = html(); } },
    submit: async (f, m, cerrar) => {
      leer(m);
      const usados = new Set();
      for (const l of lineas) {
        if (!(Number(l.cantidad) > 0)) throw new Error(`Indique la cantidad de ${insumo(l.insumo_id)?.nombre}`);
        if (usados.has(l.insumo_id)) throw new Error(`${insumo(l.insumo_id)?.nombre} está repetido`);
        usados.add(l.insumo_id);
      }
      await api('/recetas', { method: 'PUT', body: { ...dueno, lineas: lineas.map((l) => ({ insumo_id: l.insumo_id, cantidad: Number(l.cantidad) })) } });
      cerrar();
      toast('Receta guardada', 'ok');
      listo?.();
    }
  });
}

// ═══ VISTA: Reportes ═════════════════════════════════════════════════════════
async function vistaReportes(el) {
  S.rep = S.rep || { desde: hoyISO(), hasta: hoyISO() };
  const r = await api(`/reportes/resumen?desde=${S.rep.desde}&hasta=${S.rep.hasta}`);
  const t = r.totales;
  const pcCosto = t.ventas ? (t.costo_ventas / t.ventas) * 100 : NaN;
  const margenOp = t.ventas ? (t.utilidad_operativa / t.ventas) * 100 : NaN;
  const maxProd = Math.max(1, ...r.productos.map((p) => p.ventas));
  const atajo = (lbl, d, h) => `<button type="button" class="peq" data-acc="rango" data-d="${d}" data-h="${h}">${lbl}</button>`;
  const hoy = hoyISO();
  const inicioMes = hoy.slice(0, 8) + '01';
  el.innerHTML = `
    <div class="titulo-vista"><h2>Reportes y utilidades</h2></div>
    <form class="tarjeta fila" data-submit="filtrar" style="margin-bottom:1rem">
      <div><label>Desde</label><input type="date" name="desde" value="${r.desde}"></div>
      <div><label>Hasta</label><input type="date" name="hasta" value="${r.hasta}"></div>
      <button style="align-self:flex-end">Ver</button>
      <div class="fila" style="align-self:flex-end">${atajo('Hoy', hoy, hoy)}${atajo('Ayer', sumarDias(hoy, -1), sumarDias(hoy, -1))}${atajo('7 días', sumarDias(hoy, -6), hoy)}${atajo('Este mes', inicioMes, hoy)}</div>
    </form>
    <div class="kpis">
      <div class="kpi"><div class="t">Ventas</div><div class="v">${pesos(t.ventas)}</div><div class="s">${t.pedidos} pedidos · ticket prom. ${pesos(t.pedidos ? t.ventas / t.pedidos : 0)}</div></div>
      <div class="kpi"><div class="t">Costo de ventas (recetas)</div><div class="v">${pesos(t.costo_ventas)}</div><div class="s">${pct(pcCosto)} de las ventas</div></div>
      <div class="kpi"><div class="t">Utilidad bruta</div><div class="v">${pesos(t.utilidad_bruta)}</div></div>
      <div class="kpi"><div class="t">Mermas y ajustes</div><div class="v ${t.mermas > 0 ? 'negativo' : ''}">${pesos(t.mermas)}</div></div>
      <div class="kpi"><div class="t">Gastos operativos</div><div class="v">${pesos(t.gastos)}</div><div class="s">sin compras de insumos</div></div>
      <div class="kpi destacado"><div class="t">Utilidad operativa</div><div class="v">${pesos(t.utilidad_operativa)}</div><div class="s">margen ${pct(margenOp)}</div></div>
    </div>
    <div class="dos-col seccion">
      <div class="tarjeta tabla-cont"><h3>Platos más vendidos</h3><table>
        <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Ventas</th><th class="num">Margen</th></tr></thead>
        <tbody>${r.productos.map((p) => `<tr><td>${esc(p.nombre)}<div class="barra-dato" style="width:${(p.ventas / maxProd) * 100}%"></div></td>
          <td class="num">${p.cantidad}</td><td class="num">${pesos(p.ventas)}</td><td class="num">${pct(p.ventas ? ((p.ventas - p.costo) / p.ventas) * 100 : NaN)}</td></tr>`).join('')
          || '<tr><td colspan="4" class="suave">Sin ventas</td></tr>'}</tbody></table></div>
      <div>
        <div class="tarjeta"><h3>Por medio de pago</h3>${r.medios.map((m) => `<div class="subtotal"><span>${MEDIO[m.medio]}</span><span>${pesos(m.valor)}</span></div>`).join('') || '<p class="suave">—</p>'}</div>
        <div class="tarjeta"><h3>Por tipo de pedido</h3>${r.tipos.map((x) => `<div class="subtotal"><span>${TIPO[x.tipo]} (${x.pedidos})</span><span>${pesos(x.ventas)}</span></div>`).join('') || '<p class="suave">—</p>'}</div>
        <div class="tarjeta"><h3>Gastos por categoría</h3>${r.gastos.map((g) => `<div class="subtotal"><span>${CATEGORIAS_GASTO[g.categoria]}</span><span>${pesos(g.valor)}</span></div>`).join('') || '<p class="suave">—</p>'}
          <p class="chico suave">Las compras de insumos van al inventario; se vuelven costo cuando se vende el plato.</p></div>
      </div>
    </div>
    ${r.dias.length > 1 ? `<div class="tarjeta tabla-cont seccion"><h3>Por día</h3><table>
      <thead><tr><th>Fecha</th><th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Costo</th><th class="num">Mermas</th><th class="num">Gastos</th><th class="num">Utilidad</th></tr></thead>
      <tbody>${r.dias.map((d) => `<tr><td>${d.fecha.slice(0, 10)}</td><td class="num">${d.pedidos}</td><td class="num">${pesos(d.ventas)}</td>
        <td class="num">${pesos(d.costo_ventas)}</td><td class="num">${pesos(d.mermas)}</td><td class="num">${pesos(d.gastos)}</td>
        <td class="num ${d.utilidad_operativa < 0 ? 'negativo' : ''}"><b>${pesos(d.utilidad_operativa)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}`;

  S.acc = {
    filtrar: (f) => { S.rep = { desde: f.desde.value, hasta: f.hasta.value || f.desde.value }; vistaReportes(el); },
    rango: (b) => { S.rep = { desde: b.dataset.d, hasta: b.dataset.h }; vistaReportes(el); }
  };
}

// ═══ VISTA: Ajustes (usuarios, empleados, mesas, negocio) ───────────────
async function vistaAjustes(el) {
  const [usuarios, empleados, mesas, aj] = await Promise.all([api('/usuarios'), api('/empleados'), api('/mesas'), api('/ajustes')]);
  el.innerHTML = `
    <div class="titulo-vista"><h2>Ajustes</h2></div>
    <div class="admin-grid">
      <div class="tarjeta panel-admin">
        <div class="panel-head">
          <div>
            <span class="eyebrow">Acceso</span>
            <h3>Usuarios</h3>
          </div>
          <button class="primario peq" data-acc="nuevoUsuario">+ Crear</button>
        </div>
        <div class="tabla-cont"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>${usuarios.map((u) => `<tr class="${u.activo ? '' : 'suave'}">
          <td><strong>${esc(u.nombre)}</strong></td>
          <td>${esc(u.email)}</td>
          <td><span class="admin-badge">${ROL[u.rol]}</span></td>
          <td>${u.activo ? '<span class="state ok">Activo</span>' : '<span class="state off">Inactivo</span>'}</td>
          <td class="derecha">${menuAcciones([
            { acc: 'editarUsuario', id: u.id, texto: '✏️ Editar' },
            { acc: 'claveUsuario', id: u.id, texto: '🔑 Cambiar clave' },
            { acc: 'toggleUsuario', id: u.id, texto: u.activo ? '⏸️ Desactivar' : '▶️ Activar', extra: `data-activo="${u.activo}"` },
            { acc: 'eliminarUsuario', id: u.id, texto: '🗑️ Eliminar', peligro: true }
          ], u.nombre)}</td></tr>`).join('')}</tbody></table></div>
        <form data-submit="usuario" class="admin-form">
          <div class="etiqueta-seccion">Crear usuario</div>
          <div class="campos">
            <div><label>Nombre</label><input name="nombre" required></div>
            <div><label>Correo</label><input name="email" type="email" required></div>
            <div><label>Clave</label><input name="clave" type="password" minlength="6" required></div>
            <div><label>Rol</label><select name="rol">${Object.entries(ROL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          </div>
          <button class="primario" style="margin-top:.6rem">Guardar usuario</button>
        </form>
      </div>

      <div class="tarjeta panel-admin">
        <div class="panel-head">
          <div>
            <span class="eyebrow">Personal</span>
            <h3>Empleados y nómina</h3>
          </div>
          <button class="primario peq" data-acc="nuevoEmpleado">+ Agregar</button>
        </div>
        <div class="tabla-cont"><table><thead><tr><th>Nombre</th><th>Cargo</th><th>Salario</th><th>Estado</th><th></th></tr></thead>
        <tbody>${empleados.map((e) => `<tr class="${e.activo ? '' : 'suave'}">
          <td><strong>${esc(e.nombre)}</strong></td>
          <td>${esc(e.cargo || '—')}</td>
          <td>${pesos(e.salario)}</td>
          <td>${e.activo ? '<span class="state ok">Activo</span>' : '<span class="state off">Inactivo</span>'}</td>
          <td class="derecha">${menuAcciones([
            { acc: 'editarEmpleado', id: e.id, texto: '✏️ Editar' },
            { acc: 'toggleEmpleado', id: e.id, texto: e.activo ? '⏸️ Desactivar' : '▶️ Activar', extra: `data-activo="${e.activo}"` },
            { acc: 'eliminarEmpleado', id: e.id, texto: '🗑️ Eliminar', peligro: true }
          ], e.nombre)}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin empleados registrados.</td></tr>'}</tbody></table></div>
        <form data-submit="empleado" class="admin-form">
          <div class="etiqueta-seccion">Agregar empleado</div>
          <div class="campos">
            <div><label>Nombre</label><input name="nombre" required></div>
            <div><label>Cargo</label><input name="cargo"></div>
            <div><label>Salario</label><input name="salario" type="number" min="0" step="1000" required></div>
          </div>
          <button class="primario" style="margin-top:.6rem">Guardar empleado</button>
        </form>
      </div>
    </div>

    <div class="tarjeta">
      <h3>Mesas</h3>
      <div class="fila">${mesas.map((m) => `<span class="chip abierto" style="font-size:.85rem">${esc(m.nombre)}
        <button class="peq icono" style="min-height:0;padding:0 .2rem;border:0;background:none" data-acc="quitarMesa" data-id="${m.id}" aria-label="Quitar">✕</button></span>`).join('')}</div>
      <form data-submit="mesa" class="fila seccion"><input name="nombre" placeholder="Ej: Mesa 9, Terraza 1" required style="max-width:240px"><button>+ Mesa</button></form>
    </div>
    <div class="tarjeta">
      <h3>Apariencia</h3>
      <p class="chico suave">Colores e ícono de este restaurante. Se ven en todos sus equipos.</p>
      <div class="temas">${Object.entries(TEMAS).map(([k, t]) => `
        <button type="button" class="tema-opcion" data-acc="elegirTema" data-tema="${k}" title="${t.nombre}">
          <span class="tema-muestra" style="background:linear-gradient(135deg, ${t.barra} 0 50%, ${t.primario} 50% 75%, ${t.acento} 75%)"></span>
          <span>${t.icono ? t.icono + ' ' : ''}${t.nombre}</span>
        </button>`).join('')}</div>
      <form data-submit="apariencia" id="form-tema">
        <div class="campos">
          <div><label>Color principal (botones)</label><input type="color" name="tema_primario" value="${temaDe(aj).primario}"></div>
          <div><label>Color de acento (menú activo)</label><input type="color" name="tema_acento" value="${temaDe(aj).acento}"></div>
          <div><label>Menú lateral (arriba)</label><input type="color" name="tema_barra" value="${temaDe(aj).barra}"></div>
          <div><label>Menú lateral (abajo)</label><input type="color" name="tema_barra2" value="${temaDe(aj).barra2}"></div>
          <div><label>Ícono junto al nombre</label><input name="tema_icono" value="${esc(temaDe(aj).icono)}" maxlength="4" placeholder="Ej: 🔥"></div>
        </div>
        <div class="fila" style="margin-top:.6rem">
          <button class="primario">Guardar apariencia</button>
          <button type="button" data-acc="deshacerTema">Deshacer cambios</button>
        </div>
      </form>
    </div>
    <div class="tarjeta">
      <h3>Datos del negocio (tickets)</h3>
      <form data-submit="negocio">
        <div class="campos">
          <div><label>Nombre</label><input name="nombre_negocio" value="${esc(aj.nombre_negocio || '')}"></div>
          <div><label>Teléfono</label><input name="telefono" value="${esc(aj.telefono || '')}"></div>
          <div><label>Dirección</label><input name="direccion" value="${esc(aj.direccion || '')}"></div>
          <div><label>Ciudad (para el mapa de domicilios)</label><input name="ciudad" value="${esc(aj.ciudad || '')}" placeholder="Ej: Bello, Antioquia"></div>
          <div><label>Costo de domicilio por defecto</label><input name="costo_envio" type="number" min="0" step="500" value="${esc(aj.costo_envio || 0)}"></div>
        </div>
        <div class="campo" style="margin-top:.6rem"><label>Mensaje al pie del ticket</label><input name="pie_ticket" value="${esc(aj.pie_ticket || '')}"></div>
        <div class="campos" style="margin-top:.6rem">
          <div><label>Ancho del papel de la impresora</label><select name="ancho_ticket">
            <option value="80" ${aj.ancho_ticket !== '58' ? 'selected' : ''}>80 mm (estándar)</option>
            <option value="58" ${aj.ancho_ticket === '58' ? 'selected' : ''}>58 mm (pequeña)</option></select></div>
          <div><label>Propina sugerida en la cuenta (%)</label><input name="propina_sugerida" type="number" min="0" max="30" step="1" value="${esc(aj.propina_sugerida || 0)}"></div>
        </div>
        <p class="chico suave">Con propina en 0 no se muestra. Si la usa, la cuenta incluye el aviso de que es voluntaria.</p>
        <button class="primario">Guardar</button>
      </form>
    </div>`;

  const modalUsuario = (u, listo) => abrirModal(`${cabeceraModal(u ? 'Editar usuario' : 'Crear usuario')}
    <form>
      <div class="campos">
        <div><label>Nombre</label><input name="nombre" required value="${esc(u?.nombre || '')}" autofocus></div>
        <div><label>Correo</label><input name="email" type="email" required value="${esc(u?.email || '')}"></div>
        <div><label>Rol</label><select name="rol">${Object.entries(ROL).map(([k, v]) => `<option value="${k}" ${u?.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      ${u ? '<div class="campo"><label>Nueva clave (opcional)</label><input name="clave" type="password" minlength="6" placeholder="Si deja vacío no cambia la clave"></div>' : '<div class="campo"><label>Clave</label><input name="clave" type="password" minlength="6" required></div>'}
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button></div>
    </form>`, {
    submit: async (f, _m, cerrar) => {
      const body = { nombre: f.nombre.value, email: f.email.value, rol: f.rol.value };
      if (f.clave.value.trim()) body.clave = f.clave.value.trim();
      if (u) await api(`/usuarios/${u.id}`, { method: 'PATCH', body });
      else await api('/usuarios', { method: 'POST', body: { ...body, clave: f.clave.value.trim() } });
      cerrar(); toast(u ? 'Usuario actualizado' : 'Usuario creado', 'ok'); listo();
    }
  });

  const modalEmpleado = (e, listo) => abrirModal(`${cabeceraModal(e ? 'Editar empleado' : 'Agregar empleado')}
    <form>
      <div class="campos">
        <div><label>Nombre</label><input name="nombre" required value="${esc(e?.nombre || '')}" autofocus></div>
        <div><label>Cargo</label><input name="cargo" value="${esc(e?.cargo || '')}"></div>
        <div><label>Salario</label><input name="salario" type="number" min="0" step="1000" required value="${esc(e?.salario ?? '')}"></div>
      </div>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button></div>
    </form>`, {
    submit: async (f, _m, cerrar) => {
      const body = { nombre: f.nombre.value, cargo: f.cargo.value, salario: Number(f.salario.value) };
      if (e) await api(`/empleados/${e.id}`, { method: 'PATCH', body });
      else await api('/empleados', { method: 'POST', body });
      cerrar(); toast(e ? 'Empleado actualizado' : 'Empleado guardado', 'ok'); listo();
    }
  });

  S.acc = {
    usuario: async (f) => {
      await api('/usuarios', { method: 'POST', body: { nombre: f.nombre.value, email: f.email.value, clave: f.clave.value, rol: f.rol.value } });
      toast('Usuario guardado', 'ok'); vistaAjustes(el);
    },
    nuevoUsuario: () => modalUsuario(null, () => vistaAjustes(el)),
    editarUsuario: (b) => {
      const u = usuarios.find((x) => String(x.id) === String(b.dataset.id));
      modalUsuario(u, () => vistaAjustes(el));
    },
    claveUsuario: async (b) => {
      const id = Number(b.dataset.id);
      const clave = await confirmar('Escriba la nueva contraseña para este usuario.', { boton: 'Guardar clave', campo: 'Nueva clave' });
      if (!clave) return;
      await api(`/usuarios/${id}`, { method: 'PATCH', body: { clave } });
      toast('Clave actualizada', 'ok'); vistaAjustes(el);
    },
    toggleUsuario: async (b) => { await api(`/usuarios/${b.dataset.id}`, { method: 'PATCH', body: { activo: b.dataset.activo !== 'true' } }); vistaAjustes(el); },
    eliminarUsuario: async (b) => {
      const confirmado = await confirmar('¿Desea eliminar este usuario? Quedará inactivo.', { boton: 'Eliminar', peligro: true });
      if (!confirmado) return;
      await api(`/usuarios/${b.dataset.id}`, { method: 'DELETE' });
      vistaAjustes(el);
    },
    empleado: async (f) => {
      await api('/empleados', { method: 'POST', body: { nombre: f.nombre.value, cargo: f.cargo.value, salario: Number(f.salario.value) } });
      toast('Empleado guardado', 'ok'); vistaAjustes(el);
    },
    nuevoEmpleado: () => modalEmpleado(null, () => vistaAjustes(el)),
    editarEmpleado: (b) => {
      const e = empleados.find((x) => String(x.id) === String(b.dataset.id));
      modalEmpleado(e, () => vistaAjustes(el));
    },
    toggleEmpleado: async (b) => { await api(`/empleados/${b.dataset.id}`, { method: 'PATCH', body: { activo: b.dataset.activo !== 'true' } }); vistaAjustes(el); },
    eliminarEmpleado: async (b) => {
      const confirmado = await confirmar('¿Desea eliminar este empleado? Quedará inactivo.', { boton: 'Eliminar', peligro: true });
      if (!confirmado) return;
      await api(`/empleados/${b.dataset.id}`, { method: 'DELETE' });
      vistaAjustes(el);
    },
    mesa: async (f) => { await api('/mesas', { method: 'POST', body: { nombre: f.nombre.value } }); vistaAjustes(el); },
    quitarMesa: async (b) => { await api(`/mesas/${b.dataset.id}`, { method: 'DELETE' }); vistaAjustes(el); },
    elegirTema: (b) => {
      const t = TEMAS[b.dataset.tema];
      const f = $('#form-tema');
      f.tema_primario.value = t.primario; f.tema_acento.value = t.acento;
      f.tema_barra.value = t.barra; f.tema_barra2.value = t.barra2; f.tema_icono.value = t.icono;
      aplicarTema(t);
    },
    deshacerTema: () => vistaAjustes(el),
    _input: (e) => {
      const f = e.target.form;
      if (f?.id !== 'form-tema') return;
      aplicarTema({ primario: f.tema_primario.value, acento: f.tema_acento.value, barra: f.tema_barra.value, barra2: f.tema_barra2.value });
    },
    apariencia: async (f) => {
      const body = Object.fromEntries(new FormData(f));
      await api('/ajustes', { method: 'PUT', body });
      S.ajustes = await api('/ajustes');
      aplicarTema(temaDe(S.ajustes));
      almacen.guardar('pos_tema', temaDe(S.ajustes));
      pintarMarca();
      toast('Apariencia guardada', 'ok');
    },
    negocio: async (f) => {
      const body = Object.fromEntries(new FormData(f));
      await api('/ajustes', { method: 'PUT', body });
      S.ajustes = await api('/ajustes');
      pintarMarca();
      toast('Datos guardados', 'ok');
    }
  };
}

// ═══ VISTA: Restaurantes (solo superadministrador) ═══════════════════════════
async function vistaRestaurantes(el) {
  const lista = await api('/superadmin/restaurantes');
  el.innerHTML = `
    <div class="titulo-vista"><h2>Restaurantes</h2>
      <span class="suave">Ahora estás en: <b>${esc(S.usuario.restaurante || '')}</b></span></div>
    <div class="tarjeta tabla-cont"><table>
      <thead><tr><th>#</th><th>Restaurante</th><th>Ciudad</th><th class="num">Usuarios</th><th class="num">Pedidos</th><th>Último pedido</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((r) => `<tr class="${r.activo ? '' : 'suave'}">
        <td>${r.id}</td>
        <td><strong>${esc(r.nombre)}</strong> ${r.id === S.usuario.restaurante_id ? '<span class="chip abierto">aquí estás</span>' : ''}</td>
        <td>${esc(r.ciudad || '—')}</td>
        <td class="num">${r.usuarios}</td><td class="num">${r.pedidos}</td>
        <td>${r.ultimo_pedido ? fechaHora(r.ultimo_pedido) : '—'}</td>
        <td>${r.activo ? '<span class="state ok">Activo</span>' : '<span class="state off">Inactivo</span>'}</td>
        <td class="derecha">${menuAcciones([
          { acc: 'entrar', id: r.id, texto: '🚪 Entrar a administrarlo' },
          { acc: 'activar', id: r.id, texto: r.activo ? '⏸️ Desactivar' : '▶️ Activar', peligro: r.activo, extra: `data-activo="${r.activo}"` }
        ], r.nombre)}</td></tr>`).join('')}</tbody></table></div>

    <form class="tarjeta" data-submit="crear">
      <h3>Nuevo restaurante</h3>
      <div class="campos">
        <div><label>Nombre *</label><input name="nombre" required></div>
        <div><label>Ciudad</label><input name="ciudad" placeholder="Ej: Medellín, Antioquia"></div>
        <div><label>Dirección</label><input name="direccion"></div>
        <div><label>Teléfono</label><input name="telefono"></div>
        <div><label>Número de mesas</label><input name="mesas" type="number" min="0" max="50" value="6"></div>
        <div><label>Copiar el menú de</label><select name="copiar_menu_de">
          <option value="">— Empezar sin menú —</option>
          ${lista.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('')}</select></div>
      </div>
      <div class="etiqueta-seccion">Administrador del restaurante</div>
      <div class="campos">
        <div><label>Nombre *</label><input name="admin_nombre" required></div>
        <div><label>Correo *</label><input name="admin_email" type="email" required></div>
        <div><label>Clave *</label><input name="admin_clave" type="password" minlength="6" required></div>
      </div>
      <p class="chico suave">Si copia el menú de otro restaurante, se copian productos, opciones, recetas e insumos (stock en 0); ventas, clientes y usuarios no. Para cargar una plantilla (ej. asados al barril) deje "Empezar sin menú".</p>
      <button class="primario">Crear restaurante</button>
    </form>`;

  S.acc = {
    crear: async (f) => {
      await api('/superadmin/restaurantes', { method: 'POST', body: {
        nombre: f.nombre.value, ciudad: f.ciudad.value, direccion: f.direccion.value, telefono: f.telefono.value,
        mesas: f.mesas.value, copiar_menu_de: f.copiar_menu_de.value || null,
        admin: { nombre: f.admin_nombre.value, email: f.admin_email.value, clave: f.admin_clave.value } } });
      toast(`Restaurante "${f.nombre.value}" creado`, 'ok');
      vistaRestaurantes(el);
    },
    entrar: async (b) => {
      const s = await api(`/superadmin/restaurantes/${b.dataset.id}/entrar`, { method: 'POST' });
      // Sesión nueva dentro del otro restaurante: se olvida todo lo del anterior
      S.usuario = s;
      almacen.guardar('pos_usuario', s);
      Object.assign(S, { menu: null, catActiva: null, ajustes: null, pedido: null, carrito: [], carritoClave: null, mesas: null });
      S.cocinaVistos.clear();
      S.avisoListo.clear();
      cerrarEventos();
      history.replaceState(null, '', '#pedidos');
      await iniciar();
      toast(`Ahora estás en ${s.restaurante}`, 'ok');
    },
    activar: async (b) => {
      const activo = b.dataset.activo === 'true';
      if (activo && !(await confirmar('¿Desactivar este restaurante? Sus usuarios no podrán entrar hasta que lo active de nuevo.', { boton: 'Desactivar', peligro: true }))) return;
      await api(`/superadmin/restaurantes/${b.dataset.id}`, { method: 'PATCH', body: { activo: !activo } });
      vistaRestaurantes(el);
    }
  };
}

// ═══ Control de personal ═════════════════════════════════════════════════════
const duracion = (horas) => {
  const min = Math.max(0, Math.round(Number(horas) * 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};
const hm = (t) => String(t || '').slice(0, 5);
// timestamptz → valor de <input type="datetime-local"> en hora de Colombia
const aLocal = (d) => (d ? new Date(d).toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 16).replace(' ', 'T') : '');
const fechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const lunesDe = (iso) => { const d = new Date(iso + 'T12:00:00'); return sumarDias(iso, -((d.getDay() + 6) % 7)); };

// Botón de entrada/salida del propio trabajador (menú lateral y barra del celular)
async function actualizarReloj() {
  if (!S.usuario) return;
  try { S.miAsistencia = await api('/asistencia/mia'); } catch { return; }
  const { abierta, turnos } = S.miAsistencia;
  const turno = turnos.length ? `Turno hoy ${turnos.map((t) => `${hm(t.hora_inicio)}–${hm(t.hora_fin)}`).join(', ')}` : 'Sin turno programado hoy';
  const b = $('#reloj');
  b.hidden = false;
  b.classList.toggle('activo', !!abierta);
  b.innerHTML = abierta
    ? `<span class="punto"></span><span class="txt"><b>Marcar salida</b><small>Trabajando desde ${hora(abierta.entrada)}</small></span>`
    : `<span class="punto"></span><span class="txt"><b>Marcar entrada</b><small>${esc(turno)}</small></span>`;
  b.title = abierta ? `Entrada a las ${hora(abierta.entrada)}` : turno;
  const m = $('#reloj-movil');
  m.hidden = false;
  m.classList.toggle('activo', !!abierta);
  m.textContent = abierta ? '⏹ Salida' : '▶ Entrada';
}

// ─── Ubicación al marcar entrada/salida ─────────────────────────────────────
// Pide la ubicación del celular (solo en el momento de marcar)
function obtenerUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation || !window.isSecureContext) {
      return reject(new Error('Este navegador no permite tomar la ubicación (la app debe abrirse con https).'));
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      (e) => reject(new Error({
        1: 'No diste permiso de ubicación. Toca el candado 🔒 junto a la dirección de la página → Ubicación → Permitir, y vuelve a intentar.',
        2: 'No se pudo obtener la ubicación. Activa el GPS / ubicación del celular y vuelve a intentar.',
        3: 'La ubicación tardó demasiado. Sal a un lugar con mejor señal y vuelve a intentar.'
      }[e.code] || 'No se pudo obtener la ubicación.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
const exigeUbicacion = () => !!(S.ajustes?.ubicacion_lat && S.ajustes?.ubicacion_lng && S.ajustes?.exigir_ubicacion !== 'false');
const metros = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);
// Etiqueta "📍 a 35 m" (verde) o "📍 a 2,3 km · fuera" (roja), con link al mapa
function chipUbicacion(lat, lng, precision, dist, radio) {
  if (lat == null) return '';
  const fuera = dist != null && dist > radio;
  const txt = dist == null ? 'ver ubicación' : `a ${metros(dist)}${fuera ? ' · fuera' : ''}`;
  const imprecisa = precision > 100 ? ` (±${metros(precision)})` : '';
  return `<a class="ubic ${dist == null ? '' : fuera ? 'fuera' : 'dentro'}" target="_blank" rel="noopener"
    href="https://www.google.com/maps?q=${lat},${lng}" title="Precisión ±${metros(precision || 0)}">📍 ${txt}${imprecisa}</a>`;
}

// Ventana para fijar la ubicación del restaurante y el radio permitido
function modalUbicacionLocal(listo) {
  const aj = S.ajustes || {};
  abrirModal(`
    ${cabeceraModal('📍 Ubicación del restaurante')}
    <form>
      <p class="chico suave">Párese dentro del restaurante y toque <b>Usar mi ubicación actual</b>. Al marcar entrada o salida se guarda dónde estaba
        cada trabajador y a qué distancia del restaurante.</p>
      <button type="button" data-acc="aqui" class="primario" style="width:100%">📍 Usar mi ubicación actual</button>
      <div class="campos" style="margin-top:.8rem">
        <div><label>Latitud</label><input name="lat" value="${esc(aj.ubicacion_lat || '')}" inputmode="decimal" placeholder="6.33"></div>
        <div><label>Longitud</label><input name="lng" value="${esc(aj.ubicacion_lng || '')}" inputmode="decimal" placeholder="-75.55"></div>
        <div><label>Radio permitido (metros)</label><input name="radio" type="number" min="20" step="10" value="${esc(aj.ubicacion_radio || 150)}"></div>
        <label class="check" style="grid-column:1/-1"><input type="checkbox" name="exigir" ${aj.exigir_ubicacion === 'false' ? '' : 'checked'}>
          Exigir la ubicación para poder marcar (si la niegan, no pueden marcar)</label>
      </div>
      <p class="chico" id="ubic-estado">${aj.ubicacion_lat ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${aj.ubicacion_lat},${aj.ubicacion_lng}">Ver ubicación guardada en el mapa</a>` : 'Aún no hay ubicación guardada.'}</p>
      <div class="pie">
        ${aj.ubicacion_lat ? '<button type="button" class="peligro" data-acc="quitar" style="margin-right:auto">Quitar ubicación</button>' : ''}
        <button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button>
      </div>
    </form>`, {
    aqui: async (_b, m) => {
      $('#ubic-estado', m).textContent = 'Obteniendo ubicación…';
      const u = await obtenerUbicacion();
      const f = $('form', m);
      f.lat.value = u.lat.toFixed(6);
      f.lng.value = u.lng.toFixed(6);
      $('#ubic-estado', m).innerHTML = `Ubicación tomada (precisión ±${metros(u.precision)}). <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${u.lat},${u.lng}">Ver en el mapa</a> y luego Guardar.`;
    },
    quitar: async (_b, _m, cerrar) => {
      await api('/ajustes', { method: 'PUT', body: { ubicacion_lat: '', ubicacion_lng: '' } });
      S.ajustes = await api('/ajustes');
      cerrar(); toast('Ubicación quitada', 'ok'); listo();
    },
    submit: async (f, _m, cerrar) => {
      const lat = Number(f.lat.value), lng = Number(f.lng.value);
      if (!f.lat.value || !f.lng.value || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) throw new Error('Tome o escriba una latitud y longitud válidas');
      await api('/ajustes', { method: 'PUT', body: {
        ubicacion_lat: String(lat), ubicacion_lng: String(lng),
        ubicacion_radio: String(Math.max(20, Number(f.radio.value) || 150)), exigir_ubicacion: f.exigir.checked ? 'true' : 'false' } });
      S.ajustes = await api('/ajustes');
      cerrar(); toast('Ubicación del restaurante guardada', 'ok'); listo();
    }
  });
}

async function marcarReloj() {
  const abierta = S.miAsistencia?.abierta;
  const ahora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
  const aviso = exigeUbicacion() ? ' Se registrará tu ubicación actual.' : '';
  const ok = await confirmar(abierta
    ? `¿Marcar tu salida ahora (${ahora})? Entraste a las ${hora(abierta.entrada)}.${aviso}`
    : `¿Marcar tu entrada ahora (${ahora})?${aviso}`, { boton: abierta ? 'Marcar salida' : 'Marcar entrada' });
  if (!ok) return;
  let ubic = {};
  try {
    toast('📍 Obteniendo tu ubicación…');
    ubic = await obtenerUbicacion();
  } catch (e) {
    if (exigeUbicacion()) throw e;
  }
  const r = await api(abierta ? '/asistencia/salida' : '/asistencia/entrada', { method: 'POST', body: ubic });
  const radio = Number(S.ajustes?.ubicacion_radio) || 150;
  const lugar = r.distancia == null ? '' : r.distancia > radio ? ` · ⚠️ estás a ${metros(r.distancia)} del restaurante` : ` · 📍 en el restaurante`;
  toast((abierta ? `Salida registrada: ${hora(r.salida)} · ${duracion((new Date(r.salida) - new Date(r.entrada)) / 3600000)}` : `Entrada registrada: ${hora(r.entrada)}`) + lugar,
    r.distancia > radio ? 'error' : 'ok', 6000);
  actualizarReloj();
}
$('#reloj').addEventListener('click', () => ejecutar(marcarReloj));
$('#reloj-movil').addEventListener('click', () => ejecutar(marcarReloj));

// Ventana para registrar o corregir una entrada/salida
function modalAsistencia(reg, personas, listo) {
  abrirModal(`
    ${cabeceraModal(reg?.id ? `Corregir registro de ${esc(reg.nombre)}` : 'Registro manual de entrada/salida')}
    <form>
      <div class="campos">
        ${reg?.id ? '' : `<div style="grid-column:1/-1"><label>Trabajador *</label><select name="usuario_id" required>
          ${personas.map((p) => `<option value="${p.id}" ${p.id === reg?.usuario_id ? 'selected' : ''}>${esc(p.nombre)} · ${ROL[p.rol]}</option>`).join('')}</select></div>`}
        <div><label>Entrada *</label><input name="entrada" type="datetime-local" value="${aLocal(reg?.entrada) || aLocal(new Date())}" required></div>
        <div><label>Salida</label><input name="salida" type="datetime-local" value="${aLocal(reg?.salida)}"></div>
        <div style="grid-column:1/-1"><label>Motivo / nota</label><input name="nota" value="${esc(reg?.nota || '')}" placeholder="Ej: olvidó marcar la salida"></div>
      </div>
      <p class="chico suave">Deje la salida vacía si la persona sigue trabajando. Las correcciones quedan marcadas con su nombre.</p>
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button></div>
    </form>`, {
    submit: async (f, _m, cerrar) => {
      const body = { entrada: f.entrada.value, salida: f.salida.value || null, nota: f.nota.value };
      if (reg?.id) await api(`/asistencia/${reg.id}`, { method: 'PATCH', body });
      else await api('/asistencia', { method: 'POST', body: { ...body, usuario_id: Number(f.usuario_id.value) } });
      cerrar();
      toast('Registro guardado', 'ok');
      listo();
    }
  });
}

// Ventana para programar turnos (varios días a la vez) o editar uno
function modalHorario({ turno, usuarioId, fecha, lunes, personas }, listo) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  abrirModal(`
    ${cabeceraModal(turno ? 'Editar turno' : 'Programar turno')}
    <form>
      <div class="campos">
        ${turno ? `<div style="grid-column:1/-1"><b>${esc(personas.find((p) => p.id === turno.usuario_id)?.nombre || '')}</b> · ${fechaLarga(turno.fecha)}</div>`
        : `<div style="grid-column:1/-1"><label>Trabajador *</label><select name="usuario_id">
            ${personas.map((p) => `<option value="${p.id}" ${p.id === usuarioId ? 'selected' : ''}>${esc(p.nombre)} · ${ROL[p.rol]}</option>`).join('')}</select></div>
          <div style="grid-column:1/-1"><label>Días</label><div class="dias-semana">${dias.map((d) => `
            <label class="check"><input type="checkbox" name="fechas" value="${d}" ${d === fecha ? 'checked' : ''}> ${fechaLarga(d)}</label>`).join('')}</div></div>`}
        <div><label>Entra *</label><input name="hora_inicio" type="time" value="${hm(turno?.hora_inicio) || '08:00'}" required></div>
        <div><label>Sale *</label><input name="hora_fin" type="time" value="${hm(turno?.hora_fin) || '16:00'}" required></div>
        <div style="grid-column:1/-1"><label>Nota</label><input name="nota" value="${esc(turno?.nota || '')}" placeholder="Ej: cubre cocina"></div>
      </div>
      <div class="pie">
        ${turno ? '<button type="button" class="peligro" data-acc="borrar" style="margin-right:auto">Eliminar turno</button>' : ''}
        <button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Guardar</button>
      </div>
    </form>`, {
    borrar: async (_b, _m, cerrar) => {
      await api(`/horarios/${turno.id}`, { method: 'DELETE' });
      cerrar(); listo();
    },
    submit: async (f, _m, cerrar) => {
      const body = { hora_inicio: f.hora_inicio.value, hora_fin: f.hora_fin.value, nota: f.nota.value };
      if (turno) await api(`/horarios/${turno.id}`, { method: 'PATCH', body });
      else {
        const fechas = $$('input[name="fechas"]:checked', f).map((x) => x.value);
        await api('/horarios', { method: 'POST', body: { ...body, usuario_id: Number(f.usuario_id.value), fechas } });
      }
      cerrar();
      toast('Turno guardado', 'ok');
      listo();
    }
  });
}

async function vistaPersonal(el) {
  const P = S.personal ||= { tab: 'hoy', desde: hoyISO(), hasta: hoyISO(), usuario_id: '', lunes: lunesDe(hoyISO()) };
  const { tolerancia, radio, personas } = await api('/personal/hoy');
  const pestañas = `<div class="tabs">${[['hoy', '🟢 Hoy'], ['registro', '🕒 Entradas y salidas'], ['horarios', '📅 Horarios']]
    .map(([k, t]) => `<button class="${P.tab === k ? 'activo' : ''}" data-acc="tab" data-tab="${k}">${t}</button>`).join('')}</div>`;
  const recargar = () => vistaPersonal(el);
  const acc = {
    tab: (b) => { P.tab = b.dataset.tab; recargar(); },
    manual: () => modalAsistencia(null, personas, recargar),
    ubicacionLocal: () => modalUbicacionLocal(recargar)
  };
  const botonUbic = `<button data-acc="ubicacionLocal" title="Ubicación del restaurante">📍 ${S.ajustes?.ubicacion_lat ? 'Ubicación' : 'Configurar ubicación'}</button>`;

  if (P.tab === 'hoy') {
    const ahora = new Date();
    const estado = (p) => {
      const turnos = p.turnos.map((t) => ({ ...t, ini: new Date(`${hoyISO()}T${hm(t.hora_inicio)}:00-05:00`) }));
      const primero = turnos[0];
      const tarde = primero && p.primera_entrada ? Math.round((new Date(p.primera_entrada) - primero.ini) / 60000) : 0;
      const tardeTxt = tarde > tolerancia ? ` · <b class="negativo">llegó ${tarde} min tarde</b>` : '';
      if (p.trabajando_desde) return { clase: 'ok', orden: 0, txt: `🟢 Trabajando desde ${hora(p.trabajando_desde)} (${duracion((ahora - new Date(p.trabajando_desde)) / 3600000)})${tardeTxt}` };
      if (p.primera_entrada) return { clase: 'salio', orden: 2, txt: `⚪ Salió a las ${hora(p.ultima_salida)} · ${duracion(p.horas_hoy)} hoy${tardeTxt}` };
      if (primero && ahora > new Date(primero.ini.getTime() + tolerancia * 60000)) return { clase: 'falta', orden: 1, txt: `🔴 No ha llegado · debía entrar a las ${hm(primero.hora_inicio)}` };
      if (primero) return { clase: 'espera', orden: 3, txt: `🕒 Entra a las ${hm(primero.hora_inicio)}` };
      return { clase: 'libre', orden: 4, txt: 'Sin turno hoy' };
    };
    const lista = personas.map((p) => ({ ...p, e: estado(p) })).sort((a, b) => a.e.orden - b.e.orden || a.nombre.localeCompare(b.nombre));
    const n = (c) => lista.filter((p) => p.e.clase === c).length;
    el.innerHTML = `
      <div class="titulo-vista"><h2>Personal</h2><div class="fila">${botonUbic}<button data-acc="manual">+ Registro manual</button></div></div>
      ${S.ajustes?.ubicacion_lat ? '' : '<div class="tarjeta aviso-ubic">📍 Configure la <b>ubicación del restaurante</b> para saber si el personal marca desde el lugar de trabajo. <button class="peq primario" data-acc="ubicacionLocal">Configurar ahora</button></div>'}
      ${pestañas}
      <div class="kpis">
        <div class="kpi"><div class="t">Trabajando ahora</div><div class="v">${n('ok')}</div></div>
        <div class="kpi"><div class="t">No han llegado</div><div class="v ${n('falta') ? 'negativo' : ''}">${n('falta')}</div><div class="s">tolerancia ${tolerancia} min</div></div>
        <div class="kpi"><div class="t">Programados hoy</div><div class="v">${lista.filter((p) => p.turnos.length).length}</div></div>
        <div class="kpi"><div class="t">Ya salieron</div><div class="v">${n('salio')}</div></div>
      </div>
      <div class="lista-personal">${lista.map((p) => `
        <div class="tarjeta persona ${p.e.clase}">
          <div class="entre"><div><b>${esc(p.nombre)}</b> <span class="admin-badge">${ROL[p.rol]}</span></div>
            ${menuAcciones([
              ...(p.abierta_id ? [{ acc: 'cerrarAhora', id: p.abierta_id, texto: '⏹ Marcar su salida ahora', extra: `data-entrada="${p.trabajando_desde}"` }]
                : [{ acc: 'entradaAhora', id: p.id, texto: '▶ Marcar su entrada ahora' }]),
              { acc: 'verRegistro', id: p.id, texto: '🕒 Ver sus entradas y salidas' }
            ], p.nombre)}</div>
          <div class="chico">${p.e.txt}</div>
          ${p.ubicacion_entrada ? `<div class="chico">Entrada ${chipUbicacion(p.ubicacion_entrada.lat, p.ubicacion_entrada.lng, p.ubicacion_entrada.precision, p.ubicacion_entrada.distancia, radio)}</div>` : ''}
          ${p.turnos.length ? `<div class="chico suave">Turno: ${p.turnos.map((t) => `${hm(t.hora_inicio)}–${hm(t.hora_fin)}`).join(', ')}</div>` : ''}
        </div>`).join('') || '<p class="vacio">No hay trabajadores activos.</p>'}</div>`;
    S.acc = {
      ...acc,
      cerrarAhora: async (b) => {
        await api(`/asistencia/${b.dataset.id}`, { method: 'PATCH', body: { entrada: aLocal(b.dataset.entrada), salida: aLocal(new Date()), nota: 'Salida marcada por el administrador' } });
        toast('Salida registrada', 'ok'); recargar();
      },
      entradaAhora: async (b) => {
        await api('/asistencia', { method: 'POST', body: { usuario_id: Number(b.dataset.id), entrada: aLocal(new Date()), nota: 'Entrada marcada por el administrador' } });
        toast('Entrada registrada', 'ok'); recargar();
      },
      verRegistro: (b) => { Object.assign(P, { tab: 'registro', usuario_id: b.dataset.id, desde: sumarDias(hoyISO(), -6), hasta: hoyISO() }); recargar(); }
    };
    return;
  }

  if (P.tab === 'registro') {
    const qs = `desde=${P.desde}&hasta=${P.hasta}${P.usuario_id ? `&usuario_id=${P.usuario_id}` : ''}`;
    const { registros, resumen, radio } = await api(`/asistencia?${qs}`);
    const hoy = hoyISO();
    const atajo = (lbl, d, h) => `<button type="button" class="peq" data-acc="rango" data-d="${d}" data-h="${h}">${lbl}</button>`;
    el.innerHTML = `
      <div class="titulo-vista"><h2>Personal</h2>
        <div class="fila">${botonUbic}<button data-acc="exportar" ${registros.length ? '' : 'disabled'}>⬇ Exportar CSV</button><button data-acc="manual">+ Registro manual</button></div></div>
      ${pestañas}
      <form class="tarjeta fila" data-submit="filtrar" style="margin-bottom:1rem">
        <div><label>Desde</label><input type="date" name="desde" value="${P.desde}"></div>
        <div><label>Hasta</label><input type="date" name="hasta" value="${P.hasta}"></div>
        <div><label>Trabajador</label><select name="usuario_id"><option value="">Todos</option>
          ${personas.map((p) => `<option value="${p.id}" ${String(p.id) === String(P.usuario_id) ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
        <button style="align-self:flex-end">Ver</button>
        <div class="fila" style="align-self:flex-end">${atajo('Hoy', hoy, hoy)}${atajo('Esta semana', lunesDe(hoy), hoy)}${atajo('Quincena', hoy.slice(8) <= '15' ? hoy.slice(0, 8) + '01' : hoy.slice(0, 8) + '16', hoy)}${atajo('Este mes', hoy.slice(0, 8) + '01', hoy)}</div>
      </form>
      <div class="tarjeta tabla-cont"><h3>Resumen</h3><table>
        <thead><tr><th>Trabajador</th><th class="num">Días</th><th class="num">Horas</th><th class="num">Llegadas tarde</th><th class="num">Fuera del lugar</th></tr></thead>
        <tbody>${resumen.map((x) => `<tr><td><b>${esc(x.nombre)}</b> <span class="admin-badge">${ROL[x.rol]}</span></td><td class="num">${x.dias}</td>
          <td class="num">${duracion(x.horas)}</td><td class="num ${x.tardes ? 'negativo' : ''}">${x.tardes}</td>
          <td class="num ${x.fuera ? 'negativo' : ''}">${x.fuera}</td></tr>`).join('')
          || '<tr><td colspan="5" class="suave">Sin registros en este rango.</td></tr>'}</tbody></table></div>
      <div class="tarjeta tabla-cont seccion"><h3>Detalle</h3><table>
        <thead><tr><th>Fecha</th><th>Trabajador</th><th>Entrada</th><th>Salida</th><th class="num">Horas</th><th>Turno</th><th>Nota</th><th></th></tr></thead>
        <tbody>${registros.map((x) => `<tr>
          <td>${fechaLarga(new Date(x.entrada).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))}</td>
          <td>${esc(x.nombre)}</td>
          <td>${hora(x.entrada)} ${x.minutos_tarde > tolerancia ? `<span class="chip anulado">${x.minutos_tarde} min tarde</span>` : ''}
            <div>${chipUbicacion(x.entrada_lat, x.entrada_lng, x.entrada_precision, x.entrada_distancia, radio)}</div></td>
          <td>${x.salida ? hora(x.salida) : '<span class="chip listo">trabajando</span>'}
            <div>${chipUbicacion(x.salida_lat, x.salida_lng, x.salida_precision, x.salida_distancia, radio)}</div></td>
          <td class="num">${duracion(x.horas)}</td>
          <td class="chico">${x.hora_inicio ? `${hm(x.hora_inicio)}–${hm(x.hora_fin)}` : '<span class="suave">—</span>'}</td>
          <td class="chico">${x.corregido ? `<span class="chip abierto" title="Por ${esc(x.registrado_por || '')}">corregido</span> ` : ''}${esc(x.nota || '')}</td>
          <td class="derecha">${menuAcciones([
            { acc: 'editar', id: x.id, texto: '✏️ Corregir horas' },
            { acc: 'borrar', id: x.id, texto: '🗑️ Eliminar registro', peligro: true }
          ], `${x.nombre} · ${fechaHora(x.entrada)}`)}</td></tr>`).join('')
          || '<tr><td colspan="8" class="suave">Sin registros.</td></tr>'}</tbody></table></div>`;
    S.acc = {
      ...acc,
      filtrar: (f) => { Object.assign(P, { desde: f.desde.value, hasta: f.hasta.value || f.desde.value, usuario_id: f.usuario_id.value }); recargar(); },
      rango: (b) => { Object.assign(P, { desde: b.dataset.d, hasta: b.dataset.h }); recargar(); },
      editar: (b) => modalAsistencia(registros.find((x) => x.id === Number(b.dataset.id)), personas, recargar),
      borrar: async (b) => {
        if (!(await confirmar('¿Eliminar este registro de entrada/salida?', { boton: 'Eliminar', peligro: true }))) return;
        await api(`/asistencia/${b.dataset.id}`, { method: 'DELETE' });
        recargar();
      },
      exportar: () => {
        const filas = [['Fecha', 'Trabajador', 'Rol', 'Entrada', 'Distancia entrada (m)', 'Salida', 'Distancia salida (m)', 'Horas', 'Turno', 'Minutos tarde', 'Nota']]
          .concat(registros.map((x) => [aLocal(x.entrada).slice(0, 10), x.nombre, ROL[x.rol], hora(x.entrada), x.entrada_distancia ?? '',
            x.salida ? hora(x.salida) : '', x.salida_distancia ?? '', String(x.horas).replace('.', ','),
            x.hora_inicio ? `${hm(x.hora_inicio)}-${hm(x.hora_fin)}` : '', x.minutos_tarde ?? '', x.nota || '']));
        const csv = '﻿' + filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `asistencia_${P.desde}_a_${P.hasta}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    };
    return;
  }

  // Horarios de la semana
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(P.lunes, i));
  const turnos = await api(`/horarios?desde=${dias[0]}&hasta=${dias[6]}`);
  const celda = (p, d) => turnos.filter((t) => t.usuario_id === p.id && t.fecha === d)
    .map((t) => `<button type="button" class="turno-chip" data-acc="editarTurno" data-id="${t.id}" title="${esc(t.nota || 'Editar turno')}">${t.hora_inicio}–${t.hora_fin}</button>`).join('')
    + `<button type="button" class="turno-mas" data-acc="nuevoTurno" data-u="${p.id}" data-f="${d}" aria-label="Agregar turno">+</button>`;
  el.innerHTML = `
    <div class="titulo-vista"><h2>Personal</h2>
      <div class="fila"><button data-acc="copiar">⧉ Copiar semana anterior</button><button class="primario" data-acc="nuevoTurno">+ Programar turno</button></div></div>
    ${pestañas}
    <div class="tarjeta">
      <div class="entre" style="margin-bottom:.6rem">
        <button class="peq" data-acc="semana" data-n="-7">← Semana anterior</button>
        <b>${fechaLarga(dias[0])} – ${fechaLarga(dias[6])}</b>
        <button class="peq" data-acc="semana" data-n="7">Semana siguiente →</button>
      </div>
      <div class="tabla-cont"><table class="horarios">
        <thead><tr><th>Trabajador</th>${dias.map((d) => `<th class="${d === hoyISO() ? 'hoy' : ''}">${fechaLarga(d)}</th>`).join('')}</tr></thead>
        <tbody>${personas.map((p) => `<tr><td><b>${esc(p.nombre)}</b><div class="chico suave">${ROL[p.rol]}</div></td>
          ${dias.map((d) => `<td class="${d === hoyISO() ? 'hoy' : ''}">${celda(p, d)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="chico suave">Toque un turno para editarlo o <b>+</b> para agregar. Si la hora de salida es menor que la de entrada, el turno termina al día siguiente.</p>
    </div>`;
  S.acc = {
    ...acc,
    semana: (b) => { P.lunes = sumarDias(P.lunes, Number(b.dataset.n)); recargar(); },
    nuevoTurno: (b) => modalHorario({ usuarioId: Number(b.dataset.u) || personas[0]?.id, fecha: b.dataset.f, lunes: P.lunes, personas }, recargar),
    editarTurno: (b) => modalHorario({ turno: turnos.find((t) => t.id === Number(b.dataset.id)), personas, lunes: P.lunes }, recargar),
    copiar: async () => {
      const r = await api('/horarios/copiar-semana', { method: 'POST', body: { lunes: P.lunes } });
      toast(r.copiados ? `${r.copiados} turnos copiados de la semana anterior` : 'No había turnos nuevos para copiar', r.copiados ? 'ok' : '');
      recargar();
    }
  };
}

// ═══ Facturación electrónica ═════════════════════════════════════════════════
const feActiva = () => S.ajustes?.fe_activa === 'true';
const TIPO_DOC = { POS: 'POS electrónico', FACTURA: 'Factura electrónica', NOTA_CREDITO: 'Nota crédito' };
const ESTADO_DOC = { pendiente: 'Pendiente', enviando: 'Enviando', aceptado: 'Aceptado', rechazado: 'Rechazado', error: 'Error' };
const CLASE_DOC = { pendiente: 'abierto', enviando: 'abierto', aceptado: 'pagado', rechazado: 'anulado', error: 'anulado' };
const TIPOS_ID = { CC: 'Cédula de ciudadanía', NIT: 'NIT', CE: 'Cédula de extranjería', PP: 'Pasaporte', TI: 'Tarjeta de identidad', NIT_EXT: 'NIT de otro país', PEP: 'PEP' };
const IMPUESTOS = [['INC|8', 'Impuesto al consumo (INC) 8 %'], ['IVA|19', 'IVA 19 %'], ['IVA|5', 'IVA 5 %'], ['EXCLUIDO|0', 'Excluido / sin impuesto']];
const numDoc = (d) => `${d.prefijo || ''}${d.numero}`;
const chipDoc = (d) => `<span class="chip ${CLASE_DOC[d.estado]}" title="${esc(d.mensaje || '')}">${d.anulado ? 'Anulado' : ESTADO_DOC[d.estado]}</span>`;

// Dígito de verificación del NIT (algoritmo DIAN)
function dvNit(nit) {
  const n = String(nit || '').replace(/\D/g, '');
  if (!n) return '';
  const w = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const r = [...n].reverse().reduce((s, d, i) => s + Number(d) * w[i], 0) % 11;
  return String(r > 1 ? 11 - r : r);
}

// QR como imagen (librería qrcode-generator); si no cargó, no se dibuja
function qrImg(texto, celda = 3) {
  try {
    const q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    return q.createImgTag(celda, 4);
  } catch { return ''; }
}

// Ticket del documento electrónico (POS, factura o nota crédito) para impresora de 80 mm
function ticketDocumento(d) {
  const x = d.datos;
  const e = x.emisor;
  const ad = x.adquiriente;
  const res = x.resolucion;
  return `<h1>${esc(e.nombre_comercial || e.razon_social)}</h1>
    <p class="c">${esc(e.razon_social)}<br>NIT ${esc(e.nit)}${e.dv ? `-${esc(e.dv)}` : ''}${e.regimen ? `<br>${esc(e.regimen)}` : ''}
      <br>${esc(e.direccion)} ${esc(e.municipio)}${e.telefono ? `<br>Tel. ${esc(e.telefono)}` : ''}</p><hr>
    <p class="c g">${esc(x.documento.titulo.toUpperCase())}<br>No. ${esc(numDoc(x.documento))}</p>
    <div>Fecha: ${esc(x.documento.fecha)} ${esc(x.documento.hora.slice(0, 5))} · Pedido #${esc(x.documento.pedido)}</div>
    ${x.documento.ambiente !== 'produccion' ? '<p class="c g">*** DOCUMENTO DE PRUEBA — SIN VALIDEZ ***</p>' : ''}
    ${x.referencia ? `<div>Corrige: ${esc(TIPO_DOC[x.referencia.tipo])} ${esc(x.referencia.prefijo)}${esc(x.referencia.numero)}</div><div>Motivo: ${esc(x.motivo || '')}</div>` : ''}
    <hr><div>Cliente: ${esc(ad.nombre)}</div>
    ${ad.consumidor_final ? '' : `<div>${esc(TIPOS_ID[ad.tipo_doc] || ad.tipo_doc)} ${esc(ad.numero)}${ad.dv ? `-${esc(ad.dv)}` : ''}</div>${ad.email ? `<div>${esc(ad.email)}</div>` : ''}`}
    <hr><table>
    ${x.items.map((i) => `<tr><td>${i.cantidad} ${esc(i.descripcion)}</td><td class="r">${pesos(i.total)}</td></tr>`).join('')}
    </table><hr><table>
      <tr><td>Subtotal (base)</td><td class="r">${pesos(x.totales.subtotal)}</td></tr>
      ${x.totales.impuestos.map((t) => `<tr><td>${t.tipo} ${t.tasa}% (base ${pesos(t.base)})</td><td class="r">${pesos(t.valor)}</td></tr>`).join('')}
      <tr><td class="g">TOTAL</td><td class="r g">${pesos(x.totales.total)}</td></tr>
      ${x.pagos.map((p) => `<tr><td>${MEDIO[p.medio] || p.medio}</td><td class="r">${pesos(p.valor)}</td></tr>`).join('')}
    </table><hr>
    ${res?.numero ? `<p class="c" style="font-size:10px">Resolución DIAN ${esc(res.numero)}${res.fecha_desde ? ` del ${esc(res.fecha_desde)}` : ''}
      · ${esc(res.prefijo)}${esc(res.desde)} a ${esc(res.prefijo)}${esc(res.hasta || '')}${res.fecha_hasta ? ` · vigente hasta ${esc(res.fecha_hasta)}` : ''}</p>` : ''}
    ${d.cufe ? `<p style="font-size:9px;word-break:break-all">${x.documento.tipo === 'FACTURA' ? 'CUFE' : 'CUDE'}: ${esc(d.cufe)}</p>
      ${d.qr ? `<p class="c">${qrImg(d.qr)}</p>` : ''}` : `<p class="c">Documento en proceso de validación DIAN (${esc(ESTADO_DOC[d.estado])})</p>`}
    <p class="c" style="font-size:10px">Proveedor tecnológico: ${esc(d.proveedor || '')}</p>
    <p class="c">${esc(S.ajustes?.pie_ticket || '¡Gracias por su compra!')}</p>`;
}

// Espera (unos segundos) a que la DIAN acepte el documento y lo imprime
async function imprimirDocumento(id, espera = 8000) {
  let d = await api(`/fe/documentos/${id}`);
  const fin = Date.now() + espera;
  while (['pendiente', 'enviando'].includes(d.estado) && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 1000));
    d = await api(`/fe/documentos/${id}`);
  }
  if (d.estado === 'rechazado' || d.estado === 'error') toast(`${TIPO_DOC[d.tipo]} ${numDoc(d)}: ${d.mensaje || ESTADO_DOC[d.estado]}`, 'error', 7000);
  imprimir(ticketDocumento(d), `${TIPO_DOC[d.tipo]} ${numDoc(d)}`);
}

// Documento vigente (POS o factura no anulados) de un pedido
const documentoVigente = (p) => (p.documentos || []).filter((d) => d.tipo !== 'NOTA_CREDITO' && !d.anulado && d.estado !== 'rechazado').pop();

// Bloque del formulario de cobro para pedir factura electrónica
const bloqueFactura = () => `
  <label class="check" style="margin:.4rem 0"><input type="checkbox" name="pide_factura"> 🧾 El cliente pide <b>factura electrónica</b></label>
  <div id="datos-factura" class="grupo-op" hidden>
    <div class="fila"><input id="fe-buscar" class="crece" placeholder="Buscar por número de documento o nombre" autocomplete="off">
      <span class="chico suave" id="fe-buscar-estado"></span></div>
    <div id="fe-resultados" class="fe-resultados"></div>
    <div class="campos" style="margin-top:.5rem">
      <div><label>Tipo de documento</label><select name="fe_tipo_doc">${Object.entries(TIPOS_ID).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Número *</label><input name="fe_numero" inputmode="numeric"></div>
      <div><label>DV</label><input name="fe_dv" readonly placeholder="Auto (NIT)"></div>
      <div style="grid-column:1/-1"><label>Nombre o razón social *</label><input name="fe_nombre"></div>
      <div style="grid-column:1/-1"><label>Correo (allí le llega la factura) *</label><input name="fe_email" type="email"></div>
      <div><label>Teléfono</label><input name="fe_telefono" inputmode="tel"></div>
      <div><label>Dirección</label><input name="fe_direccion"></div>
    </div>
  </div>`;

// Lógica del bloque de factura dentro de un modal: búsqueda, DV automático y guardado del cliente
function controlFactura(m) {
  let t;
  const f = $('form', m);
  const llenar = (c) => {
    f.fe_tipo_doc.value = c.tipo_doc; f.fe_numero.value = c.numero; f.fe_dv.value = c.dv || '';
    f.fe_nombre.value = c.nombre; f.fe_email.value = c.email; f.fe_telefono.value = c.telefono || ''; f.fe_direccion.value = c.direccion || '';
    $('#fe-resultados', m).innerHTML = '';
  };
  return {
    alCambiar(e) {
      if (e.target.name === 'pide_factura') $('#datos-factura', m).hidden = !e.target.checked;
      if (['fe_numero', 'fe_tipo_doc'].includes(e.target.name)) f.fe_dv.value = f.fe_tipo_doc.value === 'NIT' ? dvNit(f.fe_numero.value) : '';
      if (e.target.id === 'fe-buscar') {
        clearTimeout(t);
        const q = e.target.value.trim();
        if (q.length < 3) { $('#fe-resultados', m).innerHTML = ''; return; }
        t = setTimeout(async () => {
          const r = await api(`/fe/clientes?q=${encodeURIComponent(q)}`);
          $('#fe-resultados', m).innerHTML = r.length
            ? r.map((c, i) => `<button type="button" class="peq" data-acc="feElegir" data-i="${i}">${esc(c.nombre)} · ${esc(c.tipo_doc)} ${esc(c.numero)}</button>`).join('')
            : '<span class="chico suave">No está registrado: llene los datos abajo.</span>';
          m._feResultados = r;
        }, 300);
      }
    },
    elegir: (b) => llenar(m._feResultados[Number(b.dataset.i)]),
    pidio: () => !!f.pide_factura?.checked,
    // Crea o actualiza el cliente y devuelve su id
    async guardar() {
      const c = await api('/fe/clientes', { method: 'POST', body: {
        tipo_doc: f.fe_tipo_doc.value, numero: f.fe_numero.value, nombre: f.fe_nombre.value, email: f.fe_email.value,
        telefono: f.fe_telefono.value, direccion: f.fe_direccion.value, tipo_persona: f.fe_tipo_doc.value === 'NIT' ? 'juridica' : 'natural' } });
      return c.id;
    }
  };
}

// Ventana para pedir factura electrónica de un pedido ya cobrado
function modalFacturaPedido(p, listo) {
  const vigente = documentoVigente(p);
  const { m } = abrirModal(`
    ${cabeceraModal(`Factura electrónica · pedido #${p.numero}`)}
    <form>
      ${vigente?.tipo === 'POS' ? `<p class="chico suave">El pedido tiene el POS electrónico ${esc(numDoc(vigente))}. Se anulará con una nota crédito y se emitirá la factura a nombre del cliente.</p>` : ''}
      ${bloqueFactura()}
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="primario">Emitir factura</button></div>
    </form>`, {
    feElegir: (b) => ctl.elegir(b),
    input: (e) => ctl.alCambiar(e),
    change: (e) => ctl.alCambiar(e),
    submit: async (f, _m, cerrar) => {
      const cliente = await ctl.guardar();
      const doc = await api(`/pedidos/${p.id}/documento`, { method: 'POST', body: { tipo: 'FACTURA', cliente_fiscal_id: cliente } });
      cerrar();
      toast(`Factura ${numDoc(doc)} en proceso`, 'ok');
      listo?.();
      await imprimirDocumento(doc.id);
    }
  });
  const ctl = controlFactura(m);
  m.querySelector('[name=pide_factura]').checked = true;
  m.querySelector('[name=pide_factura]').closest('label').hidden = true;
  $('#datos-factura', m).hidden = false;
}

// Vista "Facturas": documentos emitidos y configuración
async function vistaFacturas(el) {
  const F = S.facturas ||= { tab: 'documentos', desde: hoyISO(), hasta: hoyISO(), tipo: '', estado: '' };
  if (F.tab === 'config' && !tiene()) F.tab = 'documentos';
  const pestañas = `<div class="tabs">
    <button class="${F.tab === 'documentos' ? 'activo' : ''}" data-acc="tab" data-tab="documentos">📄 Documentos</button>
    ${tiene() ? `<button class="${F.tab === 'config' ? 'activo' : ''}" data-acc="tab" data-tab="config">⚙️ Configuración</button>` : ''}</div>`;
  const recargar = () => vistaFacturas(el);
  const acc = { tab: (b) => { F.tab = b.dataset.tab; recargar(); } };

  if (F.tab === 'documentos') {
    const docs = await api(`/fe/documentos?desde=${F.desde}&hasta=${F.hasta}${F.tipo ? `&tipo=${F.tipo}` : ''}${F.estado ? `&estado=${F.estado}` : ''}`);
    const vigentes = docs.filter((d) => d.tipo !== 'NOTA_CREDITO' && d.estado === 'aceptado' && !d.anulado);
    const suma = (t) => vigentes.reduce((s, d) => s + d.impuestos.filter((i) => i.tipo === t).reduce((a, i) => a + Number(i.valor), 0), 0);
    const hoy = hoyISO();
    const problemas = docs.filter((d) => ['error', 'rechazado'].includes(d.estado)).length;
    el.innerHTML = `
      <div class="titulo-vista"><h2>Facturación electrónica</h2></div>
      ${pestañas}
      ${feActiva() ? '' : `<div class="tarjeta aviso-ubic">⚠️ La facturación electrónica está <b>desactivada</b> para este restaurante.
        ${tiene() ? '<button class="peq primario" data-acc="tab" data-tab="config">Configurar</button>' : 'Pida al administrador que la configure.'}</div>`}
      ${S.ajustes?.fe_ambiente !== 'produccion' && feActiva() ? '<div class="tarjeta aviso-ubic">🧪 Ambiente de <b>pruebas</b>: los documentos no tienen validez ante la DIAN.</div>' : ''}
      <form class="tarjeta fila" data-submit="filtrar" style="margin-bottom:1rem">
        <div><label>Desde</label><input type="date" name="desde" value="${F.desde}"></div>
        <div><label>Hasta</label><input type="date" name="hasta" value="${F.hasta}"></div>
        <div><label>Tipo</label><select name="tipo"><option value="">Todos</option>${Object.entries(TIPO_DOC).map(([k, v]) => `<option value="${k}" ${F.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label>Estado</label><select name="estado"><option value="">Todos</option>${Object.entries(ESTADO_DOC).map(([k, v]) => `<option value="${k}" ${F.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <button style="align-self:flex-end">Ver</button>
        <div class="fila" style="align-self:flex-end">
          <button type="button" class="peq" data-acc="rango" data-d="${hoy}" data-h="${hoy}">Hoy</button>
          <button type="button" class="peq" data-acc="rango" data-d="${hoy.slice(0, 8)}01" data-h="${hoy}">Este mes</button></div>
      </form>
      <div class="kpis">
        <div class="kpi"><div class="t">Documentos vigentes</div><div class="v">${vigentes.length}</div></div>
        <div class="kpi"><div class="t">Total facturado</div><div class="v">${pesos(vigentes.reduce((s, d) => s + Number(d.total), 0))}</div></div>
        <div class="kpi"><div class="t">INC</div><div class="v">${pesos(suma('INC'))}</div></div>
        <div class="kpi"><div class="t">IVA</div><div class="v">${pesos(suma('IVA'))}</div></div>
        <div class="kpi ${problemas ? 'destacado' : ''}"><div class="t">Con error o rechazo</div><div class="v">${problemas}</div></div>
      </div>
      <div class="tarjeta tabla-cont seccion"><table>
        <thead><tr><th>Fecha</th><th>Documento</th><th>Pedido</th><th>Cliente</th><th class="num">Total</th><th>Estado DIAN</th><th></th></tr></thead>
        <tbody>${docs.map((d) => `<tr class="${d.anulado ? 'suave' : ''}">
          <td>${fechaHora(d.creado_en)}</td>
          <td><b>${TIPO_DOC[d.tipo]}</b> ${esc(numDoc(d))}${d.referencia ? `<div class="chico suave">corrige ${esc(d.referencia)}</div>` : ''}</td>
          <td>#${d.pedido_numero}</td>
          <td>${esc(d.cliente || '')}${d.cliente_doc && d.cliente_doc !== '222222222222' ? `<div class="chico suave">${esc(d.cliente_doc)}</div>` : ''}</td>
          <td class="num">${pesos(d.total)}</td>
          <td>${chipDoc(d)}${d.mensaje && d.estado !== 'aceptado' ? `<div class="chico negativo">${esc(d.mensaje)}</div>` : ''}</td>
          <td class="derecha">${menuAcciones([
            { acc: 'imprimir', id: d.id, texto: '🖨️ Imprimir' },
            ...(d.qr ? [{ acc: 'verDian', id: d.id, texto: '🔎 Ver en la DIAN', extra: `data-qr="${esc(d.qr)}"` }] : []),
            ...(d.pdf_url ? [{ acc: 'verPdf', id: d.id, texto: '📄 Ver PDF', extra: `data-pdf="${esc(d.pdf_url)}"` }] : []),
            ...(['error', 'pendiente'].includes(d.estado) ? [{ acc: 'reintentar', id: d.id, texto: '🔁 Reintentar envío' }] : []),
            ...(tiene() && d.tipo !== 'NOTA_CREDITO' && d.estado === 'aceptado' && !d.anulado ? [{ acc: 'notaCredito', id: d.id, texto: '↩️ Anular con nota crédito', peligro: true }] : [])
          ], `${TIPO_DOC[d.tipo]} ${numDoc(d)}`)}</td></tr>`).join('')
          || '<tr><td colspan="7" class="suave">Sin documentos en este rango.</td></tr>'}</tbody></table></div>`;
    S.acc = {
      ...acc,
      filtrar: (f) => { Object.assign(F, { desde: f.desde.value, hasta: f.hasta.value || f.desde.value, tipo: f.tipo.value, estado: f.estado.value }); recargar(); },
      rango: (b) => { Object.assign(F, { desde: b.dataset.d, hasta: b.dataset.h }); recargar(); },
      imprimir: (b) => imprimirDocumento(Number(b.dataset.id), 0),
      verDian: (b) => window.open(b.dataset.qr, '_blank', 'noopener'),
      verPdf: (b) => window.open(b.dataset.pdf, '_blank', 'noopener'),
      reintentar: async (b) => { await api(`/fe/documentos/${b.dataset.id}/reintentar`, { method: 'POST' }); toast('Reenviando…'); setTimeout(recargar, 1500); },
      notaCredito: async (b) => {
        const motivo = await confirmar('Se emitirá una nota crédito que anula este documento ante la DIAN. Escriba el motivo:',
          { boton: 'Emitir nota crédito', peligro: true, campo: 'Motivo (ej: devolución, error en el valor)' });
        if (!motivo) return;
        const n = await api(`/fe/documentos/${b.dataset.id}/nota-credito`, { method: 'POST', body: { motivo } });
        toast(`Nota crédito ${numDoc(n)} en proceso`, 'ok');
        setTimeout(recargar, 1500);
      }
    };
    return;
  }

  // Configuración (solo administrador)
  const { config: c, proveedores, numeracion } = await api('/fe/config');
  const v = (k) => esc(c[k] ?? '');
  const usado = (tipo, prefijo) => numeracion.find((n) => n.tipo === tipo && n.prefijo === (prefijo || ''));
  const resolucion = (k, titulo, tipo) => {
    const u = usado(tipo, c[`fe_${k}_prefijo`]);
    const hasta = Number(c[`fe_${k}_hasta`]) || 0;
    return `<fieldset class="grupo-op"><legend>${titulo}</legend>
      <div class="campos">
        <div><label>No. de resolución DIAN</label><input name="fe_${k}_resolucion" value="${v(`fe_${k}_resolucion`)}"></div>
        <div><label>Prefijo</label><input name="fe_${k}_prefijo" value="${v(`fe_${k}_prefijo`)}" maxlength="4" style="text-transform:uppercase"></div>
        <div><label>Desde el número</label><input name="fe_${k}_desde" type="number" min="1" value="${v(`fe_${k}_desde`)}"></div>
        <div><label>Hasta el número</label><input name="fe_${k}_hasta" type="number" min="1" value="${v(`fe_${k}_hasta`)}"></div>
        <div><label>Vigente desde</label><input name="fe_${k}_fecha_desde" type="date" value="${v(`fe_${k}_fecha_desde`)}"></div>
        <div><label>Vigente hasta</label><input name="fe_${k}_fecha_hasta" type="date" value="${v(`fe_${k}_fecha_hasta`)}"></div>
      </div>
      <p class="chico suave">${u ? `Último emitido: <b>${esc(c[`fe_${k}_prefijo`] || '')}${u.ultimo}</b> · ${u.emitidos} emitidos${hasta ? ` · quedan ${Math.max(0, hasta - u.ultimo)}` : ''}` : 'Aún no se ha emitido ninguno.'}</p>
    </fieldset>`;
  };
  el.innerHTML = `
    <div class="titulo-vista"><h2>Facturación electrónica</h2></div>
    ${pestañas}
    <form class="tarjeta" data-submit="guardar" id="form-fe">
      <fieldset class="grupo-op"><legend>Proveedor tecnológico</legend>
        <label class="check"><input type="checkbox" name="fe_activa" ${c.fe_activa === 'true' ? 'checked' : ''}> <b>Activar facturación electrónica</b> en este restaurante</label>
        <label class="check"><input type="checkbox" name="fe_auto_pos" ${c.fe_auto_pos === 'false' ? '' : 'checked'}> Emitir <b>POS electrónico</b> automáticamente en cada cobro (si el cliente no pide factura)</label>
        <div class="campos" style="margin-top:.5rem">
          <div><label>Proveedor</label><select name="fe_proveedor">${proveedores.map((p) => `<option value="${p.id}" ${c.fe_proveedor === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
          <div><label>Ambiente</label><select name="fe_ambiente">
            <option value="pruebas" ${c.fe_ambiente !== 'produccion' ? 'selected' : ''}>Pruebas (habilitación)</option>
            <option value="produccion" ${c.fe_ambiente === 'produccion' ? 'selected' : ''}>Producción (validez ante la DIAN)</option></select></div>
          <div style="grid-column:1/-1"><label>URL de la API</label><input name="fe_api_url" value="${v('fe_api_url')}" placeholder="La entrega el proveedor"></div>
          <div><label>Usuario / ID de cliente</label><input name="fe_api_usuario" value="${v('fe_api_usuario')}" autocomplete="off"></div>
          <div><label>Token / clave de la API</label><input name="fe_api_token" type="password" value="${v('fe_api_token')}" autocomplete="new-password" placeholder="Pegue el token"></div>
        </div>
      </fieldset>
      <fieldset class="grupo-op"><legend>Datos del emisor (su empresa, como aparecen en el RUT)</legend>
        <div class="campos">
          <div><label>NIT (sin DV)</label><input name="fe_nit" value="${v('fe_nit')}" inputmode="numeric"></div>
          <div><label>DV</label><input name="fe_dv" value="${v('fe_dv')}" readonly placeholder="Automático"></div>
          <div style="grid-column:1/-1"><label>Razón social</label><input name="fe_razon_social" value="${v('fe_razon_social')}"></div>
          <div><label>Tipo de persona</label><select name="fe_tipo_persona">
            <option value="natural" ${c.fe_tipo_persona !== 'juridica' ? 'selected' : ''}>Persona natural</option>
            <option value="juridica" ${c.fe_tipo_persona === 'juridica' ? 'selected' : ''}>Persona jurídica</option></select></div>
          <div><label>Régimen / responsabilidad IVA</label><input name="fe_regimen" value="${v('fe_regimen')}" placeholder="Ej: No responsable de IVA"></div>
          <div><label>Responsabilidad fiscal (RUT)</label><input name="fe_responsabilidad" value="${v('fe_responsabilidad') || 'R-99-PN'}"></div>
          <div><label>Correo de facturación</label><input name="fe_email" type="email" value="${v('fe_email')}"></div>
          <div><label>Municipio</label><input name="fe_municipio" value="${v('fe_municipio')}" placeholder="${esc(S.ajustes?.ciudad || 'Ej: Bello')}"></div>
        </div>
        <p class="chico suave">La dirección y el teléfono se toman de Ajustes → Datos del negocio.</p>
      </fieldset>
      ${resolucion('pos', 'Resolución del POS electrónico', 'POS')}
      ${resolucion('fac', 'Resolución de la factura electrónica', 'FACTURA')}
      <fieldset class="grupo-op"><legend>Notas crédito</legend>
        <div class="campos"><div><label>Prefijo</label><input name="fe_nc_prefijo" value="${v('fe_nc_prefijo') || 'NC'}" maxlength="4"></div></div>
      </fieldset>
      <div class="fila"><button class="primario">Guardar configuración</button><button type="button" data-acc="probar">🔌 Probar conexión</button></div>
    </form>`;
  S.acc = {
    ...acc,
    _input: (e) => { if (e.target.name === 'fe_nit') $('#form-fe').fe_dv.value = dvNit(e.target.value); },
    guardar: async (f) => {
      const body = Object.fromEntries([...f.elements].filter((x) => x.name).map((x) => [x.name, x.type === 'checkbox' ? String(x.checked) : x.value]));
      ['fe_pos_prefijo', 'fe_fac_prefijo', 'fe_nc_prefijo'].forEach((k) => { body[k] = body[k].toUpperCase(); });
      await api('/fe/config', { method: 'PUT', body });
      S.ajustes = await api('/ajustes');
      toast('Configuración de facturación guardada', 'ok');
      recargar();
    },
    probar: async () => { const r = await api('/fe/probar', { method: 'POST' }); toast(r.mensaje, 'ok', 6000); }
  };
}

// ═══ Contabilidad: informe para el contador (renta, IVA/INC, exógena) ════════
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const ultimoDia = (anio, mes) => new Date(Number(anio), Number(mes), 0).getDate();

// Carga una librería externa solo cuando se necesita
const scripts = {};
const cargarScript = (src) => (scripts[src] ||= new Promise((ok, mal) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar la librería (revise la conexión a internet)'));
  document.head.appendChild(s);
}));

// Imprime un documento en hoja carta (para guardarlo como PDF desde el diálogo de impresión)
function imprimirHoja(html, titulo) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: letter; margin: 14mm; }
    body { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111; }
    h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
    .cab { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px double #333; padding-bottom: 8px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border-bottom: 1px solid #ddd; padding: 3px 5px; text-align: left; } th { background: #f1f1f1; font-weight: 600; }
    td.n, th.n { text-align: right; white-space: nowrap; } tr.t td { font-weight: 700; border-top: 2px solid #333; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .nota { font-size: 9.5px; color: #555; margin-top: 18px; }
  </style></head><body>${html}</body></html>`);
  d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 3000); }, 250);
}

async function vistaContabilidad(el) {
  const hoy = hoyISO();
  const C = S.conta ||= { anio: hoy.slice(0, 4), mes: '' };
  const desde = C.mes ? `${C.anio}-${C.mes}-01` : `${C.anio}-01-01`;
  const hasta = C.mes ? `${C.anio}-${C.mes}-${ultimoDia(C.anio, C.mes)}` : `${C.anio}-12-31`;
  const periodo = C.mes ? `${MESES[Number(C.mes) - 1]} de ${C.anio}` : `Año ${C.anio}`;
  const inf = await api(`/contabilidad/informe?desde=${desde}&hasta=${hasta}`);
  const R = inf.resumen;
  const anios = Array.from({ length: 6 }, (_, i) => String(Number(hoy.slice(0, 4)) - i));
  const cat = (k) => CATEGORIAS_GASTO[k] || k;
  const estado = [
    ['Ingresos brutos (ventas con impuestos)', R.ingresos_brutos],
    ['(−) Impuesto al consumo (INC) generado', -R.inc],
    ['(−) IVA generado', -R.iva],
    ['= Ingresos netos (sin impuestos)', R.ingresos_netos, 't'],
    ['(−) Costo de ventas (recetas)', -R.costo_ventas],
    ['= Utilidad bruta', R.utilidad_bruta, 't'],
    ['(−) Mermas y ajustes de inventario', -R.mermas],
    ['(−) Gastos operativos', -R.gastos_operativos],
    ['= Utilidad antes de impuestos', R.utilidad_antes_impuestos, 't']
  ];

  el.innerHTML = `
    <div class="titulo-vista"><h2>Contabilidad</h2>
      <div class="fila">
        <button data-acc="excel" class="primario">⬇ Excel para el contador</button>
        <button data-acc="pdf">🖨️ Informe PDF</button>
      </div></div>
    <form class="tarjeta fila" data-submit="periodo" style="margin-bottom:1rem">
      <div><label>Año</label><select name="anio">${anios.map((a) => `<option ${a === C.anio ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div><label>Periodo</label><select name="mes"><option value="">Todo el año</option>
        ${MESES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${v === C.mes ? 'selected' : ''}>${m}</option>`; }).join('')}</select></div>
      <button style="align-self:flex-end">Ver</button>
      <span class="suave chico" style="align-self:flex-end">${periodo} · ${desde} a ${hasta}</span>
    </form>
    <div class="kpis">
      <div class="kpi"><div class="t">Ingresos netos (sin impuestos)</div><div class="v">${pesos(R.ingresos_netos)}</div><div class="s">${R.pedidos} ventas · ticket prom. ${pesos(R.ticket_promedio)}</div></div>
      <div class="kpi"><div class="t">Impuestos generados</div><div class="v">${pesos(R.inc + R.iva)}</div><div class="s">INC ${pesos(R.inc)} · IVA ${pesos(R.iva)}</div></div>
      <div class="kpi"><div class="t">Costos y gastos</div><div class="v">${pesos(R.costo_ventas + R.mermas + R.gastos_operativos)}</div><div class="s">compras de insumos ${pesos(R.compras_insumos)}</div></div>
      <div class="kpi destacado"><div class="t">Utilidad antes de impuestos</div><div class="v ${R.utilidad_antes_impuestos < 0 ? 'negativo' : ''}">${pesos(R.utilidad_antes_impuestos)}</div></div>
    </div>
    <div class="dos-col seccion">
      <div class="tarjeta tabla-cont"><h3>Estado de resultados</h3><table>
        <tbody>${estado.map(([k, v, t]) => `<tr class="${t ? 'fila-total' : ''}"><td>${k}</td><td class="num ${v < 0 ? 'negativo' : ''}">${pesos(v)}</td></tr>`).join('')}</tbody></table>
        <p class="chico suave">Nómina pagada: ${pesos(R.nomina)} (incluida en gastos) · Inventario valorizado hoy: ${pesos(R.inventario_actual)}</p></div>
      <div>
        <div class="tarjeta tabla-cont"><h3>Impuestos por tarifa</h3><table>
          <thead><tr><th>Impuesto</th><th class="num">Base</th><th class="num">Impuesto</th><th class="num">Total</th></tr></thead>
          <tbody>${inf.impuestos.map((x) => `<tr><td>${x.tipo === 'EXCLUIDO' || !x.tasa ? 'Excluido / sin impuesto' : `${x.tipo} ${x.tasa}%`}</td>
            <td class="num">${pesos(x.base)}</td><td class="num">${pesos(x.impuesto)}</td><td class="num">${pesos(x.total)}</td></tr>`).join('')
            || '<tr><td colspan="4" class="suave">Sin ventas</td></tr>'}</tbody></table></div>
        <div class="tarjeta tabla-cont"><h3>Ingresos por medio de pago</h3><table>
          <tbody>${inf.medios.map((m) => `<tr><td>${MEDIO[m.medio] || m.medio}</td><td class="num">${m.pedidos}</td><td class="num">${pesos(m.valor)}</td></tr>`).join('')
            || '<tr><td class="suave">—</td></tr>'}</tbody></table></div>
      </div>
    </div>
    <div class="tarjeta tabla-cont seccion"><h3>Mes a mes</h3><table>
      <thead><tr><th>Mes</th><th class="num">Ventas</th><th class="num">Ingresos brutos</th><th class="num">INC + IVA</th><th class="num">Ingresos netos</th>
        <th class="num">Costo ventas</th><th class="num">Gastos</th><th class="num">Compras insumos</th><th class="num">Utilidad</th></tr></thead>
      <tbody>${inf.mensual.map((m) => `<tr><td>${nombreMes(m.mes)}</td><td class="num">${m.pedidos}</td><td class="num">${pesos(m.ingresos_brutos)}</td>
        <td class="num">${pesos(m.inc + m.iva)}</td><td class="num">${pesos(m.ingresos_netos)}</td><td class="num">${pesos(m.costo_ventas)}</td>
        <td class="num">${pesos(m.gastos + m.mermas)}</td><td class="num">${pesos(m.compras)}</td>
        <td class="num ${m.utilidad < 0 ? 'negativo' : ''}"><b>${pesos(m.utilidad)}</b></td></tr>`).join('')
        || '<tr><td colspan="9" class="suave">Sin movimientos en el periodo.</td></tr>'}</tbody></table></div>
    <div class="dos-col seccion">
      <div class="tarjeta tabla-cont"><h3>Gastos por categoría</h3><table>
        <tbody>${inf.gastos_por_categoria.map((g) => `<tr><td>${cat(g.categoria)}</td><td class="num">${g.cantidad}</td><td class="num">${pesos(g.valor)}</td></tr>`).join('')
          || '<tr><td class="suave">Sin gastos</td></tr>'}</tbody></table></div>
      <div class="tarjeta tabla-cont"><h3>Compras por proveedor</h3><table>
        <thead><tr><th>Proveedor</th><th>NIT</th><th class="num">Valor</th></tr></thead>
        <tbody>${inf.proveedores.map((x) => `<tr><td>${esc(x.proveedor)}</td><td>${esc(x.nit || '—')}</td><td class="num">${pesos(x.valor)}</td></tr>`).join('')
          || '<tr><td colspan="3" class="suave">Sin compras a proveedores registrados</td></tr>'}</tbody></table>
        ${inf.proveedores.some((x) => !x.nit) ? '<p class="chico negativo">Hay proveedores sin NIT: complételos en Gastos → Proveedores (el contador los necesita para la exógena).</p>' : ''}</div>
    </div>
    <div class="tarjeta seccion"><h3>Documentos electrónicos del periodo</h3>
      <p class="chico">${R.documentos_vigentes} documentos vigentes por ${pesos(R.facturado_electronicamente)} ·
        ${inf.documentos.filter((d) => d.tipo === 'NOTA_CREDITO').length} notas crédito ·
        ${inf.documentos.filter((d) => ['error', 'rechazado', 'pendiente'].includes(d.estado)).length} con error o pendientes</p>
    </div>
    <p class="chico suave">Este informe se genera con lo registrado en el sistema (ventas cobradas, gastos y compras). Es un apoyo para su contador;
      no reemplaza la contabilidad formal ni la asesoría tributaria. Los impuestos se calculan con la tarifa configurada en cada producto.</p>`;

  S.acc = {
    periodo: (f) => { Object.assign(C, { anio: f.anio.value, mes: f.mes.value }); vistaContabilidad(el); },
    excel: async () => {
      toast('Preparando el Excel…');
      await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      const X = window.XLSX;
      const libro = X.utils.book_new();
      const hoja = (nombre, filas, anchos) => {
        const h = X.utils.aoa_to_sheet(filas);
        if (anchos) h['!cols'] = anchos.map((w) => ({ wch: w }));
        X.utils.book_append_sheet(libro, h, nombre);
      };
      const e = inf.empresa;
      hoja('Resumen', [
        [e.fe_razon_social || e.nombre_negocio || ''], [e.fe_nit ? `NIT ${e.fe_nit}${e.fe_dv ? '-' + e.fe_dv : ''}` : ''],
        [`Periodo: ${periodo} (${desde} a ${hasta})`], [`Generado: ${fechaHora(new Date())}`], [],
        ['Concepto', 'Valor'], ...estado.map(([k, v]) => [k, v]), [],
        ['Ventas (cantidad)', R.pedidos], ['Ticket promedio', R.ticket_promedio], ['Compras de insumos (al inventario)', R.compras_insumos],
        ['Nómina pagada (incluida en gastos)', R.nomina], ['Inventario valorizado hoy', R.inventario_actual],
        ['Documentos electrónicos vigentes', R.documentos_vigentes], ['Total facturado electrónicamente', R.facturado_electronicamente], [],
        ['Medio de pago', 'Ventas', 'Valor'], ...inf.medios.map((m) => [MEDIO[m.medio] || m.medio, m.pedidos, Number(m.valor)])
      ], [45, 18, 18]);
      hoja('Mensual', [['Mes', 'Ventas', 'Ingresos brutos', 'INC', 'IVA', 'Ingresos netos', 'Costo de ventas', 'Mermas', 'Gastos', 'Compras insumos', 'Utilidad'],
        ...inf.mensual.map((m) => [nombreMes(m.mes), m.pedidos, m.ingresos_brutos, m.inc, m.iva, m.ingresos_netos, m.costo_ventas, m.mermas, m.gastos, m.compras, m.utilidad])],
        [16, 8, 15, 12, 12, 15, 15, 12, 12, 15, 14]);
      hoja('Impuestos', [['Impuesto', 'Tarifa %', 'Base', 'Impuesto', 'Total con impuesto'],
        ...inf.impuestos.map((x) => [x.tipo, x.tasa, x.base, x.impuesto, x.total])], [14, 10, 15, 15, 18]);
      hoja('Ventas', [['Fecha', 'Pedido', 'Tipo', 'Mesa', 'Cliente', 'Base', 'INC', 'IVA', 'Domicilio', 'Total', 'Costo', 'Medios de pago', 'Documento electrónico'],
        ...inf.ventas.map((v) => [v.fecha, v.numero, TIPO[v.tipo], v.mesa || '', v.cliente || '', v.base, v.inc, v.iva, Number(v.costo_envio), v.total, v.costo, v.medios || '', v.documento || ''])],
        [17, 8, 12, 10, 22, 12, 10, 10, 10, 12, 10, 26, 18]);
      hoja('Gastos', [['Fecha', 'Categoría', 'Proveedor', 'NIT', 'Empleado', 'Descripción', 'Valor', 'Medio de pago', 'De caja', 'Anulado', 'Motivo anulación'],
        ...inf.gastos.map((g) => [g.fecha, cat(g.categoria), g.proveedor || '', g.nit || '', g.empleado || '', g.descripcion || '', Number(g.valor),
          g.medio_pago, g.pagado_de_caja ? 'Sí' : 'No', g.anulado ? 'Sí' : 'No', g.motivo_anulacion || ''])],
        [11, 18, 22, 14, 18, 30, 12, 14, 8, 8, 24]);
      hoja('Compras insumos', [['Fecha', 'Proveedor', 'NIT', 'Insumo', 'Cantidad', 'Unidad', 'Costo total', 'Medio de pago', 'Anulado'],
        ...inf.compras.map((c) => [c.fecha, c.proveedor || '', c.nit || '', c.insumo, Number(c.cantidad), c.unidad, Number(c.costo_total), c.medio_pago, c.anulado ? 'Sí' : 'No'])],
        [11, 22, 14, 24, 10, 8, 12, 14, 8]);
      hoja('Proveedores', [['Proveedor', 'NIT', 'Pagos', 'Valor total'], ...inf.proveedores.map((x) => [x.proveedor, x.nit || '', x.compras, x.valor])], [28, 16, 8, 14]);
      hoja('Nómina', [['Empleado', 'Pagos', 'Valor total'], ...inf.nomina.map((x) => [x.empleado, x.pagos, x.valor])], [28, 8, 14]);
      hoja('Documentos electrónicos', [['Fecha', 'Tipo', 'Número', 'Cliente', 'Documento cliente', 'Base', 'Impuestos', 'Total', 'Estado', 'Anulado', 'Ambiente', 'CUFE/CUDE'],
        ...inf.documentos.map((d) => [d.fecha, d.tipo, d.numero, d.cliente || '', d.documento_cliente || '', Number(d.subtotal), Number(d.impuestos), Number(d.total),
          d.estado, d.anulado ? 'Sí' : 'No', d.ambiente, d.cufe || ''])],
        [17, 14, 12, 24, 16, 12, 12, 12, 10, 8, 10, 40]);
      const nombre = (e.nombre_negocio || 'restaurante').replace(/[^\p{L}\p{N}]+/gu, '_');
      X.writeFile(libro, `Contabilidad_${nombre}_${C.mes ? `${C.anio}-${C.mes}` : C.anio}.xlsx`);
      toast('Excel descargado', 'ok');
    },
    pdf: () => {
      const e = inf.empresa;
      const fila = (cols, clase = '') => `<tr class="${clase}">${cols.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('')}</tr>`;
      imprimirHoja(`
        <div class="cab"><div><h1>${esc(e.fe_razon_social || e.nombre_negocio || '')}</h1>
          <div class="muted">${e.fe_nit ? `NIT ${esc(e.fe_nit)}${e.fe_dv ? '-' + esc(e.fe_dv) : ''} · ` : ''}${esc([e.direccion, e.ciudad].filter(Boolean).join(', '))}</div></div>
          <div style="text-align:right"><b>Informe contable</b><br>${esc(periodo)}<br><span class="muted">${desde} a ${hasta}</span></div></div>
        <h2>Estado de resultados</h2>
        <table>${estado.map(([k, v, t]) => fila([k, pesos(v)], t ? 't' : '')).join('')}</table>
        <div class="grid">
          <div><h2>Impuestos por tarifa</h2><table><tr><th>Impuesto</th><th class="n">Base</th><th class="n">Impuesto</th></tr>
            ${inf.impuestos.map((x) => fila([x.tipo === 'EXCLUIDO' || !x.tasa ? 'Excluido' : `${x.tipo} ${x.tasa}%`, pesos(x.base), pesos(x.impuesto)])).join('')}</table></div>
          <div><h2>Medios de pago</h2><table>${inf.medios.map((m) => fila([MEDIO[m.medio] || m.medio, pesos(m.valor)])).join('')}</table></div>
        </div>
        <h2>Mes a mes</h2><table><tr><th>Mes</th><th class="n">Ventas</th><th class="n">Ingresos netos</th><th class="n">INC+IVA</th><th class="n">Costo</th><th class="n">Gastos</th><th class="n">Utilidad</th></tr>
          ${inf.mensual.map((m) => fila([nombreMes(m.mes), m.pedidos, pesos(m.ingresos_netos), pesos(m.inc + m.iva), pesos(m.costo_ventas), pesos(m.gastos + m.mermas), pesos(m.utilidad)])).join('')}</table>
        <div class="grid">
          <div><h2>Gastos por categoría</h2><table>${inf.gastos_por_categoria.map((g) => fila([cat(g.categoria), pesos(g.valor)])).join('')}</table></div>
          <div><h2>Compras por proveedor</h2><table><tr><th>Proveedor</th><th>NIT</th><th class="n">Valor</th></tr>
            ${inf.proveedores.map((x) => `<tr><td>${esc(x.proveedor)}</td><td>${esc(x.nit || '—')}</td><td class="n">${pesos(x.valor)}</td></tr>`).join('')}</table></div>
        </div>
        <h2>Otros datos</h2><table>
          ${fila(['Ventas registradas', R.pedidos])}${fila(['Compras de insumos (al inventario)', pesos(R.compras_insumos)])}
          ${fila(['Nómina pagada', pesos(R.nomina)])}${fila(['Inventario valorizado a la fecha de generación', pesos(R.inventario_actual)])}
          ${fila(['Documentos electrónicos vigentes', `${R.documentos_vigentes} · ${pesos(R.facturado_electronicamente)}`])}</table>
        <p class="nota">Generado el ${fechaHora(new Date())} desde el sistema POS. Informe de apoyo para el contador, basado en las ventas cobradas, gastos y compras
          registrados; no reemplaza la contabilidad formal. El detalle de cada venta, gasto y compra está en el archivo Excel.</p>`, `Informe ${periodo}`);
    }
  };
}

const VISTAS = {
  pedidos: vistaPedidos, pedido: vistaPedido, cocina: vistaCocina, domicilios: vistaDomicilios, caja: vistaCaja,
  inventario: vistaInventario, gastos: vistaGastos, menu: vistaMenu, reportes: vistaReportes, ajustes: vistaAjustes,
  restaurantes: vistaRestaurantes, personal: vistaPersonal, facturas: vistaFacturas, contabilidad: vistaContabilidad
};

iniciar();
