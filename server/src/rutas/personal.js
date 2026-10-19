// Control de personal: entradas/salidas (asistencia) y horarios programados
import { Router } from 'express';
import { pool } from '../db.js';
import { permite } from '../auth.js';
import { ah, ErrorApp } from '../util.js';
import { avisar } from '../eventos.js';

const r = Router();
const admin = permite();

// Fecha y hora escritas en la app (hora de Colombia) → timestamptz
const SQL_LOCAL = (n) => `($${n}::timestamp AT TIME ZONE 'America/Bogota')`;
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const horaValida = (v) => /^\d{2}:\d{2}$/.test(String(v || '').slice(0, 5));

// ─── El trabajador: su estado, marcar entrada y salida ──────────────────────
r.get('/asistencia/mia', ah(async (req, res) => {
  const { rows: [abierta] } = await pool.query(
    `SELECT id, entrada FROM asistencia WHERE usuario_id = $1 AND salida IS NULL`, [req.usuario.id]);
  const { rows: turnos } = await pool.query(
    `SELECT hora_inicio, hora_fin FROM horario WHERE usuario_id = $1 AND fecha = current_date ORDER BY hora_inicio`,
    [req.usuario.id]);
  res.json({ abierta: abierta || null, turnos });
}));

r.post('/asistencia/entrada', ah(async (req, res) => {
  try {
    const { rows: [a] } = await pool.query(
      `INSERT INTO asistencia (usuario_id) VALUES ($1) RETURNING id, entrada`, [req.usuario.id]);
    avisar('personal');
    res.json(a);
  } catch (e) {
    if (e.code === '23505') throw new ErrorApp('Ya tiene una entrada registrada; marque primero la salida');
    throw e;
  }
}));

r.post('/asistencia/salida', ah(async (req, res) => {
  const { rows: [a] } = await pool.query(
    `UPDATE asistencia SET salida = now() WHERE usuario_id = $1 AND salida IS NULL RETURNING id, entrada, salida`,
    [req.usuario.id]);
  if (!a) throw new ErrorApp('No tiene una entrada abierta');
  avisar('personal');
  res.json(a);
}));

// ─── Administrador: quién está hoy ──────────────────────────────────────────
r.get('/personal/hoy', admin, ah(async (_req, res) => {
  const { rows: [aj] } = await pool.query(`SELECT valor FROM ajuste WHERE clave = 'tolerancia_llegada'`);
  const { rows } = await pool.query(`
    SELECT u.id, u.nombre, u.rol,
           (SELECT a.id FROM asistencia a WHERE a.usuario_id = u.id AND a.salida IS NULL) AS abierta_id,
           (SELECT a.entrada FROM asistencia a WHERE a.usuario_id = u.id AND a.salida IS NULL) AS trabajando_desde,
           (SELECT min(a.entrada) FROM asistencia a WHERE a.usuario_id = u.id AND a.entrada::date = current_date) AS primera_entrada,
           (SELECT max(a.salida) FROM asistencia a WHERE a.usuario_id = u.id AND a.entrada::date = current_date) AS ultima_salida,
           (SELECT coalesce(sum(extract(epoch FROM coalesce(a.salida, now()) - a.entrada)) / 3600, 0)
              FROM asistencia a WHERE a.usuario_id = u.id AND a.entrada::date = current_date) AS horas_hoy,
           coalesce((SELECT json_agg(json_build_object('id', h.id, 'hora_inicio', h.hora_inicio, 'hora_fin', h.hora_fin)
                                     ORDER BY h.hora_inicio)
                       FROM horario h WHERE h.usuario_id = u.id AND h.fecha = current_date), '[]') AS turnos
      FROM usuario u
     WHERE u.activo AND u.restaurante_id = restaurante_actual()
     ORDER BY u.nombre`);
  res.json({ tolerancia: Number(aj?.valor ?? 10), personas: rows });
}));

// ─── Administrador: registro de entradas y salidas ──────────────────────────
r.get('/asistencia', admin, ah(async (req, res) => {
  const { desde, hasta, usuario_id } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta)) throw new ErrorApp('Rango de fechas inválido');
  const { rows: [aj] } = await pool.query(`SELECT valor FROM ajuste WHERE clave = 'tolerancia_llegada'`);
  const { rows } = await pool.query(`
    SELECT a.id, a.usuario_id, u.nombre, u.rol, a.entrada, a.salida, a.nota, a.corregido,
           rp.nombre AS registrado_por,
           round((extract(epoch FROM coalesce(a.salida, now()) - a.entrada) / 3600)::numeric, 2) AS horas,
           h.hora_inicio, h.hora_fin,
           CASE WHEN h.id IS NULL THEN NULL
                ELSE greatest(0, floor(extract(epoch FROM a.entrada - (h.fecha + h.hora_inicio)::timestamptz) / 60))::int
           END AS minutos_tarde
      FROM asistencia a
      JOIN usuario u ON u.id = a.usuario_id
      LEFT JOIN usuario rp ON rp.id = a.registrado_por
      LEFT JOIN LATERAL (
        SELECT * FROM horario h WHERE h.usuario_id = a.usuario_id AND h.fecha = a.entrada::date
         ORDER BY abs(extract(epoch FROM a.entrada - (h.fecha + h.hora_inicio)::timestamptz)) LIMIT 1) h ON true
     WHERE a.entrada::date BETWEEN $1 AND $2
       AND ($3::int IS NULL OR a.usuario_id = $3)
     ORDER BY a.entrada DESC`,
    [desde, hasta, usuario_id || null]);
  const tolerancia = Number(aj?.valor ?? 10);
  // Resumen por trabajador
  const resumen = Object.values(rows.reduce((acc, x) => {
    const p = acc[x.usuario_id] ||= { usuario_id: x.usuario_id, nombre: x.nombre, rol: x.rol, horas: 0, dias: new Set(), tardes: 0 };
    p.horas += Number(x.horas);
    p.dias.add(new Date(x.entrada).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }));
    if (x.minutos_tarde > tolerancia) p.tardes++;
    return acc;
  }, {})).map((p) => ({ ...p, horas: Math.round(p.horas * 100) / 100, dias: p.dias.size }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json({ tolerancia, registros: rows, resumen });
}));

// Registro manual (olvidó marcar) o corrección
r.post('/asistencia', admin, ah(async (req, res) => {
  const { usuario_id, entrada, salida, nota } = req.body;
  if (!usuario_id || !entrada) throw new ErrorApp('Indique el trabajador y la hora de entrada');
  try {
    await pool.query(
      `INSERT INTO asistencia (usuario_id, entrada, salida, nota, registrado_por, corregido)
       VALUES ($1, ${SQL_LOCAL(2)}, CASE WHEN $3::text IS NULL THEN NULL ELSE ${SQL_LOCAL(3)} END, $4, $5, true)`,
      [usuario_id, entrada, salida || null, nota?.trim() || null, req.usuario.id]);
  } catch (e) {
    if (e.code === '23505') throw new ErrorApp('Ese trabajador ya tiene una entrada abierta; ciérrela primero');
    if (e.code === '23514') throw new ErrorApp('La salida debe ser después de la entrada');
    throw e;
  }
  avisar('personal');
  res.json({ ok: true });
}));

r.patch('/asistencia/:id', admin, ah(async (req, res) => {
  const { entrada, salida, nota } = req.body;
  if (!entrada) throw new ErrorApp('Indique la hora de entrada');
  try {
    const { rowCount } = await pool.query(
      `UPDATE asistencia SET entrada = ${SQL_LOCAL(2)},
              salida = CASE WHEN $3::text IS NULL THEN NULL ELSE ${SQL_LOCAL(3)} END,
              nota = $4, registrado_por = $5, corregido = true
        WHERE id = $1`,
      [req.params.id, entrada, salida || null, nota?.trim() || null, req.usuario.id]);
    if (!rowCount) throw new ErrorApp('Registro no encontrado', 404);
  } catch (e) {
    if (e.code === '23505') throw new ErrorApp('Ese trabajador ya tiene otra entrada abierta');
    if (e.code === '23514') throw new ErrorApp('La salida debe ser después de la entrada');
    throw e;
  }
  avisar('personal');
  res.json({ ok: true });
}));

r.delete('/asistencia/:id', admin, ah(async (req, res) => {
  await pool.query(`DELETE FROM asistencia WHERE id = $1`, [req.params.id]);
  avisar('personal');
  res.json({ ok: true });
}));

// ─── Administrador: horarios programados ────────────────────────────────────
r.get('/horarios', admin, ah(async (req, res) => {
  const { desde, hasta } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta)) throw new ErrorApp('Rango de fechas inválido');
  const { rows } = await pool.query(
    `SELECT h.id, h.usuario_id, to_char(h.fecha, 'YYYY-MM-DD') AS fecha,
            to_char(h.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(h.hora_fin, 'HH24:MI') AS hora_fin, h.nota
       FROM horario h WHERE h.fecha BETWEEN $1 AND $2 ORDER BY h.fecha, h.hora_inicio`, [desde, hasta]);
  res.json(rows);
}));

// { usuario_id, fechas: ['YYYY-MM-DD', ...], hora_inicio, hora_fin, nota }
r.post('/horarios', admin, ah(async (req, res) => {
  const { usuario_id, fechas = [], hora_inicio, hora_fin, nota } = req.body;
  if (!usuario_id) throw new ErrorApp('Elija el trabajador');
  if (!fechas.length || !fechas.every(fechaValida)) throw new ErrorApp('Elija al menos un día');
  if (!horaValida(hora_inicio) || !horaValida(hora_fin)) throw new ErrorApp('Indique la hora de inicio y de fin');
  if (hora_inicio === hora_fin) throw new ErrorApp('La hora de fin debe ser distinta a la de inicio');
  for (const f of fechas) {
    await pool.query(
      `INSERT INTO horario (usuario_id, fecha, hora_inicio, hora_fin, nota) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (usuario_id, fecha, hora_inicio) DO UPDATE SET hora_fin = EXCLUDED.hora_fin, nota = EXCLUDED.nota`,
      [usuario_id, f, hora_inicio, hora_fin, nota?.trim() || null]);
  }
  res.json({ ok: true });
}));

r.patch('/horarios/:id', admin, ah(async (req, res) => {
  const { hora_inicio, hora_fin, nota } = req.body;
  if (!horaValida(hora_inicio) || !horaValida(hora_fin)) throw new ErrorApp('Indique la hora de inicio y de fin');
  await pool.query(`UPDATE horario SET hora_inicio = $2, hora_fin = $3, nota = $4 WHERE id = $1`,
    [req.params.id, hora_inicio, hora_fin, nota?.trim() || null]).catch((e) => {
    if (e.code === '23505') throw new ErrorApp('Ese trabajador ya tiene un turno a esa hora ese día');
    throw e;
  });
  res.json({ ok: true });
}));

r.delete('/horarios/:id', admin, ah(async (req, res) => {
  await pool.query(`DELETE FROM horario WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

// Copia los turnos de la semana anterior a la semana que empieza en "lunes"
r.post('/horarios/copiar-semana', admin, ah(async (req, res) => {
  const { lunes } = req.body;
  if (!fechaValida(lunes)) throw new ErrorApp('Semana inválida');
  const { rowCount } = await pool.query(
    `INSERT INTO horario (usuario_id, fecha, hora_inicio, hora_fin, nota)
     SELECT h.usuario_id, h.fecha + 7, h.hora_inicio, h.hora_fin, h.nota
       FROM horario h JOIN usuario u ON u.id = h.usuario_id AND u.activo
      WHERE h.fecha BETWEEN $1::date - 7 AND $1::date - 1
     ON CONFLICT (usuario_id, fecha, hora_inicio) DO NOTHING`, [lunes]);
  res.json({ ok: true, copiados: rowCount });
}));

export default r;
