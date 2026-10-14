// npm run crear-usuario -- correo clave rol "Nombre"
// Roles: admin | cajero | mesero | cocina | domiciliario
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [email, clave, rol, nombre] = process.argv.slice(2);
const ROLES = ['admin', 'cajero', 'mesero', 'cocina', 'domiciliario'];
if (!email || !clave || !ROLES.includes(rol) || !nombre) {
  console.error('Uso: npm run crear-usuario -- correo clave rol "Nombre"');
  console.error('Roles:', ROLES.join(' | '));
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    `INSERT INTO pos.usuario (email, nombre, password_hash, rol) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET nombre = $2, password_hash = $3, rol = $4, activo = true`,
    [email.toLowerCase().trim(), nombre, await bcrypt.hash(clave, 10), rol]
  );
  console.log(`Usuario ${email} (${rol}) listo.`);
} finally {
  await client.end();
}
