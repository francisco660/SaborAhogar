// Login con JWT. El token lleva { id, rol, nombre }.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { ah } from './util.js';

const router = Router();

router.post('/login', ah(async (req, res) => {
  const { email, clave } = req.body ?? {};
  if (!email || !clave) return res.status(400).json({ error: 'Escriba el correo y la clave' });

  const { rows } = await pool.query(
    `SELECT id, email, nombre, password_hash, rol FROM usuario WHERE email = $1 AND activo`,
    [String(email).toLowerCase().trim()]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(clave, u.password_hash))) {
    return res.status(401).json({ error: 'Correo o clave incorrectos' });
  }
  const token = jwt.sign(
    { id: u.id, rol: u.rol, nombre: u.nombre },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRA || '12h' }
  );
  res.json({ token, id: u.id, nombre: u.nombre, rol: u.rol });
}));

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

// El admin siempre pasa
export const permite = (...roles) => (req, res, next) =>
  req.usuario.rol === 'admin' || roles.includes(req.usuario.rol)
    ? next()
    : res.status(403).json({ error: 'Su rol no tiene permiso para esta acción' });

export default router;
