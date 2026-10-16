-- Corregir teléfono/dirección de un domicilio ya pagado mientras no se haya entregado.
-- Idempotente: se puede ejecutar sobre una base existente (Supabase SQL Editor).

SET search_path TO pos, public;

CREATE OR REPLACE FUNCTION f_pedido_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total  numeric;
  v_pagado numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pedidos no se borran; anúlelos';
  END IF;

  IF OLD.estado <> 'abierto' THEN
    -- Cerrado: solo se permite la logística del domicilio y, mientras no se
    -- haya entregado, corregir el cliente (teléfono) y la dirección de entrega
    IF (to_jsonb(NEW) - 'domiciliario_id' - 'despachado_en' - 'entregado_en'
          - CASE WHEN OLD.tipo = 'DOMICILIO' AND OLD.entregado_en IS NULL
                 THEN ARRAY['cliente_id', 'direccion_entrega'] ELSE ARRAY[]::text[] END)
       IS DISTINCT FROM (to_jsonb(OLD) - 'domiciliario_id' - 'despachado_en' - 'entregado_en'
          - CASE WHEN OLD.tipo = 'DOMICILIO' AND OLD.entregado_en IS NULL
                 THEN ARRAY['cliente_id', 'direccion_entrega'] ELSE ARRAY[]::text[] END) THEN
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
