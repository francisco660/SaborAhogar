-- ============================================================================
--  FIADO / CUENTAS POR COBRAR A CLIENTES
--  * "Fiado" es un medio de pago más al cobrar: el pedido queda pagado (es una
--    venta) y el valor pasa a la deuda del cliente.
--  * El cliente paga después con abonos (efectivo, Nequi...), que entran a la
--    caja del turno abierto.
--  * Saldo del cliente = fiado − abonos vigentes.
--  Idempotente: se puede ejecutar varias veces (Supabase SQL Editor).
-- ============================================================================

SET search_path TO pos, public;

-- ─── Fiado como medio de pago ───────────────────────────────────────────────
ALTER TABLE pago ADD COLUMN IF NOT EXISTS cliente_id int REFERENCES cliente;
ALTER TABLE pago DROP CONSTRAINT IF EXISTS pago_medio_check;
ALTER TABLE pago ADD CONSTRAINT pago_medio_check
  CHECK (medio IN ('EFECTIVO','NEQUI','DAVIPLATA','TARJETA','TRANSFERENCIA','FIADO'));
ALTER TABLE pago DROP CONSTRAINT IF EXISTS pago_fiado_cliente;
ALTER TABLE pago ADD CONSTRAINT pago_fiado_cliente CHECK (medio <> 'FIADO' OR cliente_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS pago_fiado ON pago (cliente_id) WHERE medio = 'FIADO';

-- Cupo máximo de fiado por cliente (vacío = sin límite)
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS cupo_fiado numeric(12,0) CHECK (cupo_fiado >= 0);

-- ─── Abonos del cliente a su deuda ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abono_cliente (
  id               serial PRIMARY KEY,
  restaurante_id   int NOT NULL DEFAULT coalesce(restaurante_actual(), 1) REFERENCES restaurante,
  cliente_id       int NOT NULL REFERENCES cliente,
  valor            numeric(12,0) NOT NULL CHECK (valor > 0),
  medio            text NOT NULL CHECK (medio IN ('EFECTIVO','NEQUI','DAVIPLATA','TARJETA','TRANSFERENCIA')),
  turno_id         int NOT NULL REFERENCES turno_caja,
  nota             text,
  registrado_por   int REFERENCES usuario,
  anulado          boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS abono_cliente_cliente ON abono_cliente (cliente_id);
CREATE INDEX IF NOT EXISTS abono_cliente_turno ON abono_cliente (turno_id);

-- Saldo pendiente de un cliente
CREATE OR REPLACE FUNCTION saldo_cliente(p_cliente int) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sum(pg.valor) FROM pago pg JOIN pedido p ON p.id = pg.pedido_id
                    WHERE pg.cliente_id = p_cliente AND pg.medio = 'FIADO' AND p.estado = 'pagado'), 0)
       - coalesce((SELECT sum(valor) FROM abono_cliente WHERE cliente_id = p_cliente AND NOT anulado), 0)
$$;

-- Los abonos no se borran ni se editan; solo se anulan con motivo, con la caja abierta
CREATE OR REPLACE FUNCTION f_abono_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM f_turno_abierto(NEW.turno_id);
    PERFORM 1 FROM cliente WHERE id = NEW.cliente_id FOR UPDATE;   -- evita abonos simultáneos
    IF NEW.valor > saldo_cliente(NEW.cliente_id) THEN
      RAISE EXCEPTION 'El abono (%) supera lo que debe el cliente (%)', NEW.valor, saldo_cliente(NEW.cliente_id);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los abonos no se borran; anúlelos';
  END IF;
  IF OLD.anulado OR NOT NEW.anulado
     OR (to_jsonb(NEW) - 'anulado' - 'motivo_anulacion') IS DISTINCT FROM (to_jsonb(OLD) - 'anulado' - 'motivo_anulacion') THEN
    RAISE EXCEPTION 'Un abono registrado solo se puede anular';
  END IF;
  IF coalesce(trim(NEW.motivo_anulacion), '') = '' THEN
    RAISE EXCEPTION 'Indique el motivo de la anulación';
  END IF;
  PERFORM f_turno_abierto(OLD.turno_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_abono_protegido ON abono_cliente;
CREATE TRIGGER t_abono_protegido BEFORE INSERT OR UPDATE OR DELETE ON abono_cliente
  FOR EACH ROW EXECUTE FUNCTION f_abono_protegido();

-- ─── Cartera: deuda de cada cliente ─────────────────────────────────────────
CREATE OR REPLACE VIEW v_cartera AS
SELECT cl.id, cl.nombre, cl.telefono, cl.cupo_fiado,
       coalesce(f.fiado, 0)  AS fiado,
       coalesce(a.abonos, 0) AS abonos,
       coalesce(f.fiado, 0) - coalesce(a.abonos, 0) AS saldo,
       f.ultimo_fiado, a.ultimo_abono, coalesce(f.pedidos, 0) AS pedidos
  FROM cliente cl
  LEFT JOIN (SELECT pg.cliente_id, sum(pg.valor) AS fiado, max(pg.creado_en) AS ultimo_fiado, count(DISTINCT pg.pedido_id) AS pedidos
               FROM pago pg JOIN pedido p ON p.id = pg.pedido_id
              WHERE pg.medio = 'FIADO' AND p.estado = 'pagado' GROUP BY pg.cliente_id) f ON f.cliente_id = cl.id
  LEFT JOIN (SELECT cliente_id, sum(valor) AS abonos, max(creado_en) AS ultimo_abono
               FROM abono_cliente WHERE NOT anulado GROUP BY cliente_id) a ON a.cliente_id = cl.id
 WHERE f.cliente_id IS NOT NULL OR a.cliente_id IS NOT NULL;
ALTER VIEW v_cartera SET (security_invoker = true);

-- ─── Cuadre de caja: los abonos en efectivo entran a la caja ────────────────
CREATE OR REPLACE FUNCTION cuadre_turno(p_turno int) RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH t AS (SELECT * FROM turno_caja WHERE id = p_turno),
  pg AS (SELECT * FROM pago WHERE turno_id = p_turno),
  ab AS (SELECT * FROM abono_cliente WHERE turno_id = p_turno AND NOT anulado),
  v AS (
    SELECT
      (SELECT base_inicial FROM t) AS base_inicial,
      (SELECT coalesce(sum(valor),0) FROM pg WHERE medio = 'EFECTIVO' AND liquidado_en IS NULL) AS ventas_efectivo,
      (SELECT coalesce(sum(valor),0) FROM pg WHERE medio = 'EFECTIVO' AND liquidado_en IS NOT NULL) AS liquidaciones_domiciliarios,
      (SELECT coalesce(sum(valor),0) FROM ab WHERE medio = 'EFECTIVO') AS abonos_efectivo,
      (SELECT coalesce(sum(valor),0) FROM gasto WHERE turno_id = p_turno AND pagado_de_caja AND NOT anulado) AS gastos_caja,
      (SELECT coalesce(sum(valor),0) FROM retiro_caja WHERE turno_id = p_turno) AS retiros
  )
  SELECT jsonb_build_object(
    'base_inicial', v.base_inicial,
    'ventas_efectivo', v.ventas_efectivo,
    'liquidaciones_domiciliarios', v.liquidaciones_domiciliarios,
    'abonos_efectivo', v.abonos_efectivo,
    'gastos_caja', v.gastos_caja,
    'retiros', v.retiros,
    'efectivo_esperado', v.base_inicial + v.ventas_efectivo + v.liquidaciones_domiciliarios + v.abonos_efectivo - v.gastos_caja - v.retiros,
    'por_medio', coalesce((SELECT jsonb_object_agg(medio, total)
                             FROM (SELECT medio, sum(valor) AS total FROM pg GROUP BY medio) x), '{}'::jsonb),
    'abonos', (SELECT coalesce(sum(valor),0) FROM ab),
    'abonos_por_medio', coalesce((SELECT jsonb_object_agg(medio, total)
                                    FROM (SELECT medio, sum(valor) AS total FROM ab GROUP BY medio) x), '{}'::jsonb),
    'total_ventas', (SELECT coalesce(sum(valor),0) FROM pg WHERE liquidado_en IS NULL),
    'pedidos', (SELECT count(DISTINCT pedido_id) FROM pg WHERE liquidado_en IS NULL)
  ) FROM v
$$;

-- ─── Permisos y aislamiento por restaurante (igual que las demás tablas) ────
GRANT SELECT, INSERT, UPDATE, DELETE ON abono_cliente TO pos_app;
GRANT SELECT ON v_cartera TO pos_app;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE abono_cliente_id_seq TO pos_app;
GRANT EXECUTE ON FUNCTION saldo_cliente(int), cuadre_turno(int) TO pos_app;

ALTER TABLE abono_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acceso_app ON abono_cliente;
CREATE POLICY acceso_app ON abono_cliente AS PERMISSIVE FOR ALL TO pos_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS aislamiento_restaurante ON abono_cliente;
CREATE POLICY aislamiento_restaurante ON abono_cliente AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (restaurante_id = restaurante_actual())
  WITH CHECK (restaurante_id = restaurante_actual());

-- Supabase: la API pública no debe ver la tabla nueva
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON abono_cliente, v_cartera FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON abono_cliente, v_cartera FROM authenticated;
  END IF;
END $$;

-- Verificación
SELECT to_regclass('pos.abono_cliente') IS NOT NULL AS tabla_abonos,
       to_regclass('pos.v_cartera') IS NOT NULL AS vista_cartera,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pago_fiado_cliente') AS pago_fiado;
