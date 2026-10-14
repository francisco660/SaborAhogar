// Avisos en tiempo real (Server-Sent Events) para cocina, meseros y caja.
// Un solo proceso Node, así que basta una lista en memoria.
const clientes = new Set();

export function suscribir(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const cliente = { res, rol: req.usuario.rol };
  clientes.add(cliente);
  const latido = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(latido); clientes.delete(cliente); });
}

export function avisar(tipo, datos = {}) {
  const msg = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const c of clientes) c.res.write(msg);
}
