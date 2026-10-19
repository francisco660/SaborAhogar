// npm run crear-usuario -- correo clave rol "Nombre" [restaurante_id]
// Roles: admin | cajero | mesero | cocina | domiciliario
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [email, clave, rol, nombre, restaurante = '1'] = process.argv.slice(2);
const ROLES = ['admin', 'cajero', 'mesero', 'cocina', 'domiciliario'];
if (!email || !clave || !ROLES.includes(rol) || !nombre) {
  console.error('Uso: npm run crear-usuario -- correo clave rol "Nombre" [restaurante_id]');
  console.error('Roles:', ROLES.join(' | '));
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    `INSERT INTO pos.usuario (email, nombre, password_hash, rol, restaurante_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET nombre = $2, password_hash = $3, rol = $4, restaurante_id = $5, activo = true`,
    [email.toLowerCase().trim(), nombre, await bcrypt.hash(clave, 10), rol, Number(restaurante)]
  );
  // El primer administrador del sistema queda como superadministrador
  const { rowCount } = await client.query(
    `UPDATE pos.usuario SET superadmin = true
      WHERE email = $1 AND rol = 'admin' AND NOT EXISTS (SELECT 1 FROM pos.usuario WHERE superadmin)`,
    [email.toLowerCase().trim()]);
  console.log(`Usuario ${email} (${rol}) listo en el restaurante #${restaurante}.${rowCount ? ' Es el superadministrador.' : ''}`);
} finally {
  await client.end();
}
