-- ============================================================================
--  LIMPIAR DATOS DE PRUEBA DE UN RESTAURANTE antes de arrancar en producción.
--  ¡IRREVERSIBLE! Haga un respaldo antes (ver README, sección respaldo).
--
--  >>> Cambie el número del restaurante en la línea "v_rest int := 1" <<<
--      (lo ve en la pestaña Restaurantes del superadministrador).
--
--  BORRA (solo de ese restaurante): pedidos, ítems, pagos, turnos y retiros de
--          caja, gastos y movimientos de inventario (el stock queda en 0).
--  CONSERVA: usuarios, menú (categorías, productos, opciones, recetas),
--          insumos, mesas, empleados, proveedores, clientes y ajustes.
--
--  Los movimientos de inventario y los gastos se borran junto con las ventas
--  porque están enlazados a ellas (consumos de recetas y gastos por turno).
--  Después de limpiar, registre el inventario inicial real en Inventario.
--  Los números de pedido de ese restaurante vuelven a empezar en #1.
-- ============================================================================

SET search_path TO pos, public;

BEGIN;

-- Los triggers impiden borrar ventas en la operación normal; se apagan solo
-- durante esta limpieza.
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
  v_rest int := 1;   -- <<< número del restaurante a limpiar
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurante WHERE id = v_rest) THEN
    RAISE EXCEPTION 'No existe el restaurante %', v_rest;
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
  -- Clientes de domicilio: quite las dos rayas de la siguiente línea
  -- solo si NO quiere conservarlos.
  -- DELETE FROM cliente WHERE restaurante_id = v_rest;
  RAISE NOTICE 'Restaurante % limpio', v_rest;
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
