// Servidor del POS "Con Sabor a Hogar"
// - Sirve la aplicación web (carpeta /frontend)
// - /api/...  pedidos, cocina, caja, inventario, gastos, reportes
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, conRestaurante } from './db.js';
import authRouter, { requiereAuth, soloSuperadmin } from './auth.js';
import { suscribir } from './eventos.js';
import superadmin from './rutas/superadmin.js';
import menu from './rutas/menu.js';
import pedidos from './rutas/pedidos.js';
import caja from './rutas/caja.js';
import inventario from './rutas/inventario.js';
import admin from './rutas/admin.js';
import personal from './rutas/personal.js';
import facturacion from './rutas/facturacion.js';
import { iniciarReintentos } from './facturacion/documentos.js';

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en server/.env');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Salud: la usa la GitHub Action para mantener despierto el servidor gratuito
app.get('/api/salud', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Sin conexión a PostgreSQL: ' + e.message });
  }
});

app.use('/api', authRouter);
app.get('/api/eventos', requiereAuth, suscribir);
// El superadministrador trabaja por fuera de un restaurante (ve todos)
app.use('/api/superadmin', requiereAuth, soloSuperadmin, superadmin);
// Todo lo demás corre dentro del restaurante del usuario (ver conRestaurante en db.js)
app.use('/api', requiereAuth, conRestaurante, menu, pedidos, caja, inventario, admin, personal, facturacion);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use(express.static(path.resolve(__dirname, '../../frontend')));

// Errores: los de la base de datos (triggers) llegan con su mensaje en español
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code && /^(P0001|23|22)/.test(err.code) ? 400 : 500);
  if (status >= 500) console.error(err);
  let mensaje = err.message;
  if (err.code === '23505') mensaje = 'Ya existe un registro con ese nombre o dato único';
  if (err.code === '23503') mensaje = 'El registro está relacionado con otros datos y no se puede cambiar así';
  res.status(status).json({ error: mensaje });
});

const port = Number(process.env.PORT) || 4100;
app.listen(port, () => console.log(`POS listo en http://localhost:${port}`));
iniciarReintentos();
