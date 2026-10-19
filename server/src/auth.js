// Login con JWT. El token lleva { id, rol, nombre, restaurante_id, superadmin }.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { ah } from './util.js';

const router = Router();

router.post('/login', ah(async (req, res) => {
  const { email, clave } = req.body ?? {};
  if (!email || !clave) return res.status(400).json({ error: 'Escriba el correo y la clave' });

  // El correo es único en todo el sistema e indica a qué restaurante entra
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.nombre, u.password_hash, u.rol, u.superadmin,
            u.restaurante_id, r.nombre AS restaurante, r.activo AS restaurante_activo
       FROM usuario u JOIN restaurante r ON r.id = u.restaurante_id
      WHERE u.email = $1 AND u.activo`,
    [String(email).toLowerCase().trim()]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(clave, u.password_hash))) {
    return res.status(401).json({ error: 'Correo o clave incorrectos' });
  }
  if (!u.restaurante_activo && !u.superadmin) {
    return res.status(403).json({ error: 'Este restaurante está desactivado. Comuníquese con el administrador del sistema.' });
  }
  res.json(sesion(u, { id: u.restaurante_id, nombre: u.restaurante }));
}));

// Datos de sesión y token de un usuario dentro de un restaurante
export function sesion(u, restaurante) {
  const datos = { id: u.id, rol: u.rol, nombre: u.nombre, superadmin: !!u.superadmin, restaurante_id: restaurante.id };
  const token = jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRA || '12h' });
  return { token, ...datos, restaurante: restaurante.nombre };
}

// Acepta el token en Authorization o en ?token= (necesario para EventSource)
export function requiereAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || '');
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada. Inicie sesión de nuevo.' });
  }
}

// Solo el superadministrador (administra restaurantes)
export const soloSuperadmin = (req, res, next) =>
  req.usuario.superadmin ? next() : res.status(403).json({ error: 'Solo el superadministrador puede hacer esto' });

// El admin siempre pasa
export const permite = (...roles) => (req, res, next) =>
  req.usuario.rol === 'admin' || roles.includes(req.usuario.rol)
    ? next()
    : res.status(403).json({ error: 'Su rol no tiene permiso para esta acción' });

export default router;
