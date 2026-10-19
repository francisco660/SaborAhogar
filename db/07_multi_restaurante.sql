-- ============================================================================
--  MULTI-RESTAURANTE
--  Cada fila pertenece a un restaurante (restaurante_id). El aislamiento lo
--  garantiza PostgreSQL con seguridad por filas (RLS): el servidor atiende cada
--  petición con el rol "pos_app" y la variable app.restaurante_id; las
--  políticas solo dejan ver y escribir filas de ese restaurante.
--
--  Los datos que ya existen quedan en el restaurante #1.
--  Idempotente: se puede ejecutar varias veces (Supabase SQL Editor).
-- ============================================================================

SET search_path TO pos, public;

-- ─── Restaurantes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurante (
  id        serial PRIMARY KEY,
  nombre    text NOT NULL,
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO restaurante (id, nombre)
SELECT 1, coalesce((SELECT valor FROM ajuste WHERE clave = 'nombre_negocio'), 'Mi restaurante')
WHERE NOT EXISTS (SELECT 1 FROM restaurante WHERE id = 1);
SELECT setval(pg_get_serial_sequence('pos.restaurante', 'id'), greatest((SELECT max(id) FROM restaurante), 1));

-- Restaurante de la petición en curso (NULL si no hay)
CREATE OR REPLACE FUNCTION restaurante_actual() RETURNS int LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.restaurante_id', true), '')::int
$$;

-- ─── Columna restaurante_id en todas las tablas ─────────────────────────────
-- DEFAULT 1 al agregarla llena las filas existentes sin disparar triggers;
-- luego el valor por defecto pasa a ser el restaurante de la petición.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuario','ajuste','categoria','producto','grupo_opcion','opcion','insumo',
    'receta','mesa','cliente','proveedor','turno_caja','retiro_caja','pedido','pedido_item',
    'pedido_item_opcion','pago','empleado','gasto','gasto_item','movimiento_inventario'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS restaurante_id int NOT NULL DEFAULT 1 REFERENCES restaurante', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN restaurante_id SET DEFAULT coalesce(restaurante_actual(), 1)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (restaurante_id)', t || '_restaurante', t);
  END LOOP;
END $$;

-- ─── Lo que antes era único en todo el sistema ahora es único por restaurante ─
ALTER TABLE categoria DROP CONSTRAINT IF EXISTS categoria_nombre_key;
ALTER TABLE categoria DROP CONSTRAINT IF EXISTS categoria_restaurante_nombre_key;
ALTER TABLE categoria ADD CONSTRAINT categoria_restaurante_nombre_key UNIQUE (restaurante_id, nombre);

ALTER TABLE insumo DROP CONSTRAINT IF EXISTS insumo_nombre_key;
ALTER TABLE insumo DROP CONSTRAINT IF EXISTS insumo_restaurante_nombre_key;
ALTER TABLE insumo ADD CONSTRAINT insumo_restaurante_nombre_key UNIQUE (restaurante_id, nombre);

ALTER TABLE mesa DROP CONSTRAINT IF EXISTS mesa_nombre_key;
ALTER TABLE mesa DROP CONSTRAINT IF EXISTS mesa_restaurante_nombre_key;
ALTER TABLE mesa ADD CONSTRAINT mesa_restaurante_nombre_key UNIQUE (restaurante_id, nombre);

ALTER TABLE proveedor DROP CONSTRAINT IF EXISTS proveedor_nombre_key;
ALTER TABLE proveedor DROP CONSTRAINT IF EXISTS proveedor_restaurante_nombre_key;
ALTER TABLE proveedor ADD CONSTRAINT proveedor_restaurante_nombre_key UNIQUE (restaurante_id, nombre);

ALTER TABLE empleado DROP CONSTRAINT IF EXISTS empleado_nombre_key;
ALTER TABLE empleado DROP CONSTRAINT IF EXISTS empleado_restaurante_nombre_key;
ALTER TABLE empleado ADD CONSTRAINT empleado_restaurante_nombre_key UNIQUE (restaurante_id, nombre);

ALTER TABLE cliente DROP CONSTRAINT IF EXISTS cliente_telefono_key;
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS cliente_restaurante_telefono_key;
ALTER TABLE cliente ADD CONSTRAINT cliente_restaurante_telefono_key UNIQUE (restaurante_id, telefono);

ALTER TABLE ajuste DROP CONSTRAINT IF EXISTS ajuste_pkey;
ALTER TABLE ajuste ADD CONSTRAINT ajuste_pkey PRIMARY KEY (restaurante_id, clave);

-- Una caja abierta a la vez, por restaurante
DROP INDEX IF EXISTS turno_unico_abierto;
CREATE UNIQUE INDEX turno_unico_abierto ON turno_caja (restaurante_id) WHERE estado = 'abierto';

-- El correo sigue siendo único en todo el sistema: con él se sabe a qué
-- restaurante entra cada usuario.

-- ─── Superadministrador (crea y administra restaurantes) ────────────────────
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS superadmin boolean NOT NULL DEFAULT false;
UPDATE usuario SET superadmin = true
 WHERE id = (SELECT min(id) FROM usuario WHERE rol = 'admin' AND activo AND restaurante_id = 1)
   AND NOT EXISTS (SELECT 1 FROM usuario WHERE superadmin);

INSERT INTO ajuste (restaurante_id, clave, valor) VALUES (1, 'ciudad', 'Bello, Antioquia')
ON CONFLICT DO NOTHING;

-- ─── Número de pedido por restaurante (#1, #2… en cada uno) ─────────────────
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS numero int;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pedido WHERE numero IS NULL) THEN
    ALTER TABLE pedido DISABLE TRIGGER t_pedido_protegido;
    UPDATE pedido p SET numero = n.num
      FROM (SELECT id, row_number() OVER (PARTITION BY restaurante_id ORDER BY id) AS num FROM pedido) n
     WHERE n.id = p.id AND p.numero IS NULL;
    ALTER TABLE pedido ENABLE TRIGGER t_pedido_protegido;
  END IF;
END $$;
ALTER TABLE pedido ALTER COLUMN numero SET NOT NULL;
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_restaurante_numero_key;
ALTER TABLE pedido ADD CONSTRAINT pedido_restaurante_numero_key UNIQUE (restaurante_id, numero);

CREATE OR REPLACE FUNCTION f_pedido_numero() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serializa la numeración dentro de cada restaurante
  PERFORM pg_advisory_xact_lock(hashtext('pedido_numero'), NEW.restaurante_id);
  SELECT coalesce(max(numero), 0) + 1 INTO NEW.numero FROM pedido WHERE restaurante_id = NEW.restaurante_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_pedido_numero ON pedido;
CREATE TRIGGER t_pedido_numero BEFORE INSERT ON pedido FOR EACH ROW EXECUTE FUNCTION f_pedido_numero();

-- ─── Las vistas respetan la seguridad del usuario que consulta ──────────────
ALTER VIEW v_stock SET (security_invoker = true);
ALTER VIEW v_costo_producto SET (security_invoker = true);

-- ─── Rol de la aplicación ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app') THEN
    CREATE ROLE pos_app NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT pos_app TO %I', current_user);
END $$;
GRANT USAGE ON SCHEMA pos TO pos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pos TO pos_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pos TO pos_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pos TO pos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pos GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pos GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO pos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pos GRANT EXECUTE ON FUNCTIONS TO pos_app;

-- ─── Seguridad por filas ────────────────────────────────────────────────────
-- "acceso_app" (permisiva) deja trabajar al rol pos_app; "aislamiento_restaurante"
-- (restrictiva, para todos los roles) exige que la fila sea del restaurante actual.
-- El dueño de las tablas (scripts, login, superadmin) no queda sujeto a RLS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuario','ajuste','categoria','producto','grupo_opcion','opcion','insumo',
    'receta','mesa','cliente','proveedor','turno_caja','retiro_caja','pedido','pedido_item',
    'pedido_item_opcion','pago','empleado','gasto','gasto_item','movimiento_inventario'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS acceso_app ON %I', t);
    EXECUTE format('CREATE POLICY acceso_app ON %I AS PERMISSIVE FOR ALL TO pos_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS aislamiento_restaurante ON %I', t);
    EXECUTE format('CREATE POLICY aislamiento_restaurante ON %I AS RESTRICTIVE FOR ALL TO PUBLIC
                      USING (restaurante_id = restaurante_actual())
                      WITH CHECK (restaurante_id = restaurante_actual())', t);
  END LOOP;
END $$;

-- Usuarios: el superadministrador se puede LEER desde cualquier restaurante
-- (cuando entra a uno, aparece como cajero/mesero en turnos y pedidos), pero
-- solo su propio restaurante puede modificarlo.
DROP POLICY IF EXISTS aislamiento_restaurante ON usuario;
CREATE POLICY aislamiento_restaurante ON usuario AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (restaurante_id = restaurante_actual() OR superadmin)
  WITH CHECK (restaurante_id = restaurante_actual());
DROP POLICY IF EXISTS usuario_modificar_propios ON usuario;
CREATE POLICY usuario_modificar_propios ON usuario AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (restaurante_id = restaurante_actual());
DROP POLICY IF EXISTS usuario_borrar_propios ON usuario;
CREATE POLICY usuario_borrar_propios ON usuario AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (restaurante_id = restaurante_actual());

ALTER TABLE restaurante ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurante_propio ON restaurante;
CREATE POLICY restaurante_propio ON restaurante FOR SELECT TO pos_app USING (id = restaurante_actual());

-- ─── Copiar el menú de un restaurante a otro (al crear uno nuevo) ───────────
-- Copia insumos (sin stock), categorías, productos, grupos, opciones y recetas.
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
    INSERT INTO producto (restaurante_id, categoria_id, nombre, descripcion, precio, activo, orden)
    VALUES (p_destino, (SELECT nuevo FROM _mapa WHERE tabla = 'categoria' AND viejo = r.categoria_id),
            r.nombre, r.descripcion, r.precio, r.activo, r.orden) RETURNING id INTO v;
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
