-- ============================================================================
--  FACTURACIÓN ELECTRÓNICA (DIAN) — independiente del proveedor tecnológico
--  · Impuesto por producto (INC 8 %, IVA 19 % / 5 %, excluido). Precios con impuesto incluido.
--  · Clientes con datos fiscales (para factura electrónica a nombre de alguien).
--  · Documentos electrónicos: POS electrónico, factura electrónica y nota crédito,
--    con su numeración, estado ante la DIAN, CUFE/CUDE, QR y respuesta del proveedor.
--  La configuración (emisor, resoluciones, proveedor y credenciales) vive en los
--  ajustes de cada restaurante (claves fe_*).
--  Idempotente: se puede ejecutar varias veces (Supabase SQL Editor).
-- ============================================================================

SET search_path TO pos, public;

-- ─── Impuesto de cada producto ──────────────────────────────────────────────
ALTER TABLE producto ADD COLUMN IF NOT EXISTS impuesto_tipo text NOT NULL DEFAULT 'INC';
ALTER TABLE producto ADD COLUMN IF NOT EXISTS impuesto_tasa numeric(5,2) NOT NULL DEFAULT 8;
ALTER TABLE producto DROP CONSTRAINT IF EXISTS producto_impuesto_check;
ALTER TABLE producto ADD CONSTRAINT producto_impuesto_check
  CHECK (impuesto_tipo IN ('INC', 'IVA', 'EXCLUIDO') AND impuesto_tasa >= 0 AND impuesto_tasa <= 100);

-- ─── Clientes para factura electrónica ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cliente_fiscal (
  id             serial PRIMARY KEY,
  restaurante_id int NOT NULL DEFAULT coalesce(restaurante_actual(), 1) REFERENCES restaurante,
  tipo_doc       text NOT NULL CHECK (tipo_doc IN ('CC', 'NIT', 'CE', 'PP', 'TI', 'NIT_EXT', 'PEP')),
  numero         text NOT NULL,
  dv             text,                       -- dígito de verificación (NIT)
  tipo_persona   text NOT NULL DEFAULT 'natural' CHECK (tipo_persona IN ('natural', 'juridica')),
  nombre         text NOT NULL,              -- nombre o razón social
  email          text NOT NULL,
  telefono       text,
  direccion      text,
  ciudad         text,
  responsabilidad text NOT NULL DEFAULT 'R-99-PN',  -- responsabilidad fiscal (R-99-PN = no aplica)
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, tipo_doc, numero)
);

-- ─── Documentos electrónicos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documento_electronico (
  id                serial PRIMARY KEY,
  restaurante_id    int NOT NULL DEFAULT coalesce(restaurante_actual(), 1) REFERENCES restaurante,
  pedido_id         int NOT NULL REFERENCES pedido,
  tipo              text NOT NULL CHECK (tipo IN ('POS', 'FACTURA', 'NOTA_CREDITO')),
  prefijo           text NOT NULL DEFAULT '',
  numero            int NOT NULL,
  referencia_id     int REFERENCES documento_electronico,    -- nota crédito → documento que corrige
  cliente_fiscal_id int REFERENCES cliente_fiscal,           -- NULL = consumidor final
  motivo            text,                                     -- nota crédito
  subtotal          numeric(14,2) NOT NULL,                   -- base sin impuestos
  impuestos         jsonb NOT NULL DEFAULT '[]',              -- [{tipo, tasa, base, valor}]
  total             numeric(14,2) NOT NULL,
  datos             jsonb NOT NULL,                           -- foto completa de lo que se envía
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'enviando', 'aceptado', 'rechazado', 'error')),
  proveedor         text,
  ambiente          text,
  cufe              text,                                     -- CUFE (factura) o CUDE (POS / nota)
  qr                text,
  pdf_url           text,
  xml_url           text,
  respuesta         jsonb,
  mensaje           text,                                     -- error o rechazo de la DIAN
  intentos          int NOT NULL DEFAULT 0,
  usuario_id        int REFERENCES usuario,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  enviado_en        timestamptz,
  aceptado_en       timestamptz,
  UNIQUE (restaurante_id, tipo, prefijo, numero)
);
CREATE INDEX IF NOT EXISTS documento_restaurante ON documento_electronico (restaurante_id, creado_en);
CREATE INDEX IF NOT EXISTS documento_pedido ON documento_electronico (pedido_id);
CREATE INDEX IF NOT EXISTS documento_pendientes ON documento_electronico (estado) WHERE estado IN ('pendiente', 'error', 'enviando');
-- Un pedido tiene a lo sumo un POS/factura vigente (las notas crédito no cuentan)
CREATE UNIQUE INDEX IF NOT EXISTS documento_vigente_por_pedido ON documento_electronico (pedido_id)
  WHERE tipo IN ('POS', 'FACTURA') AND estado <> 'rechazado' AND NOT (datos ? 'anulado_por');

-- ─── Permisos y aislamiento por restaurante ─────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON cliente_fiscal, documento_electronico TO pos_app;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE cliente_fiscal_id_seq, documento_electronico_id_seq TO pos_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cliente_fiscal', 'documento_electronico'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS acceso_app ON %I', t);
    EXECUTE format('CREATE POLICY acceso_app ON %I AS PERMISSIVE FOR ALL TO pos_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS aislamiento_restaurante ON %I', t);
    EXECUTE format('CREATE POLICY aislamiento_restaurante ON %I AS RESTRICTIVE FOR ALL TO PUBLIC
                      USING (restaurante_id = restaurante_actual())
                      WITH CHECK (restaurante_id = restaurante_actual())', t);
  END LOOP;
END $$;

-- La copia de menú entre restaurantes también copia el impuesto de cada producto
CREATE OR REPLACE FUNCTION copiar_menu(p_origen int, p_destino int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _mapa (tabla text, viejo int, nuevo int) ON COMMIT DROP;
  TRUNCATE _mapa;

  FOR r IN SELECT * FROM insumo WHERE restaurante_id = p_origen ORDER BY id LOOP
    INSERT INTO insumo (restaurante_id, nombre, unidad, stock_minimo, costo_promedio, activo)
    VALUES (p_destino, r.nombre, r.unidad, r.stock_minimo, r.costo_promedio, r.activo) RETURNING id INTO v;
    INSERT INTO _mapa VALUES ('insumo', r.id, v);
  END LOOP;

  FOR r IN SELECT * FROM categoria WHERE restaurante_id = p_origen ORDER BY id LOOP
    INSERT INTO categoria (restaurante_id, nombre, orden, activo)
    VALUES (p_destino, r.nombre, r.orden, r.activo) RETURNING id INTO v;
    INSERT INTO _mapa VALUES ('categoria', r.id, v);
  END LOOP;

  FOR r IN SELECT * FROM producto WHERE restaurante_id = p_origen ORDER BY id LOOP
    INSERT INTO producto (restaurante_id, categoria_id, nombre, descripcion, precio, activo, orden, impuesto_tipo, impuesto_tasa)
    VALUES (p_destino, (SELECT nuevo FROM _mapa WHERE tabla = 'categoria' AND viejo = r.categoria_id),
            r.nombre, r.descripcion, r.precio, r.activo, r.orden, r.impuesto_tipo, r.impuesto_tasa) RETURNING id INTO v;
    INSERT INTO _mapa VALUES ('producto', r.id, v);
  END LOOP;

  FOR r IN SELECT * FROM grupo_opcion WHERE restaurante_id = p_origen ORDER BY id LOOP
    INSERT INTO grupo_opcion (restaurante_id, producto_id, nombre, min_sel, max_sel, orden)
    VALUES (p_destino, (SELECT nuevo FROM _mapa WHERE tabla = 'producto' AND viejo = r.producto_id),
            r.nombre, r.min_sel, r.max_sel, r.orden) RETURNING id INTO v;
    INSERT INTO _mapa VALUES ('grupo', r.id, v);
  END LOOP;

  FOR r IN SELECT * FROM opcion WHERE restaurante_id = p_origen ORDER BY id LOOP
    INSERT INTO opcion (restaurante_id, grupo_id, nombre, precio_extra, activo, orden)
    VALUES (p_destino, (SELECT nuevo FROM _mapa WHERE tabla = 'grupo' AND viejo = r.grupo_id),
            r.nombre, r.precio_extra, r.activo, r.orden) RETURNING id INTO v;
    INSERT INTO _mapa VALUES ('opcion', r.id, v);
  END LOOP;

  INSERT INTO receta (restaurante_id, producto_id, opcion_id, insumo_id, cantidad)
  SELECT p_destino,
         (SELECT nuevo FROM _mapa WHERE tabla = 'producto' AND viejo = rc.producto_id),
         (SELECT nuevo FROM _mapa WHERE tabla = 'opcion' AND viejo = rc.opcion_id),
         (SELECT nuevo FROM _mapa WHERE tabla = 'insumo' AND viejo = rc.insumo_id),
         rc.cantidad
    FROM receta rc WHERE rc.restaurante_id = p_origen;
END $$;
