-- ============================================================================
--  CONTROL DE PERSONAL: entradas/salidas (asistencia) y horarios programados.
--  Cada trabajador marca su entrada y salida desde la app; la hora la pone el
--  servidor. El administrador programa los turnos y corrige registros.
--  Idempotente: se puede ejecutar varias veces (Supabase SQL Editor).
-- ============================================================================

SET search_path TO pos, public;

-- ─── Entradas y salidas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia (
  id              serial PRIMARY KEY,
  restaurante_id  int NOT NULL DEFAULT coalesce(restaurante_actual(), 1) REFERENCES restaurante,
  usuario_id      int NOT NULL REFERENCES usuario,
  entrada         timestamptz NOT NULL DEFAULT now(),
  salida          timestamptz,
  nota            text,
  registrado_por  int REFERENCES usuario,     -- NULL = lo marcó el propio trabajador
  corregido       boolean NOT NULL DEFAULT false,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CHECK (salida IS NULL OR salida > entrada)
);
CREATE INDEX IF NOT EXISTS asistencia_restaurante ON asistencia (restaurante_id);
CREATE INDEX IF NOT EXISTS asistencia_usuario_entrada ON asistencia (usuario_id, entrada);
-- Un trabajador no puede tener dos entradas abiertas a la vez
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_una_abierta ON asistencia (usuario_id) WHERE salida IS NULL;

-- ─── Horarios programados ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horario (
  id              serial PRIMARY KEY,
  restaurante_id  int NOT NULL DEFAULT coalesce(restaurante_actual(), 1) REFERENCES restaurante,
  usuario_id      int NOT NULL REFERENCES usuario,
  fecha           date NOT NULL,
  hora_inicio     time NOT NULL,
  hora_fin        time NOT NULL,              -- si es menor que el inicio, termina al día siguiente
  nota            text,
  UNIQUE (usuario_id, fecha, hora_inicio)
);
CREATE INDEX IF NOT EXISTS horario_restaurante_fecha ON horario (restaurante_id, fecha);

-- ─── Permisos y aislamiento por restaurante (igual que las demás tablas) ────
GRANT SELECT, INSERT, UPDATE, DELETE ON asistencia, horario TO pos_app;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE asistencia_id_seq, horario_id_seq TO pos_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asistencia', 'horario'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS acceso_app ON %I', t);
    EXECUTE format('CREATE POLICY acceso_app ON %I AS PERMISSIVE FOR ALL TO pos_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS aislamiento_restaurante ON %I', t);
    EXECUTE format('CREATE POLICY aislamiento_restaurante ON %I AS RESTRICTIVE FOR ALL TO PUBLIC
                      USING (restaurante_id = restaurante_actual())
                      WITH CHECK (restaurante_id = restaurante_actual())', t);
  END LOOP;
END $$;
