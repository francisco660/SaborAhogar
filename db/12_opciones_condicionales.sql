-- ============================================================================
--  OPCIONES QUE DEPENDEN DE OTRA ELECCIÓN
--  Un grupo (ej: "Término") puede mostrarse solo cuando el mesero elige cierta
--  opción de otro grupo del mismo plato (ej: Proteína = "Carne de res").
--  Además agrega el término a la carne de res del "Menú del día".
--  Idempotente: se puede ejecutar varias veces (Supabase SQL Editor).
-- ============================================================================

SET search_path TO pos, public;

ALTER TABLE grupo_opcion ADD COLUMN IF NOT EXISTS mostrar_si_opcion int REFERENCES opcion ON DELETE SET NULL;

-- ─── Término para la carne de res del Menú del día (cada restaurante que lo tenga) ───
DO $$
DECLARE
  r record;
  v_grupo int;
BEGIN
  FOR r IN
    SELECT p.id AS producto_id, p.restaurante_id, o.id AS opcion_id
      FROM producto p
      JOIN grupo_opcion g ON g.producto_id = p.id AND g.nombre = 'Proteína'
      JOIN opcion o ON o.grupo_id = g.id AND o.nombre = 'Carne de res'
     WHERE p.nombre = 'Menú del día'
       AND NOT EXISTS (SELECT 1 FROM grupo_opcion t WHERE t.producto_id = p.id AND t.nombre = 'Término')
  LOOP
    INSERT INTO grupo_opcion (restaurante_id, producto_id, nombre, min_sel, max_sel, orden, mostrar_si_opcion)
    VALUES (r.restaurante_id, r.producto_id, 'Término', 1, 1,
            (SELECT coalesce(max(orden), 0) + 1 FROM grupo_opcion WHERE producto_id = r.producto_id), r.opcion_id)
    RETURNING id INTO v_grupo;
    INSERT INTO opcion (restaurante_id, grupo_id, nombre, orden)
    VALUES (r.restaurante_id, v_grupo, 'Término medio', 1),
           (r.restaurante_id, v_grupo, 'Tres cuartos', 2),
           (r.restaurante_id, v_grupo, 'Bien asado', 3);
    RAISE NOTICE 'Término agregado al Menú del día del restaurante %', r.restaurante_id;
  END LOOP;
END $$;

-- ─── Copiar menú entre restaurantes: también copia la condición ─────────────
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

-- Verificación: grupos que dependen de otra opción
SELECT p.restaurante_id, p.nombre AS producto, g.nombre AS grupo, o.nombre AS se_muestra_si_eligen
  FROM grupo_opcion g
  JOIN producto p ON p.id = g.producto_id
  JOIN opcion o ON o.id = g.mostrar_si_opcion
 ORDER BY 1, 2;
