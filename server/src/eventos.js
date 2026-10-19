// Avisos en tiempo real (Server-Sent Events) para cocina, meseros y caja.
// Un solo proceso Node, así que basta una lista en memoria. Cada aviso llega
// solo a los usuarios del mismo restaurante.
import { alConfirmar, contexto } from './db.js';

const clientes = new Set();

export function suscribir(req, res) {
  const restaurante = Number(req.usuario.restaurante_id);
  if (!restaurante) return res.status(401).json({ error: 'Sesión inválida o expirada. Inicie sesión de nuevo.' });
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const cliente = { res, rol: req.usuario.rol, restaurante };
  clientes.add(cliente);
  const latido = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(latido); clientes.delete(cliente); });
}

// Avisa a los usuarios del restaurante de la petición en curso, una vez guardados los cambios
export function avisar(tipo, datos = {}) {
  const restaurante = contexto.getStore()?.restaurante_id;
  if (!restaurante) return;
  const msg = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  alConfirmar(() => {
    for (const c of clientes) if (c.restaurante === restaurante) c.res.write(msg);
  });
}
