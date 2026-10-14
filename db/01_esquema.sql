-- ============================================================================
--  POS "Con Sabor a Hogar" — Esquema de base de datos (PostgreSQL 15+)
--
--  Las reglas de negocio viven aquí, no en la app:
--   * El inventario es un libro de movimientos INMUTABLE. El stock = suma.
--   * Al enviar un plato a cocina se descuenta su receta automáticamente.
--   * Un pedido pagado no admite cambios de precio ni ítems nuevos.
--   * Un turno de caja cerrado queda bloqueado.
-- ============================================================================

CREATE SCHEMA pos;
SET search_path TO pos, public;

-- ─── Usuarios y configuración ───────────────────────────────────────────────
CREATE TABLE usuario (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  nombre        text NOT NULL,
  password_hash text NOT NULL,
  rol           text NOT NULL CHECK (rol IN ('admin','cajero','mesero','cocina','domiciliario')),
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ajuste (
  clave text PRIMARY KEY,
  valor text NOT NULL
);

-- ─── Menú ───────────────────────────────────────────────────────────────────
CREATE TABLE categoria (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  orden  int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE producto (
  id           serial PRIMARY KEY,
  categoria_id int NOT NULL REFERENCES categoria,
  nombre       text NOT NULL,
  descripcion  text,
  precio       numeric(12,0) NOT NULL CHECK (precio >= 0),
  activo       boolean NOT NULL DEFAULT true,
  orden        int NOT NULL DEFAULT 0,
  UNIQUE (categoria_id, nombre)
);

-- Grupos de opciones: "Proteína a elección", "Bebida", "Acompañante"...
CREATE TABLE grupo_opcion (
  id          serial PRIMARY KEY,
  producto_id int NOT NULL REFERENCES producto ON DELETE CASCADE,
  nombre      text NOT NULL,
  min_sel     int NOT NULL DEFAULT 1,
  max_sel     int NOT NULL DEFAULT 1,
  orden       int NOT NULL DEFAULT 0,
  CHECK (min_sel >= 0 AND max_sel >= 1 AND max_sel >= min_sel)
);

CREATE TABLE opcion (
  id           serial PRIMARY KEY,
  grupo_id     int NOT NULL REFERENCES grupo_opcion ON DELETE CASCADE,
  nombre       text NOT NULL,
  precio_extra numeric(12,0) NOT NULL DEFAULT 0 CHECK (precio_extra >= 0),
  activo       boolean NOT NULL DEFAULT true,
  orden        int NOT NULL DEFAULT 0
);

-- ─── Insumos y recetas ──────────────────────────────────────────────────────
CREATE TABLE insumo (
  id             serial PRIMARY KEY,
  nombre         text NOT NULL UNIQUE,
  unidad         text NOT NULL CHECK (unidad IN ('g','ml','und')),
  stock_minimo   numeric(14,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  costo_promedio numeric(14,4) NOT NULL DEFAULT 0,   -- costo por unidad (g, ml o und)
  activo         boolean NOT NULL DEFAULT true
);

-- Una receta pertenece a un producto (lo que siempre lleva) o a una opción
-- (lo que agrega esa elección, p. ej. "Chicharrón" agrega 120 g de chicharrón).
CREATE TABLE receta (
  id          serial PRIMARY KEY,
  producto_id int REFERENCES producto ON DELETE CASCADE,
  opcion_id   int REFERENCES opcion ON DELETE CASCADE,
  insumo_id   int NOT NULL REFERENCES insumo,
  cantidad    numeric(14,3) NOT NULL CHECK (cantidad > 0),
  CHECK ((producto_id IS NULL) <> (opcion_id IS NULL))
);
CREATE UNIQUE INDEX receta_unica ON receta (coalesce(producto_id,0), coalesce(opcion_id,0), insumo_id);

-- ─── Mesas, clientes, proveedores ───────────────────────────────────────────
CREATE TABLE mesa (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  orden  int NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true
);

CREATE TABLE cliente (
  id        serial PRIMARY KEY,
  telefono  text NOT NULL UNIQUE,
  nombre    text,
  direccion text,
  barrio    text,
  notas     text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proveedor (
  id       serial PRIMARY KEY,
  nombre   text NOT NULL UNIQUE,
  nit      text,
  telefono text,
  activo   boolean NOT NULL DEFAULT true
);

-- ─── Caja ───────────────────────────────────────────────────────────────────
CREATE TABLE turno_caja (
  id                serial PRIMARY KEY,
  cajero_id         int NOT NULL REFERENCES usuario,
  abierto_en        timestamptz NOT NULL DEFAULT now(),
  base_inicial      numeric(12,0) NOT NULL CHECK (base_inicial >= 0),
  cerrado_en        timestamptz,
  efectivo_esperado numeric(12,0),
  efectivo_contado  numeric(12,0),
  diferencia        numeric(12,0),
  resumen           jsonb,          -- foto del cuadre al momento de cerrar
  nota              text,
  estado            text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado'))
);
-- Una sola caja abierta a la vez
CREATE UNIQUE INDEX turno_unico_abierto ON turno_caja ((true)) WHERE estado = 'abierto';

CREATE TABLE retiro_caja (
  id         serial PRIMARY KEY,
  turno_id   int NOT NULL REFERENCES turno_caja,
  valor      numeric(12,0) NOT NULL CHECK (valor > 0),
  motivo     text NOT NULL,
  usuario_id int REFERENCES usuario,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

-- ─── Pedidos ────────────────────────────────────────────────────────────────
CREATE TABLE pedido (
  id                serial PRIMARY KEY,
  tipo              text NOT NULL CHECK (tipo IN ('MESA','LLEVAR','DOMICILIO')),
  mesa_id           int REFERENCES mesa,
  cliente_id        int REFERENCES cliente,
  nombre_cliente    text,                 -- para llevar: "a nombre de..."
  direccion_entrega text,
  costo_envio       numeric(12,0) NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
  estado            text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','pagado','anulado')),
  mesero_id         int REFERENCES usuario,
  domiciliario_id   int REFERENCES usuario,
  despachado_en     timestamptz,
  entregado_en      timestamptz,
  nota              text,
  motivo_anulacion  text,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  cerrado_en        timestamptz,
  CHECK (tipo <> 'MESA' OR mesa_id IS NOT NULL),
  CHECK (tipo <> 'DOMICILIO' OR cliente_id IS NOT NULL)
);
CREATE INDEX pedido_estado ON pedido (estado);
CREATE INDEX pedido_cerrado ON pedido (cerrado_en);

CREATE TABLE pedido_item (
  id          serial PRIMARY KEY,
  pedido_id   int NOT NULL REFERENCES pedido,
  producto_id int NOT NULL REFERENCES producto,
  nombre      text NOT NULL,            -- copia del nombre al momento de vender
  cantidad    int NOT NULL CHECK (cantidad > 0),
  precio_unit numeric(12,0) NOT NULL,   -- precio + opciones, congelado al vender
  nota        text,
  estado      text NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','en_cocina','listo','entregado','anulado')),
  costo_unit  numeric(14,2),            -- costo de receta al enviarlo a cocina
  creado_en   timestamptz NOT NULL DEFAULT now(),
  enviado_en  timestamptz,
  listo_en    timestamptz
);
CREATE INDEX pedido_item_pedido ON pedido_item (pedido_id);
CREATE INDEX pedido_item_estado ON pedido_item (estado);

CREATE TABLE pedido_item_opcion (
  item_id      int NOT NULL REFERENCES pedido_item ON DELETE CASCADE,
  opcion_id    int NOT NULL REFERENCES opcion,
  nombre       text NOT NULL,
  precio_extra numeric(12,0) NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, opcion_id)
);

-- Un pago con turno_id NULL es efectivo que tiene el domiciliario y
-- todavía no ha entregado en caja (pendiente por liquidar).
CREATE TABLE pago (
  id              serial PRIMARY KEY,
  pedido_id       int NOT NULL REFERENCES pedido,
  medio           text NOT NULL CHECK (medio IN ('EFECTIVO','NEQUI','DAVIPLATA','TARJETA','TRANSFERENCIA')),
  valor           numeric(12,0) NOT NULL CHECK (valor > 0),
  turno_id        int REFERENCES turno_caja,
  domiciliario_id int REFERENCES usuario,
  registrado_por  int REFERENCES usuario,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  liquidado_en    timestamptz,
  CHECK (turno_id IS NOT NULL OR (medio = 'EFECTIVO' AND domiciliario_id IS NOT NULL))
);
CREATE INDEX pago_turno ON pago (turno_id);

-- ─── Gastos ─────────────────────────────────────────────────────────────────
CREATE TABLE gasto (
  id               serial PRIMARY KEY,
  fecha            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota')::date,
  categoria        text NOT NULL CHECK (categoria IN
                   ('COMPRA_INSUMOS','ARRIENDO','SERVICIOS','NOMINA','GAS','MANTENIMIENTO','DOMICILIOS','OTROS')),
  proveedor_id     int REFERENCES proveedor,
  empleado_id      int REFERENCES empleado,
  descripcion      text,
  valor            numeric(12,0) NOT NULL CHECK (valor > 0),
  medio_pago       text NOT NULL CHECK (medio_pago IN
                   ('EFECTIVO','NEQUI','DAVIPLATA','TARJETA','TRANSFERENCIA','CREDITO')),
  pagado_de_caja   boolean NOT NULL DEFAULT false,
  turno_id         int REFERENCES turno_caja,
  anulado          boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  usuario_id       int REFERENCES usuario,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT pagado_de_caja OR (medio_pago = 'EFECTIVO' AND turno_id IS NOT NULL))
);

-- Detalle de una compra de insumos: alimenta el inventario
CREATE TABLE gasto_item (
  id          serial PRIMARY KEY,
  gasto_id    int NOT NULL REFERENCES gasto,
  insumo_id   int NOT NULL REFERENCES insumo,
  cantidad    numeric(14,3) NOT NULL CHECK (cantidad > 0),
  costo_total numeric(12,0) NOT NULL CHECK (costo_total >= 0)
);

-- ─── Inventario (libro de movimientos) ──────────────────────────────────────
CREATE TABLE movimiento_inventario (
  id             bigserial PRIMARY KEY,
  insumo_id      int NOT NULL REFERENCES insumo,
  tipo           text NOT NULL CHECK (tipo IN
                 ('INICIAL','COMPRA','REVERSO_COMPRA','CONSUMO_VENTA','REVERSO_VENTA','MERMA','AJUSTE_CONTEO')),
  cantidad       numeric(14,3) NOT NULL CHECK (cantidad <> 0),   -- + entra, − sale
  costo_unit     numeric(14,4) NOT NULL DEFAULT 0,
  pedido_item_id int REFERENCES pedido_item,
  gasto_id       int REFERENCES gasto,
  nota           text,
  usuario_id     int REFERENCES usuario,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mov_insumo ON movimiento_inventario (insumo_id);
CREATE INDEX mov_item ON movimiento_inventario (pedido_item_id);
CREATE INDEX mov_fecha ON movimiento_inventario (creado_en);

-- ============================================================================
--  TRIGGERS
-- ============================================================================

-- Registros que nunca se modifican ni se borran
CREATE FUNCTION f_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se pueden %; registre un movimiento de reverso.',
    TG_TABLE_NAME, CASE TG_OP WHEN 'DELETE' THEN 'borrar' ELSE 'modificar' END;
END $$;

CREATE TRIGGER t_inmutable BEFORE UPDATE OR DELETE ON movimiento_inventario
  FOR EACH ROW EXECUTE FUNCTION f_inmutable();
CREATE TRIGGER t_inmutable BEFORE UPDATE OR DELETE ON gasto_item
  FOR EACH ROW EXECUTE FUNCTION f_inmutable();
CREATE TRIGGER t_inmutable BEFORE UPDATE OR DELETE ON retiro_caja
  FOR EACH ROW EXECUTE FUNCTION f_inmutable();

-- Exige que el turno referenciado esté abierto
CREATE FUNCTION f_turno_abierto(p_turno int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_turno IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM turno_caja WHERE id = p_turno AND estado = 'abierto') THEN
    RAISE EXCEPTION 'El turno de caja % no está abierto', p_turno;
  END IF;
END $$;

-- ─── Costo promedio ponderado (en compras e inventario inicial) ─────────────
CREATE FUNCTION f_costo_promedio() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_costo numeric;
  v_stock numeric;
BEGIN
  IF NEW.tipo IN ('INICIAL','COMPRA') THEN
    SELECT costo_promedio INTO v_costo FROM insumo WHERE id = NEW.insumo_id FOR UPDATE;
    SELECT greatest(coalesce(sum(cantidad),0), 0) INTO v_stock
      FROM movimiento_inventario WHERE insumo_id = NEW.insumo_id AND id <> NEW.id;
    UPDATE insumo
       SET costo_promedio = (v_stock * v_costo + NEW.cantidad * NEW.costo_unit) / (v_stock + NEW.cantidad)
     WHERE id = NEW.insumo_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER t_costo_promedio AFTER INSERT ON movimiento_inventario
  FOR EACH ROW EXECUTE FUNCTION f_costo_promedio();

-- ─── Turno de caja: cerrado = bloqueado ─────────────────────────────────────
CREATE FUNCTION f_turno_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los turnos de caja no se pueden borrar';
  END IF;
  IF OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'El turno % ya está cerrado y no admite cambios', OLD.id;
  END IF;
  IF NEW.estado = 'cerrado' THEN
    NEW.cerrado_en := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER t_turno_protegido BEFORE UPDATE OR DELETE ON turno_caja
  FOR EACH ROW EXECUTE FUNCTION f_turno_protegido();

CREATE FUNCTION f_retiro_turno() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM f_turno_abierto(NEW.turno_id);
  RETURN NEW;
END $$;
CREATE TRIGGER t_retiro_turno BEFORE INSERT ON retiro_caja
  FOR EACH ROW EXECUTE FUNCTION f_retiro_turno();

-- ─── Ítems de pedido ────────────────────────────────────────────────────────
-- 1) Protección según el estado del pedido
CREATE FUNCTION f_item_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM pedido
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.pedido_id ELSE NEW.pedido_id END;

  IF TG_OP = 'DELETE' THEN
    IF v_estado = 'abierto' AND OLD.estado = 'pendiente' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Solo se pueden borrar ítems que aún no se envían a cocina; anúlelo en su lugar';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_estado = 'abierto' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'El pedido % está % y no admite ítems nuevos', NEW.pedido_id, v_estado;
  END IF;

  -- UPDATE: lo comercial (producto, cantidad, precio) solo cambia si está pendiente
  IF (NEW.pedido_id, NEW.producto_id, NEW.cantidad, NEW.precio_unit)
     IS DISTINCT FROM (OLD.pedido_id, OLD.producto_id, OLD.cantidad, OLD.precio_unit)
     AND (OLD.estado <> 'pendiente' OR v_estado <> 'abierto') THEN
    RAISE EXCEPTION 'No se puede modificar un ítem enviado a cocina o de un pedido cerrado';
  END IF;

  IF v_estado = 'anulado' THEN
    RAISE EXCEPTION 'El pedido % está anulado', NEW.pedido_id;
  END IF;
  IF v_estado = 'pagado' AND NEW.estado = 'anulado' AND OLD.estado <> 'anulado' THEN
    RAISE EXCEPTION 'No se puede anular un ítem de un pedido ya pagado';
  END IF;
  RETURN NEW;
END $$;

-- 2) Flujo de estados + descuento automático de inventario
CREATE FUNCTION f_item_estado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_costo numeric;
BEGIN
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;

  IF NOT (
       (OLD.estado = 'pendiente' AND NEW.estado IN ('en_cocina','anulado'))
    OR (OLD.estado = 'en_cocina' AND NEW.estado IN ('listo','anulado'))
    OR (OLD.estado = 'listo'     AND NEW.estado IN ('entregado','anulado'))
    OR (OLD.estado = 'entregado' AND NEW.estado = 'anulado')
  ) THEN
    RAISE EXCEPTION 'Cambio de estado no permitido: % → %', OLD.estado, NEW.estado;
  END IF;

  IF NEW.estado = 'en_cocina' THEN
    NEW.enviado_en := now();
    -- Receta del producto + recetas de las opciones elegidas
    INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, pedido_item_id)
    SELECT r.insumo_id, 'CONSUMO_VENTA', -sum(r.cantidad) * NEW.cantidad, i.costo_promedio, NEW.id
      FROM receta r
      JOIN insumo i ON i.id = r.insumo_id
     WHERE r.producto_id = NEW.producto_id
        OR r.opcion_id IN (SELECT opcion_id FROM pedido_item_opcion WHERE item_id = NEW.id)
     GROUP BY r.insumo_id, i.costo_promedio;

    SELECT coalesce(sum(-cantidad * costo_unit), 0) INTO v_costo
      FROM movimiento_inventario
     WHERE pedido_item_id = NEW.id AND tipo = 'CONSUMO_VENTA';
    NEW.costo_unit := round(v_costo / NEW.cantidad, 2);

  ELSIF NEW.estado = 'listo' THEN
    NEW.listo_en := now();

  ELSIF NEW.estado = 'anulado' AND OLD.estado = 'en_cocina' THEN
    -- Aún no se preparó: los insumos vuelven al inventario.
    -- (Si ya estaba listo/entregado, se perdió: su costo queda como merma.)
    INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, pedido_item_id, nota)
    SELECT insumo_id, 'REVERSO_VENTA', -cantidad, costo_unit, NEW.id, 'Anulado antes de preparar'
      FROM movimiento_inventario
     WHERE pedido_item_id = NEW.id AND tipo = 'CONSUMO_VENTA';
    NEW.costo_unit := NULL;
  END IF;

  RETURN NEW;
END $$;

-- Los BEFORE triggers corren en orden alfabético: primero t1, luego t2
CREATE TRIGGER t1_item_protegido BEFORE INSERT OR UPDATE OR DELETE ON pedido_item
  FOR EACH ROW EXECUTE FUNCTION f_item_protegido();
CREATE TRIGGER t2_item_estado BEFORE UPDATE OF estado ON pedido_item
  FOR EACH ROW EXECUTE FUNCTION f_item_estado();

-- ─── Total de un pedido ─────────────────────────────────────────────────────
CREATE FUNCTION total_pedido(p_pedido int) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sum(cantidad * precio_unit) FROM pedido_item
                    WHERE pedido_id = p_pedido AND estado <> 'anulado'), 0)
       + (SELECT costo_envio FROM pedido WHERE id = p_pedido)
$$;

-- ─── Pedido: flujo y bloqueo ────────────────────────────────────────────────
CREATE FUNCTION f_pedido_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total  numeric;
  v_pagado numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pedidos no se borran; anúlelos';
  END IF;

  IF OLD.estado <> 'abierto' THEN
    -- Cerrado: solo se permite la logística del domicilio
    IF (to_jsonb(NEW) - 'domiciliario_id' - 'despachado_en' - 'entregado_en')
       IS DISTINCT FROM (to_jsonb(OLD) - 'domiciliario_id' - 'despachado_en' - 'entregado_en') THEN
      RAISE EXCEPTION 'El pedido % está % y no admite cambios', OLD.id, OLD.estado;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado = 'pagado' THEN
    v_total := coalesce((SELECT sum(cantidad * precio_unit) FROM pedido_item
                          WHERE pedido_id = NEW.id AND estado <> 'anulado'), 0) + NEW.costo_envio;
    SELECT coalesce(sum(valor), 0) INTO v_pagado FROM pago WHERE pedido_id = NEW.id;
    IF v_total <= 0 THEN
      RAISE EXCEPTION 'El pedido % no tiene ítems para cobrar', NEW.id;
    END IF;
    IF v_pagado <> v_total THEN
      RAISE EXCEPTION 'Los pagos (%) no coinciden con el total del pedido (%)', v_pagado, v_total;
    END IF;
    IF EXISTS (SELECT 1 FROM pedido_item WHERE pedido_id = NEW.id AND estado = 'pendiente') THEN
      RAISE EXCEPTION 'Hay ítems sin enviar a cocina; envíelos o bórrelos antes de cobrar';
    END IF;
    NEW.cerrado_en := now();

  ELSIF NEW.estado = 'anulado' THEN
    IF coalesce(trim(NEW.motivo_anulacion), '') = '' THEN
      RAISE EXCEPTION 'Para anular un pedido debe indicar el motivo';
    END IF;
    IF EXISTS (SELECT 1 FROM pago WHERE pedido_id = NEW.id) THEN
      RAISE EXCEPTION 'El pedido tiene pagos registrados y no se puede anular';
    END IF;
    IF EXISTS (SELECT 1 FROM pedido_item WHERE pedido_id = NEW.id AND estado <> 'anulado') THEN
      RAISE EXCEPTION 'Anule primero todos los ítems del pedido';
    END IF;
    NEW.cerrado_en := now();
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER t_pedido_protegido BEFORE UPDATE OR DELETE ON pedido
  FOR EACH ROW EXECUTE FUNCTION f_pedido_protegido();

-- ─── Pagos: inmutables salvo la liquidación del domiciliario ────────────────
CREATE FUNCTION f_pago_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT estado FROM pedido WHERE id = NEW.pedido_id) <> 'abierto' THEN
      RAISE EXCEPTION 'El pedido % ya no está abierto', NEW.pedido_id;
    END IF;
    PERFORM f_turno_abierto(NEW.turno_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.turno_id IS NULL AND NEW.turno_id IS NOT NULL
     AND (to_jsonb(NEW) - 'turno_id' - 'liquidado_en') = (to_jsonb(OLD) - 'turno_id' - 'liquidado_en') THEN
    PERFORM f_turno_abierto(NEW.turno_id);
    NEW.liquidado_en := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Los pagos no se pueden modificar ni borrar';
END $$;

CREATE TRIGGER t_pago_protegido BEFORE INSERT OR UPDATE OR DELETE ON pago
  FOR EACH ROW EXECUTE FUNCTION f_pago_protegido();

-- ─── Gastos ─────────────────────────────────────────────────────────────────
CREATE FUNCTION f_gasto_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pagado_de_caja THEN PERFORM f_turno_abierto(NEW.turno_id); END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los gastos no se borran; anúlelos';
  END IF;
  -- UPDATE: solo anular, una vez, con motivo
  IF OLD.anulado OR NOT NEW.anulado
     OR (to_jsonb(NEW) - 'anulado' - 'motivo_anulacion') IS DISTINCT FROM (to_jsonb(OLD) - 'anulado' - 'motivo_anulacion') THEN
    RAISE EXCEPTION 'Un gasto registrado solo se puede anular';
  END IF;
  IF coalesce(trim(NEW.motivo_anulacion), '') = '' THEN
    RAISE EXCEPTION 'Indique el motivo de la anulación';
  END IF;
  IF OLD.pagado_de_caja THEN PERFORM f_turno_abierto(OLD.turno_id); END IF;

  -- Las compras anuladas salen del inventario
  INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, gasto_id, nota)
  SELECT insumo_id, 'REVERSO_COMPRA', -cantidad, costo_unit, gasto_id, 'Gasto anulado'
    FROM movimiento_inventario WHERE gasto_id = OLD.id AND tipo = 'COMPRA';
  RETURN NEW;
END $$;

CREATE TRIGGER t_gasto_protegido BEFORE INSERT OR UPDATE OR DELETE ON gasto
  FOR EACH ROW EXECUTE FUNCTION f_gasto_protegido();

-- Cada línea de compra entra al inventario
CREATE FUNCTION f_gasto_item_entrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, gasto_id, usuario_id)
  SELECT NEW.insumo_id, 'COMPRA', NEW.cantidad, NEW.costo_total / NEW.cantidad, NEW.gasto_id, g.usuario_id
    FROM gasto g WHERE g.id = NEW.gasto_id;
  RETURN NULL;
END $$;

CREATE TRIGGER t_gasto_item_entrada AFTER INSERT ON gasto_item
  FOR EACH ROW EXECUTE FUNCTION f_gasto_item_entrada();

-- ============================================================================
--  VISTAS Y REPORTES
-- ============================================================================

CREATE VIEW v_stock AS
SELECT i.id, i.nombre, i.unidad, i.stock_minimo, i.costo_promedio, i.activo,
       coalesce(m.stock, 0)                          AS stock,
       coalesce(m.stock, 0) < i.stock_minimo         AS alerta,
       round(greatest(coalesce(m.stock,0),0) * i.costo_promedio) AS valor
  FROM insumo i
  LEFT JOIN (SELECT insumo_id, sum(cantidad) AS stock
               FROM movimiento_inventario GROUP BY insumo_id) m ON m.insumo_id = i.id;

-- Costo teórico de cada producto (sin opciones) con el costo promedio actual
CREATE VIEW v_costo_producto AS
SELECT p.id AS producto_id,
       coalesce(sum(r.cantidad * i.costo_promedio), 0) AS costo_base
  FROM producto p
  LEFT JOIN receta r ON r.producto_id = p.id
  LEFT JOIN insumo i ON i.id = r.insumo_id
 GROUP BY p.id;

-- Cuadre de un turno de caja
CREATE FUNCTION cuadre_turno(p_turno int) RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH t AS (SELECT * FROM turno_caja WHERE id = p_turno),
  pg AS (SELECT * FROM pago WHERE turno_id = p_turno),
  v AS (
    SELECT
      (SELECT base_inicial FROM t) AS base_inicial,
      (SELECT coalesce(sum(valor),0) FROM pg WHERE medio = 'EFECTIVO' AND liquidado_en IS NULL) AS ventas_efectivo,
      (SELECT coalesce(sum(valor),0) FROM pg WHERE medio = 'EFECTIVO' AND liquidado_en IS NOT NULL) AS liquidaciones_domiciliarios,
      (SELECT coalesce(sum(valor),0) FROM gasto WHERE turno_id = p_turno AND pagado_de_caja AND NOT anulado) AS gastos_caja,
      (SELECT coalesce(sum(valor),0) FROM retiro_caja WHERE turno_id = p_turno) AS retiros
  )
  SELECT jsonb_build_object(
    'base_inicial', v.base_inicial,
    'ventas_efectivo', v.ventas_efectivo,
    'liquidaciones_domiciliarios', v.liquidaciones_domiciliarios,
    'gastos_caja', v.gastos_caja,
    'retiros', v.retiros,
    'efectivo_esperado', v.base_inicial + v.ventas_efectivo + v.liquidaciones_domiciliarios - v.gastos_caja - v.retiros,
    'por_medio', coalesce((SELECT jsonb_object_agg(medio, total)
                             FROM (SELECT medio, sum(valor) AS total FROM pg GROUP BY medio) x), '{}'::jsonb),
    'total_ventas', (SELECT coalesce(sum(valor),0) FROM pg WHERE liquidado_en IS NULL),
    'pedidos', (SELECT count(DISTINCT pedido_id) FROM pg WHERE liquidado_en IS NULL)
  ) FROM v
$$;

-- Estado de resultados por día (zona horaria de Colombia)
--   ventas − costo de ventas (recetas) = utilidad bruta
--   − mermas/ajustes de inventario − gastos operativos = utilidad operativa
-- Las compras de insumos NO son gasto aquí: entran al inventario y se
-- convierten en costo cuando el plato se vende.
CREATE FUNCTION reporte_utilidad(p_desde date, p_hasta date)
RETURNS TABLE (fecha date, pedidos bigint, ventas numeric, costo_ventas numeric,
               utilidad_bruta numeric, mermas numeric, gastos numeric, utilidad_operativa numeric)
LANGUAGE sql STABLE AS $$
  WITH dias AS (
    SELECT generate_series(p_desde, p_hasta, interval '1 day')::date AS fecha
  ),
  ped AS (
    SELECT p.id, (p.cerrado_en AT TIME ZONE 'America/Bogota')::date AS fecha, p.costo_envio
      FROM pedido p
     WHERE p.estado = 'pagado'
       AND (p.cerrado_en AT TIME ZONE 'America/Bogota')::date BETWEEN p_desde AND p_hasta
  ),
  ven AS (
    SELECT ped.fecha, count(DISTINCT ped.id) AS pedidos,
           sum(ped.costo_envio) + coalesce(sum(it.venta),0) AS ventas,
           coalesce(sum(it.costo),0) AS costo
      FROM ped
      LEFT JOIN LATERAL (
        SELECT sum(i.cantidad * i.precio_unit) AS venta,
               sum(i.cantidad * coalesce(i.costo_unit,0)) AS costo
          FROM pedido_item i WHERE i.pedido_id = ped.id AND i.estado <> 'anulado'
      ) it ON true
     GROUP BY ped.fecha
  ),
  mer AS (
    SELECT (m.creado_en AT TIME ZONE 'America/Bogota')::date AS fecha,
           -sum(m.cantidad * m.costo_unit) AS mermas
      FROM movimiento_inventario m
     WHERE m.tipo IN ('MERMA','AJUSTE_CONTEO')
     GROUP BY 1
  ),
  anu AS (  -- platos anulados después de preparados
    SELECT (i.listo_en AT TIME ZONE 'America/Bogota')::date AS fecha,
           sum(i.cantidad * i.costo_unit) AS mermas
      FROM pedido_item i
     WHERE i.estado = 'anulado' AND i.costo_unit IS NOT NULL
     GROUP BY 1
  ),
  gas AS (
    SELECT g.fecha, sum(g.valor) AS gastos
      FROM gasto g
     WHERE NOT g.anulado AND g.categoria <> 'COMPRA_INSUMOS'
     GROUP BY g.fecha
  )
  SELECT d.fecha,
         coalesce(ven.pedidos, 0),
         coalesce(ven.ventas, 0),
         round(coalesce(ven.costo, 0)),
         round(coalesce(ven.ventas, 0) - coalesce(ven.costo, 0)),
         round(coalesce(mer.mermas, 0) + coalesce(anu.mermas, 0)),
         coalesce(gas.gastos, 0),
         round(coalesce(ven.ventas, 0) - coalesce(ven.costo, 0)
               - coalesce(mer.mermas, 0) - coalesce(anu.mermas, 0) - coalesce(gas.gastos, 0))
    FROM dias d
    LEFT JOIN ven ON ven.fecha = d.fecha
    LEFT JOIN mer ON mer.fecha = d.fecha
    LEFT JOIN anu ON anu.fecha = d.fecha
    LEFT JOIN gas ON gas.fecha = d.fecha
   ORDER BY d.fecha
$$;

CREATE TABLE empleado (
  id        serial PRIMARY KEY,
  nombre    text NOT NULL UNIQUE,
  cargo     text,
  salario   numeric(12,0) NOT NULL CHECK (salario >= 0),
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
