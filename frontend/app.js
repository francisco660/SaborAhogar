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

// ─── Impresión de tickets (impresora térmica de 80 mm) ───────────────────────
function imprimir(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 3mm; }
    body { font: 12px/1.35 "Courier New", monospace; width: 72mm; margin: 0; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0; }
    .c { text-align: center; } .r { text-align: right; } hr { border: 0; border-top: 1px dashed #000; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
    .g { font-size: 15px; font-weight: bold; } .o { padding-left: 10px; font-size: 11px; }
  </style></head><body>${html}</body></html>`);
  d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 150);
}

function ticketPedido(p, tipo = 'cuenta') {
  const a = S.ajustes;
  const items = p.items.filter((i) => i.estado !== 'anulado');
  const dest = p.tipo === 'MESA' ? p.mesa : p.tipo === 'DOMICILIO' ? 'DOMICILIO' : 'PARA LLEVAR';
  if (tipo === 'comanda') {
    return `<h1>COMANDA #${p.id}</h1><p class="c g">${esc(dest)}</p><p class="c">${fechaHora(new Date())}</p><hr>
      ${items.map((i) => `<div class="g">${i.cantidad} × ${esc(i.nombre)}</div>
        ${i.opciones.length ? `<div class="o">${esc(i.opciones.join(', '))}</div>` : ''}
        ${i.nota ? `<div class="o">» ${esc(i.nota)}</div>` : ''}`).join('')}
      ${p.nota ? `<hr><div>NOTA: ${esc(p.nota)}</div>` : ''}`;
  }
  return `<h1>${esc(a.nombre_negocio || 'Con Sabor a Hogar')}</h1>
    <p class="c">${esc(a.direccion || '')}<br>Tel. ${esc(a.telefono || '')}</p><hr>
    <div>Pedido #${p.id} · ${esc(dest)}</div><div>${fechaHora(p.cerrado_en || p.creado_en)}</div>
    ${p.cliente ? `<div>Cliente: ${esc(p.cliente)} ${esc(p.telefono || '')}</div>` : ''}
    ${p.direccion_entrega ? `<div>Dir: ${esc(p.direccion_entrega)} ${esc(p.barrio || '')}</div>` : ''}
    <hr><table>
    ${items.map((i) => `<tr><td>${i.cantidad} ${esc(i.nombre)}${i.opciones.length ? `<div class="o">${esc(i.opciones.join(', '))}</div>` : ''}</td>
      <td class="r">${pesos(i.cantidad * i.precio_unit)}</td></tr>`).join('')}
    ${p.costo_envio > 0 ? `<tr><td>Domicilio</td><td class="r">${pesos(p.costo_envio)}</td></tr>` : ''}
    </table><hr><table><tr><td class="g">TOTAL</td><td class="r g">${pesos(p.total)}</td></tr>
    ${p.pagos.map((pg) => `<tr><td>${MEDIO[pg.medio]}${pg.por_liquidar ? ' (contra entrega)' : ''}</td><td class="r">${pesos(pg.valor)}</td></tr>`).join('')}
    </table><hr><p class="c">${esc(a.pie_ticket || '¡Gracias por su compra!')}</p>`;
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
  ['inventario', 'Inventario', ['cajero']],
  ['gastos', 'Gastos', ['cajero']],
  ['menu', 'Menú', []],
  ['reportes', 'Reportes', []],
  ['ajustes', 'Ajustes', []]
];
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
  $('#u-rol').textContent = ROL[S.usuario.rol];
  $('#nav').innerHTML = NAV.filter(([, , r]) => tiene(...r))
    .map(([v, t]) => `<a href="#${v}" data-v="${v}">${t}</a>`).join('');
  try { S.ajustes = await api('/ajustes'); } catch { /* sigue */ }
  abrirEventos();
  if (!location.hash) location.hash = inicioRol();
  else navegar();
}

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!S.usuario) return;
  const [nombre, ...args] = (location.hash.slice(1) || inicioRol()).split('/');
  const permitido = NAV.find(([v]) => v === nombre)?.[2] ?? PERMISO_VISTA[nombre];
  if (!VISTAS[nombre] || !permitido || !tiene(...permitido)) { location.hash = inicioRol(); return; }
  S.vista = { nombre, args };
  S.acc = {};
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
          : `Pedido #${pedido.id}: ${destino} listo (${nuevos.length} item${nuevos.length > 1 ? 's' : ''})`;
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
          <div class="entre"><b>#${p.id} · ${TIPO[p.tipo]}</b><b>${pesos(p.total)}</b></div>
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
          <td>${p.id}</td><td>${hora(p.creado_en)}</td><td>${TIPO[p.tipo]}</td>
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
          <input id="buscar" placeholder="Buscar plato…" style="max-width:260px" autocomplete="off">
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
      const motivo = await confirmar(`¿Anular el pedido #${S.pedido.id}? Los ítems que no se han preparado vuelven al inventario.`,
        { boton: 'Anular pedido', peligro: true, campo: 'Motivo' });
      if (!motivo) return;
      await api(`/pedidos/${S.pedido.id}/anular`, { method: 'POST', body: { motivo } });
      toast('Pedido anulado');
      location.hash = 'pedidos';
    },
    imprimirCuenta: () => imprimir(ticketPedido(S.pedido, 'cuenta')),
    imprimirComanda: () => imprimir(ticketPedido(S.pedido, 'comanda')),
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
    </button>`).join('') || '<p class="vacio">Sin resultados</p>';
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
    ${cabeceraModal(`Datos del domicilio #${p.id}`)}
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
    cabecera = `<h3><span>#${p.id} · ${destino}</span><span class="chip ${p.estado}">${p.estado}</h3>
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
  toast(`Pedido #${p.id} enviado a cocina`, 'ok');
  location.hash = `pedido/${p.id}`;
}

function modalCobro(p) {
  const puedeLiquidar = p.tipo === 'DOMICILIO' && p.domiciliario_id;
  const modal = abrirModal(`
    ${cabeceraModal(`Cobrar pedido #${p.id}`)}
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
      <div class="pie"><button type="button" data-acc="cerrar">Cancelar</button><button class="exito" id="btn-cobrar">Cobrar</button></div>
    </form>`, {
    todo: (b, m) => {
      MEDIOS.forEach((x) => { m.querySelector(`[name=${x}]`).value = x === b.dataset.m ? p.total : ''; });
      recalcular(m);
    },
    input: (_e, m) => recalcular(m),
    change: (_e, m) => recalcular(m),
    submit: async (f, _m, cerrar) => {
      let body;
      if (f.liquidar?.checked) body = { por_liquidar: true };
      else body = { pagos: MEDIOS.map((x) => ({ medio: x, valor: Number(f[x].value) || 0 })).filter((x) => x.valor > 0) };
      const r = await api(`/pedidos/${p.id}/cobrar`, { method: 'POST', body });
      cerrar();
      toast(`Pedido #${p.id} cobrado`, 'ok');
      S.pedido = r;
      if (await confirmar('¿Imprimir el recibo?', { boton: 'Imprimir' })) imprimir(ticketPedido(r, 'cuenta'));
      location.hash = 'pedidos';
    }
  });
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
        <header><b>${destino} · #${c.id}</b><span>${min} min</span></header>
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
      <div class="entre"><b>#${p.id} · ${esc(p.cliente || '')}</b><b>${pesos(p.total)}</b></div>
      <div>📍 ${esc(p.direccion_entrega || '')} ${p.barrio ? '· ' + esc(p.barrio) : ''}
        <a class="chico" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.direccion_entrega || '') + ', Bello, Antioquia')}">mapa</a></div>
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
      <tbody>${entregados.map((p) => `<tr><td>${p.id}</td><td>${esc(p.cliente || '')}</td><td>${esc(p.domiciliario || '')}</td>
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
              #${x.pedido_id} · ${esc(x.domiciliario)} · ${esc(x.cliente || '')} — <b>${pesos(x.valor)}</b>
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
        <td class="chico suave">${m.pedido_id ? `Pedido #${m.pedido_id}` : ''} ${esc(m.nota || '')} ${esc(m.usuario || '')}</td></tr>`).join('')}</tbody></table></div>`;
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
  el.innerHTML = `
    <div class="titulo-vista"><h2>Menú, precios y recetas</h2></div>
    ${delDia.map(tarjetaDia).join('')}
    <div class="tarjeta">
      <p class="suave chico">Listado del menú actual. Aquí se administran categorías, productos y costos.</p>
      ${menu.map((c) => `<div class="seccion">
        <h3>${esc(c.nombre)} ${c.activo ? '' : '<span class="chip anulado">oculta</span>'}</h3>
        <div class="tabla-cont"><table><thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Costo</th><th class="num">% costo</th></tr></thead>
        <tbody>${c.productos.map((p) => {
          const pc = p.precio ? (p.costo_base / p.precio) * 100 : NaN;
          return `<tr class="${p.activo ? '' : 'suave'}">
            <td>${esc(p.nombre)} ${p.activo ? '' : '<span class="chip anulado">inactivo</span>'}</td>
            <td class="num">${pesos(p.precio)}</td>
            <td class="num">${pesos(p.costo_base)}</td>
            <td class="num ${pc > 40 ? 'negativo' : ''}">${pct(pc)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" class="suave">Sin productos</td></tr>'}</tbody>
      </table></div>
      </div>`).join('') || '<p class="suave">Sin categorías.</p>'}
    </div>`;
  S.acc = {
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
          <td class="derecha admin-actions">
            <button class="peq" data-acc="editarUsuario" data-id="${u.id}">Editar</button>
            <button class="peq" data-acc="claveUsuario" data-id="${u.id}">Clave</button>
            <button class="peq peligro" data-acc="eliminarUsuario" data-id="${u.id}">${u.activo ? 'Eliminar' : 'Inactivo'}</button>
            <button class="peq" data-acc="toggleUsuario" data-id="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>
          </td></tr>`).join('')}</tbody></table></div>
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
          <td class="derecha admin-actions">
            <button class="peq" data-acc="editarEmpleado" data-id="${e.id}">Editar</button>
            <button class="peq peligro" data-acc="eliminarEmpleado" data-id="${e.id}">${e.activo ? 'Eliminar' : 'Inactivo'}</button>
            <button class="peq" data-acc="toggleEmpleado" data-id="${e.id}" data-activo="${e.activo}">${e.activo ? 'Desactivar' : 'Activar'}</button>
          </td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin empleados registrados.</td></tr>'}</tbody></table></div>
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
      <h3>Datos del negocio (tickets)</h3>
      <form data-submit="negocio">
        <div class="campos">
          <div><label>Nombre</label><input name="nombre_negocio" value="${esc(aj.nombre_negocio || '')}"></div>
          <div><label>Teléfono</label><input name="telefono" value="${esc(aj.telefono || '')}"></div>
          <div><label>Dirección</label><input name="direccion" value="${esc(aj.direccion || '')}"></div>
          <div><label>Costo de domicilio por defecto</label><input name="costo_envio" type="number" min="0" step="500" value="${esc(aj.costo_envio || 0)}"></div>
        </div>
        <div class="campo" style="margin-top:.6rem"><label>Mensaje al pie del ticket</label><input name="pie_ticket" value="${esc(aj.pie_ticket || '')}"></div>
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
    negocio: async (f) => {
      const body = Object.fromEntries(new FormData(f));
      await api('/ajustes', { method: 'PUT', body });
      S.ajustes = await api('/ajustes');
      toast('Datos guardados', 'ok');
    }
  };
}

const VISTAS = {
  pedidos: vistaPedidos, pedido: vistaPedido, cocina: vistaCocina, domicilios: vistaDomicilios, caja: vistaCaja,
  inventario: vistaInventario, gastos: vistaGastos, menu: vistaMenu, reportes: vistaReportes, ajustes: vistaAjustes
};

iniciar();
