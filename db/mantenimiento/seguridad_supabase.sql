-- ============================================================================
--  SEGURIDAD EN SUPABASE: "Tabla accesible públicamente" (rls_disabled_in_public)
--
--  Supabase publica el esquema "public" por su API. Si una tabla de "public" no
--  tiene seguridad por filas (RLS), cualquiera con la URL del proyecto podría
--  leerla o modificarla.
--
--  La app NO usa "public": todo está en el esquema "pos" y el servidor se conecta
--  directo a PostgreSQL (no por la API de Supabase). Por eso activar RLS aquí
--  NO afecta a la app.
--
--  PASO 1 (solo mira): ejecute la primera consulta para ver qué tablas hay.
--  PASO 2 (corrige): ejecute el bloque DO.
--  Se puede ejecutar varias veces.
-- ============================================================================

-- PASO 1 · Tablas del esquema public y si tienen RLS
SELECT c.relname AS tabla,
       c.relrowsecurity AS rls_activado,
       c.reltuples::bigint AS filas_aprox
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
 ORDER BY c.relrowsecurity, c.relname;

-- PASO 2 · Activa RLS en todas las tablas de public y quita el acceso de la API pública
--          (roles anon y authenticated de Supabase). El dueño (postgres) no se ve afectado.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.relname);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t.relname);
    END IF;
    RAISE NOTICE 'Protegida: public.%', t.relname;
  END LOOP;
END $$;

-- El esquema "pos" (el de la app) tampoco debe estar disponible para la API pública
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA pos FROM anon;
    REVOKE USAGE ON SCHEMA pos FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA pos FROM authenticated;
    REVOKE USAGE ON SCHEMA pos FROM authenticated;
  END IF;
END $$;

-- Verificación: debe salir vacío (ninguna tabla de public sin RLS)
SELECT c.relname AS tabla_sin_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
