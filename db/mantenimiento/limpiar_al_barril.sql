-- ============================================================================
--  ARRANQUE EN PRODUCCIÓN DE "AL BARRIL" (restaurante #2)
--  Borra los datos de PRUEBA de ese restaurante y nada más.
--  ¡IRREVERSIBLE! Haga un respaldo antes (Supabase → Database → Backups).
--
--  BORRA: pedidos, ítems, pagos, caja (turnos y retiros), gastos, movimientos
--         de inventario (el stock queda en 0), documentos electrónicos de
--         prueba, clientes para factura de prueba, clientes de domicilio de prueba
--         y entradas/salidas de prueba del personal.
--  CONSERVA: usuarios, personal (empleados y horarios programados),
--         menú (productos, opciones, recetas), insumos, mesas, proveedores,
--         ajustes y apariencia.
--
--  Por seguridad verifica que el restaurante #2 se llame "Al barril"; si no,
--  no borra nada. Los números de pedido vuelven a empezar en #1.
--  Supabase → SQL Editor → pegue todo este archivo → Run.
-- ============================================================================

SET search_path TO pos, public;

BEGIN;

DO $$
DECLARE
  v_rest   int  := 2;            -- número del restaurante
  v_nombre text := 'al barril';  -- nombre esperado (sin importar mayúsculas)
  v_real   text;
BEGIN
  SELECT nombre INTO v_real FROM restaurante WHERE id = v_rest;
  IF v_real IS NULL THEN
    RAISE EXCEPTION 'No existe el restaurante %', v_rest;
  END IF;
  IF lower(trim(v_real)) <> v_nombre THEN
    RAISE EXCEPTION 'El restaurante % se llama "%", no "Al barril". No se borró nada.', v_rest, v_real;
  END IF;
END $$;

-- Los triggers impiden borrar ventas en la operación normal; se apagan solo durante la limpieza
ALTER TABLE pago                  DISABLE TRIGGER USER;
ALTER TABLE pedido_item           DISABLE TRIGGER USER;
ALTER TABLE pedido                DISABLE TRIGGER USER;
ALTER TABLE movimiento_inventario DISABLE TRIGGER USER;
ALTER TABLE gasto_item            DISABLE TRIGGER USER;
ALTER TABLE gasto                 DISABLE TRIGGER USER;
ALTER TABLE retiro_caja           DISABLE TRIGGER USER;
ALTER TABLE turno_caja            DISABLE TRIGGER USER;

DO $$
DECLARE
  v_rest int := 2;
  n_ped  int;
BEGIN
  SELECT count(*) INTO n_ped FROM pedido WHERE restaurante_id = v_rest;

  -- Existe solo si se corrió el script 10 (facturación electrónica)
  IF to_regclass('pos.documento_electronico') IS NOT NULL THEN
    EXECUTE 'DELETE FROM documento_electronico WHERE restaurante_id = $1' USING v_rest;
    EXECUTE 'DELETE FROM cliente_fiscal WHERE restaurante_id = $1' USING v_rest;
  END IF;
  -- Existe solo si se corrió el script 08 (control de personal)
  IF to_regclass('pos.asistencia') IS NOT NULL THEN
    EXECUTE 'DELETE FROM asistencia WHERE restaurante_id = $1' USING v_rest;
  END IF;

  DELETE FROM pago                  WHERE restaurante_id = v_rest;
  DELETE FROM movimiento_inventario WHERE restaurante_id = v_rest;
  DELETE FROM pedido_item_opcion    WHERE restaurante_id = v_rest;
  DELETE FROM pedido_item           WHERE restaurante_id = v_rest;
  DELETE FROM pedido                WHERE restaurante_id = v_rest;
  DELETE FROM gasto_item            WHERE restaurante_id = v_rest;
  DELETE FROM gasto                 WHERE restaurante_id = v_rest;
  DELETE FROM retiro_caja           WHERE restaurante_id = v_rest;
  DELETE FROM turno_caja            WHERE restaurante_id = v_rest;
  DELETE FROM cliente               WHERE restaurante_id = v_rest;

  RAISE NOTICE 'Al barril limpio: % pedidos de prueba eliminados', n_ped;
END $$;

ALTER TABLE pago                  ENABLE TRIGGER USER;
ALTER TABLE pedido_item           ENABLE TRIGGER USER;
ALTER TABLE pedido                ENABLE TRIGGER USER;
ALTER TABLE movimiento_inventario ENABLE TRIGGER USER;
ALTER TABLE gasto_item            ENABLE TRIGGER USER;
ALTER TABLE gasto                 ENABLE TRIGGER USER;
ALTER TABLE retiro_caja           ENABLE TRIGGER USER;
ALTER TABLE turno_caja            ENABLE TRIGGER USER;

COMMIT;

-- Verificación: ventas en 0; menú, usuarios y personal conservados
SELECT
  (SELECT count(*) FROM pedido      WHERE restaurante_id = 2) AS pedidos,
  (SELECT count(*) FROM pago        WHERE restaurante_id = 2) AS pagos,
  (SELECT count(*) FROM turno_caja  WHERE restaurante_id = 2) AS turnos_caja,
  (SELECT count(*) FROM gasto       WHERE restaurante_id = 2) AS gastos,
  (SELECT count(*) FROM movimiento_inventario WHERE restaurante_id = 2) AS movimientos_inventario,
  (SELECT count(*) FROM producto    WHERE restaurante_id = 2) AS productos_conservados,
  (SELECT count(*) FROM usuario     WHERE restaurante_id = 2) AS usuarios_conservados,
  (SELECT count(*) FROM empleado    WHERE restaurante_id = 2) AS empleados_conservados;
