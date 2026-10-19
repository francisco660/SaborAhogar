-- ============================================================================
--  QUITAR TODO EL MENÚ DE UN RESTAURANTE (categorías, productos, opciones,
--  recetas e insumos), por ejemplo un menú copiado por error al crearlo.
--
--  >>> Cambie el número en la línea "v_rest int := 2" <<<
--
--  Solo funciona si el restaurante NO tiene ventas ni movimientos de
--  inventario (si los tiene, no se borra nada y se muestra un aviso).
--  Supabase → SQL Editor → pegue todo este archivo → Run.
-- ============================================================================

SET search_path TO pos, public;

DO $$
DECLARE
  v_rest int := 2;   -- <<< número del restaurante
  v_prod int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurante WHERE id = v_rest) THEN
    RAISE EXCEPTION 'No existe el restaurante %', v_rest;
  END IF;
  IF v_rest = 1 THEN
    RAISE EXCEPTION 'Por seguridad este script no se ejecuta sobre el restaurante 1';
  END IF;
  IF EXISTS (SELECT 1 FROM pedido_item WHERE restaurante_id = v_rest)
     OR EXISTS (SELECT 1 FROM movimiento_inventario WHERE restaurante_id = v_rest)
     OR EXISTS (SELECT 1 FROM gasto_item WHERE restaurante_id = v_rest) THEN
    RAISE EXCEPTION 'El restaurante % ya tiene ventas o movimientos de inventario. Ejecute primero limpiar_ventas.sql con ese número.', v_rest;
  END IF;

  SELECT count(*) INTO v_prod FROM producto WHERE restaurante_id = v_rest;
  DELETE FROM receta       WHERE restaurante_id = v_rest;
  DELETE FROM opcion       WHERE restaurante_id = v_rest;
  DELETE FROM grupo_opcion WHERE restaurante_id = v_rest;
  DELETE FROM producto     WHERE restaurante_id = v_rest;
  DELETE FROM categoria    WHERE restaurante_id = v_rest;
  DELETE FROM insumo       WHERE restaurante_id = v_rest;
  RAISE NOTICE 'Menú del restaurante % eliminado (% productos)', v_rest, v_prod;
END $$;

-- Debe mostrar 0 productos
SELECT count(*) AS productos_restantes FROM producto WHERE restaurante_id = 2;
