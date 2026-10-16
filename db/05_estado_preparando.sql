-- Estado "preparando": la cocina indica que ya empezó a cocinar un ítem.
-- Flujo: pendiente → en_cocina → preparando → listo → entregado
-- Idempotente: se puede ejecutar sobre una base existente (Supabase SQL Editor).

SET search_path TO pos, public;

ALTER TABLE pedido_item DROP CONSTRAINT IF EXISTS pedido_item_estado_check;
ALTER TABLE pedido_item ADD CONSTRAINT pedido_item_estado_check
  CHECK (estado IN ('pendiente','en_cocina','preparando','listo','entregado','anulado'));
ALTER TABLE pedido_item ADD COLUMN IF NOT EXISTS preparando_en timestamptz;

CREATE OR REPLACE FUNCTION f_item_estado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_costo numeric;
BEGIN
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;

  IF NOT (
       (OLD.estado = 'pendiente'  AND NEW.estado IN ('en_cocina','anulado'))
    OR (OLD.estado = 'en_cocina'  AND NEW.estado IN ('preparando','listo','anulado'))
    OR (OLD.estado = 'preparando' AND NEW.estado IN ('listo','anulado'))
    OR (OLD.estado = 'listo'      AND NEW.estado IN ('entregado','anulado'))
    OR (OLD.estado = 'entregado'  AND NEW.estado = 'anulado')
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

  ELSIF NEW.estado = 'preparando' THEN
    NEW.preparando_en := now();

  ELSIF NEW.estado = 'listo' THEN
    NEW.listo_en := now();

  ELSIF NEW.estado = 'anulado' AND OLD.estado = 'en_cocina' THEN
    -- Aún no se preparó: los insumos vuelven al inventario.
    -- (Si ya se estaba preparando o estaba listo/entregado, su costo queda como merma.)
    INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, pedido_item_id, nota)
    SELECT insumo_id, 'REVERSO_VENTA', -cantidad, costo_unit, NEW.id, 'Anulado antes de preparar'
      FROM movimiento_inventario
     WHERE pedido_item_id = NEW.id AND tipo = 'CONSUMO_VENTA';
    NEW.costo_unit := NULL;
  END IF;

  RETURN NEW;
END $$;
