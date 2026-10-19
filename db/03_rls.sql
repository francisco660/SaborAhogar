-- db/03_rls.sql
-- Ejecutar EN SUPABASE SQL EDITOR después de ejecutar 01_esquema.sql
-- Este script habilita RLS y crea políticas (corrige problemas de quoting).

-- Helper: TRUE si la llamada vino desde la service_role (backend)
CREATE OR REPLACE FUNCTION pos_is_server() RETURNS boolean LANGUAGE sql AS $fn$
  SELECT current_setting('request.jwt.claims', true) IS NULL;
$fn$;

-- Catalogo público (SELECT)
ALTER TABLE pos.categoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_select_categoria ON pos.categoria;
CREATE POLICY public_select_categoria ON pos.categoria FOR SELECT USING ( true );

ALTER TABLE pos.producto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_select_producto ON pos.producto;
CREATE POLICY public_select_producto ON pos.producto FOR SELECT USING ( true );

ALTER TABLE pos.grupo_opcion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_select_grupo_opcion ON pos.grupo_opcion;
CREATE POLICY public_select_grupo_opcion ON pos.grupo_opcion FOR SELECT USING ( true );

ALTER TABLE pos.opcion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_select_opcion ON pos.opcion;
CREATE POLICY public_select_opcion ON pos.opcion FOR SELECT USING ( true );

-- Tablas sensibles: server-only (service_role)
-- Uso DROP POLICY IF EXISTS para permitir re-ejecución

ALTER TABLE pos.usuario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_usuario ON pos.usuario;
CREATE POLICY server_only_usuario ON pos.usuario FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.empleado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_empleado ON pos.empleado;
CREATE POLICY server_only_empleado ON pos.empleado FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.gasto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_gasto ON pos.gasto;
CREATE POLICY server_only_gasto ON pos.gasto FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.gasto_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_gasto_item ON pos.gasto_item;
CREATE POLICY server_only_gasto_item ON pos.gasto_item FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.movimiento_inventario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_movimiento ON pos.movimiento_inventario;
CREATE POLICY server_only_movimiento ON pos.movimiento_inventario FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_pago ON pos.pago;
CREATE POLICY server_only_pago ON pos.pago FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.pedido ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_pedido ON pos.pedido;
CREATE POLICY server_only_pedido ON pos.pedido FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.pedido_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_pedido_item ON pos.pedido_item;
CREATE POLICY server_only_pedido_item ON pos.pedido_item FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.pedido_item_opcion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_pedido_item_opcion ON pos.pedido_item_opcion;
CREATE POLICY server_only_pedido_item_opcion ON pos.pedido_item_opcion FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.turno_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_turno_caja ON pos.turno_caja;
CREATE POLICY server_only_turno_caja ON pos.turno_caja FOR ALL
  USING ( pos_is_server() )
  WITH CHECK ( pos_is_server() );

ALTER TABLE pos.retiro_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_retiro_caja ON pos.retiro_caja;
CREATE POLICY server_only_retiro_caja ON pos.retiro_caja FOR ALL
  USING ( pos.pos_is_server() )
  WITH CHECK ( pos.pos_is_server() );

ALTER TABLE pos.cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_cliente ON pos.cliente;
CREATE POLICY server_only_cliente ON pos.cliente FOR ALL
  USING ( pos.pos_is_server() )
  WITH CHECK ( pos.pos_is_server() );

ALTER TABLE pos.proveedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_proveedor ON pos.proveedor;
CREATE POLICY server_only_proveedor ON pos.proveedor FOR ALL
  USING ( pos.pos_is_server() )
  WITH CHECK ( pos.pos_is_server() );

ALTER TABLE pos.ajuste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_only_ajuste ON pos.ajuste;
CREATE POLICY server_only_ajuste ON pos.ajuste FOR ALL
  USING ( pos.pos_is_server() )
  WITH CHECK ( pos.pos_is_server() );

-- Puedes añadir más políticas finas según necesites

-- Comprobar tablas con RLS activado
SELECT c.relname, n.nspname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'pos'
ORDER BY c.relname;
