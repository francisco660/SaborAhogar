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
const ESTADO_ITEM = { pendiente: 'Sin enviar', en_cocina: 'En cocina', listo: 'Listo', entregado: 'Entregado', anulado: 'Anulado' };
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

function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 5000 : 2600);
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
      if (!id || S.usuario?.rol !== 'mesero') return;
      const pedido = await api(`/pedidos/${id}`);
      const nuevos = pedido.items.filter((i) => i.estado === 'listo' && !S.avisoListo.has(`${pedido.id}:${i.id}`));
      if (nuevos.length) {
        nuevos.forEach((i) => S.avisoListo.add(`${pedido.id}:${i.id}`));
        const destino = pedido.tipo === 'MESA'
          ? `Mesa ${pedido.mesa || pedido.mesa_id || pedido.id}`
          : pedido.tipo === 'LLEVAR'
            ? 'Para llevar'
            : 'Domicilio';
        const texto = pedido.tipo === 'MESA'
          ? `${destino}: pedido listo (${nuevos.length} item${nuevos.length > 1 ? 's' : ''})`
          : `Pedido #${pedido.id}: ${destino} listo (${nuevos.length} item${nuevos.length > 1 ? 's' : ''})`;
        pitido();
        toast(texto, 'ok');
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
    return ['pendiente', 'en_cocina', 'listo'].filter((k) => c[k])
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
        <button class="mesa ${m.pedido_id ? 'ocupada' : ''}" data-acc="mesa" data-id="${m.id}" data-pedido="${m.pedido_id || ''}">
          <span class="nom">${esc(m.nombre)}</span>
          <span class="det">${m.pedido_id ? `${pesos(m.total)} · ${minutos(m.creado_en)} min` : 'Libre'}</span>
        </button>`).join('')}
    </div>
    <div class="seccion">
      <h3>Para llevar y domicilios</h3>
      ${otros.length ? `<div class="lista-pedidos">${otros.map((p) => `
        <button class="tarjeta pedido-card" data-acc="ver" data-id="${p.id}">
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
  el.className = 'con-barra-movil';
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
    </div>
    <div class="barra-movil" id="barra-movil"></div>`;

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
    irCuenta: () => $('#cuenta').scrollIntoView({ behavior: 'smooth', block: 'center' }),
    enviar: enviarPedido,
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
  const n = S.carrito.reduce((s, l) => s + l.cantidad, 0);
  $('#barra-movil').innerHTML = `<span>${n ? `${n} nuevo(s)` : p ? `Pedido #${p.id}` : 'Pedido vacío'}</span>
    <b>${pesos(total)}</b><button class="aviso peq" data-acc="irCuenta">Ver cuenta ↓</button>`;
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
      if (i.estado === 'en_cocina' && tiene('cajero')) acciones.push(`<button class="peq" data-acc="itemEstado" data-estado="listo" data-id="${i.id}">Listo</button>`);
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