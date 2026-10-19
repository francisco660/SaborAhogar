-- ============================================================================
--  UBICACIÓN AL MARCAR ENTRADA Y SALIDA
--  Se guarda la ubicación del celular en el momento de marcar y la distancia
--  al restaurante (calculada en ese momento, para que el historial no cambie
--  si luego se mueve la ubicación del restaurante).
--  La ubicación del restaurante y el radio permitido se configuran en la app
--  (Personal → Ubicación del restaurante) y quedan en los ajustes.
--  Idempotente: se puede ejecutar varias veces (Supabase SQL Editor).
-- ============================================================================

SET search_path TO pos, public;

ALTER TABLE asistencia
  ADD COLUMN IF NOT EXISTS entrada_lat       double precision,
  ADD COLUMN IF NOT EXISTS entrada_lng       double precision,
  ADD COLUMN IF NOT EXISTS entrada_precision real,      -- metros
  ADD COLUMN IF NOT EXISTS entrada_distancia real,      -- metros al restaurante
  ADD COLUMN IF NOT EXISTS salida_lat        double precision,
  ADD COLUMN IF NOT EXISTS salida_lng        double precision,
  ADD COLUMN IF NOT EXISTS salida_precision  real,
  ADD COLUMN IF NOT EXISTS salida_distancia  real;
