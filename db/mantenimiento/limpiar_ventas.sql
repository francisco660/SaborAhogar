-- ============================================================================
--  LIMPIAR DATOS DE PRUEBA antes de arrancar en producción.
--  ¡IRREVERSIBLE! Haga un respaldo antes (ver README, sección respaldo).
--
--  BORRA:  pedidos, ítems, pagos, turnos y retiros de caja, gastos,
--          movimientos de inventario (el stock queda en 0) y clientes.
--  CONSERVA: usuarios, menú (categorías, productos, opciones, recetas),
--          insumos, mesas, empleados, proveedores y ajustes.
--
--  Los movimientos de inventario y los gastos se borran juntos con las ventas
--  porque están enlazados a ellas (consumos de recetas y gastos por turno).
--  Después de limpiar, registre el inventario inicial real en Inventario.
-- ============================================================================

SET search_path TO pos, public;

BEGIN;

TRUNCATE
  pago,
  pedido_item_opcion,
  movimiento_inventario,
  pedido_item,
  pedido,
  gasto_item,
  gasto,
  retiro_caja,
  turno_caja
RESTART IDENTITY;

-- Clientes de domicilio: borre las dos rayas de la siguiente línea
-- solo si NO quiere conservarlos.
-- DELETE FROM cliente;

COMMIT;
