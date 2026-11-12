-- Tipo de negocio: el sistema sirve para cualquier comercio, no solo restaurantes.
--   ajuste 'tipo_negocio' = 'restaurante' (por defecto) | 'tienda'
--   En modo tienda se ocultan mesas y cocina, se vende directo desde el mostrador
--   y los productos pueden tener código de barras (lector o escrito a mano).
-- Idempotente: se puede ejecutar sobre una base existente (Supabase SQL Editor).

SET search_path TO pos, public;

ALTER TABLE producto ADD COLUMN IF NOT EXISTS codigo_barras text;

-- Un mismo código no puede repetirse dentro del mismo negocio
CREATE UNIQUE INDEX IF NOT EXISTS producto_codigo_barras
  ON producto (restaurante_id, codigo_barras) WHERE codigo_barras IS NOT NULL;

-- Al copiar un menú plantilla también viaja el código de barras (misma función de 12_, más esa columna)
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
    INSERT INTO producto (restaurante_id, categoria_id, nombre, descripcion, precio, activo, orden, impuesto_tipo, impuesto_tasa, codigo_barras)
    VALUES (p_destino, (SELECT nuevo FROM _mapa WHERE tabla = 'categoria' AND viejo = r.categoria_id),
            r.nombre, r.descripcion, r.precio, r.activo, r.orden, r.impuesto_tipo, r.impuesto_tasa, r.codigo_barras) RETURNING id INTO v;
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

  -- Grupos que dependen de una opción: apuntan a la opción copiada
  UPDATE grupo_opcion g SET mostrar_si_opcion = mo.nuevo
    FROM grupo_opcion o
    JOIN _mapa mg ON mg.tabla = 'grupo' AND mg.viejo = o.id
    JOIN _mapa mo ON mo.tabla = 'opcion' AND mo.viejo = o.mostrar_si_opcion
   WHERE o.restaurante_id = p_origen AND g.id = mg.nuevo;

  INSERT INTO receta (restaurante_id, producto_id, opcion_id, insumo_id, cantidad)
  SELECT p_destino,
         (SELECT nuevo FROM _mapa WHERE tabla = 'producto' AND viejo = rc.producto_id),
         (SELECT nuevo FROM _mapa WHERE tabla = 'opcion' AND viejo = rc.opcion_id),
         (SELECT nuevo FROM _mapa WHERE tabla = 'insumo' AND viejo = rc.insumo_id),
         rc.cantidad
    FROM receta rc WHERE rc.restaurante_id = p_origen;
END $$;

-- Verificación
SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'pos' AND table_name = 'producto' AND column_name = 'codigo_barras') AS codigo_barras_ok;
