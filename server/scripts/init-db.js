// Crea el esquema "pos" y carga el menú inicial.
//   npm run db:init               -> solo si el esquema no existe
//   npm run db:init -- --reiniciar -> BORRA el esquema pos y lo crea de nuevo
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db');
const reiniciar = process.argv.includes('--reiniciar');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows } = await client.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pos'`);
  if (rows.length && !reiniciar) {
    console.log('El esquema "pos" ya existe. Use --reiniciar para borrarlo y crearlo de nuevo (se pierden los datos).');
    process.exit(0);
  }
  await client.query('BEGIN');
  if (reiniciar) await client.query('DROP SCHEMA IF EXISTS pos CASCADE');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    console.log('Ejecutando', f);
    await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  await client.query('COMMIT');
  // Toda conexión a esta base usa el esquema pos y la hora de Colombia
  await client.query(`DO $$ BEGIN
    EXECUTE format('ALTER DATABASE %I SET search_path TO pos, public', current_database());
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Bogota');
  END $$`);
  console.log('Base de datos lista. Cree el primer usuario con:');
  console.log('  npm run crear-usuario -- correo@ejemplo.com clave admin "Nombre"');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Error:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
