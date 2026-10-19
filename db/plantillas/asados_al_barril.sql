-- ============================================================================
--  PLANTILLA: RESTAURANTE DE ASADOS AL BARRIL
--  Carga en un restaurante NUEVO (sin productos):
--    insumos con costos de referencia, menú completo (asados, picadas,
--    entradas, adiciones y bebidas), acompañantes y salsas para elegir,
--    recetas que descuentan inventario, y la apariencia "Brasa" 🔥.
--
--  CÓMO USARLO
--   1. En la app, pestaña Restaurantes → "Nuevo restaurante", en
--      "Copiar el menú de" elija "— Empezar sin menú —". Anote su número (#).
--   2. Cambie el número en la línea  >>> set_config(... '2' ...) <<<  de abajo.
--   3. Supabase → SQL Editor → pegue todo este archivo → Run.
--  Precios y costos son de referencia (COP): ajústelos luego en la pestaña Menú
--  y registre el inventario real en Inventario.
-- ============================================================================

SET search_path TO pos, public;

BEGIN;

-- >>> NÚMERO DEL RESTAURANTE AL BARRIL (cámbielo) <<<
SELECT set_config('app.restaurante_id', '2', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurante WHERE id = restaurante_actual()) THEN
    RAISE EXCEPTION 'No existe el restaurante %. Revise el número en set_config.', restaurante_actual();
  END IF;
  IF EXISTS (SELECT 1 FROM producto WHERE restaurante_id = restaurante_actual()) THEN
    RAISE EXCEPTION 'El restaurante % ya tiene productos; esta plantilla es para un restaurante nuevo.', restaurante_actual();
  END IF;
END $$;

-- ─── Ayudantes (solo existen durante este script) ───────────────────────────
CREATE FUNCTION pg_temp.cat(p_nombre text, p_orden int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.categoria (nombre, orden) VALUES (p_nombre, p_orden)
$$;
CREATE FUNCTION pg_temp.prod(p_cat text, p_nombre text, p_precio numeric, p_desc text, p_orden int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.producto (categoria_id, nombre, precio, descripcion, orden)
  SELECT id, p_nombre, p_precio, p_desc, p_orden FROM pos.categoria
   WHERE nombre = p_cat AND restaurante_id = pos.restaurante_actual()
$$;
CREATE FUNCTION pg_temp.grupo(p_prod text, p_nombre text, p_min int, p_max int, p_orden int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.grupo_opcion (producto_id, nombre, min_sel, max_sel, orden)
  SELECT id, p_nombre, p_min, p_max, p_orden FROM pos.producto
   WHERE nombre = p_prod AND restaurante_id = pos.restaurante_actual()
$$;
CREATE FUNCTION pg_temp.opc(p_prod text, p_grupo text, p_nombre text, p_extra numeric, p_orden int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.opcion (grupo_id, nombre, precio_extra, orden)
  SELECT g.id, p_nombre, p_extra, p_orden
    FROM pos.grupo_opcion g JOIN pos.producto p ON p.id = g.producto_id
   WHERE p.nombre = p_prod AND g.nombre = p_grupo AND p.restaurante_id = pos.restaurante_actual()
$$;
-- receta de un producto
CREATE FUNCTION pg_temp.rp(p_prod text, p_insumo text, p_cant numeric) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.receta (producto_id, insumo_id, cantidad)
  SELECT p.id, i.id, p_cant FROM pos.producto p, pos.insumo i
   WHERE p.nombre = p_prod AND i.nombre = p_insumo
     AND p.restaurante_id = pos.restaurante_actual() AND i.restaurante_id = pos.restaurante_actual()
$$;
-- receta de una opción
CREATE FUNCTION pg_temp.ro(p_prod text, p_grupo text, p_opc text, p_insumo text, p_cant numeric) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.receta (opcion_id, insumo_id, cantidad)
  SELECT o.id, i.id, p_cant
    FROM pos.opcion o
    JOIN pos.grupo_opcion g ON g.id = o.grupo_id
    JOIN pos.producto p ON p.id = g.producto_id
    JOIN pos.insumo i ON i.nombre = p_insumo AND i.restaurante_id = pos.restaurante_actual()
   WHERE p.nombre = p_prod AND g.nombre = p_grupo AND o.nombre = p_opc AND p.restaurante_id = pos.restaurante_actual()
$$;

-- ─── Insumos (costo por g, ml o unidad) ─────────────────────────────────────
INSERT INTO insumo (nombre, unidad, stock_minimo, costo_promedio) VALUES
  ('Costilla de cerdo',        'g',  5000,    22),
  ('Bondiola de cerdo',        'g',  3000,    26),
  ('Punta de anca',            'g',  3000,    45),
  ('Pollo entero',             'und',   4, 18000),
  ('Tocino para chicharrón',   'g',  3000,    28),
  ('Chorizo',                  'und',  20,  2200),
  ('Morcilla',                 'und',  15,  2500),
  ('Papa criolla',             'g',  4000,     6),
  ('Papa salada (pastusa)',    'g',  5000,     3),
  ('Yuca',                     'g',  4000,     3),
  ('Plátano maduro',           'und',  10,  1500),
  ('Plátano verde',            'und',  10,  1200),
  ('Arepa',                    'und',  30,   400),
  ('Mazorca',                  'und',  10,  1500),
  ('Verduras para ensalada',   'g',  2000,     8),
  ('Aguacate',                 'und',   6,  3000),
  ('Hogao',                    'g',  1000,     8),
  ('Salsa BBQ',                'g',  1000,    15),
  ('Chimichurri',              'g',   800,    12),
  ('Ají casero',               'g',   800,    10),
  ('Limón',                    'und',  30,   300),
  ('Azúcar',                   'g',  2000,     4),
  ('Pulpa de fruta',           'g',  3000,     8),
  ('Leche',                    'ml', 3000,   4.5),
  ('Gaseosa 350 ml',           'und',  24,  2300),
  ('Cerveza nacional',         'und',  24,  3000),
  ('Agua en botella',          'und',  12,  1200),
  ('Carbón',                   'g', 10000,     2);

-- ─── Categorías ─────────────────────────────────────────────────────────────
SELECT pg_temp.cat(x, n) FROM (VALUES
  ('Asados al barril', 1), ('Para compartir', 2), ('Entradas', 3),
  ('Adiciones', 4), ('Bebidas', 5)) v(x, n);

-- ─── Asados al barril (con 2 acompañantes y salsas a elección) ──────────────
SELECT pg_temp.prod('Asados al barril', x, p, d, n) FROM (VALUES
  ('Costilla de cerdo al barril',   34000, 'Costilla ahumada 400 g, dos acompañantes y salsa', 1),
  ('Bondiola al barril',            30000, 'Bondiola de cerdo 300 g, dos acompañantes y salsa', 2),
  ('Punta de anca al barril',       39000, 'Punta de anca 300 g, dos acompañantes y salsa', 3),
  ('Cuarto de pollo al barril',     22000, '1/4 de pollo ahumado, dos acompañantes y salsa', 4),
  ('Medio pollo al barril',         36000, '1/2 pollo ahumado, dos acompañantes y salsa', 5),
  ('Pollo entero al barril',        62000, 'Pollo entero ahumado, cuatro acompañantes y salsas', 6),
  ('Chicharrón al barril',          26000, 'Chicharrón crocante 300 g, dos acompañantes y salsa', 7),
  ('Mixto al barril',               42000, 'Costilla 250 g + 1/4 de pollo, dos acompañantes y salsa', 8)
) v(x, p, d, n);

SELECT pg_temp.rp('Costilla de cerdo al barril', 'Costilla de cerdo', 400);
SELECT pg_temp.rp('Bondiola al barril',          'Bondiola de cerdo', 300);
SELECT pg_temp.rp('Punta de anca al barril',     'Punta de anca', 300);
SELECT pg_temp.rp('Cuarto de pollo al barril',   'Pollo entero', 0.25);
SELECT pg_temp.rp('Medio pollo al barril',       'Pollo entero', 0.5);
SELECT pg_temp.rp('Pollo entero al barril',      'Pollo entero', 1);
SELECT pg_temp.rp('Chicharrón al barril',        'Tocino para chicharrón', 300);
SELECT pg_temp.rp('Mixto al barril', i, c) FROM (VALUES ('Costilla de cerdo', 250), ('Pollo entero', 0.25)) v(i, c);
-- carbón por plato
SELECT pg_temp.rp(x, 'Carbón', c) FROM (VALUES
  ('Costilla de cerdo al barril', 150), ('Bondiola al barril', 120), ('Punta de anca al barril', 120),
  ('Cuarto de pollo al barril', 100), ('Medio pollo al barril', 180), ('Pollo entero al barril', 320),
  ('Chicharrón al barril', 100), ('Mixto al barril', 180)) v(x, c);

-- Término solo para la carne de res
SELECT pg_temp.grupo('Punta de anca al barril', 'Término', 1, 1, 1);
SELECT pg_temp.opc('Punta de anca al barril', 'Término', t, 0, n)
  FROM (VALUES ('Término medio', 1), ('Tres cuartos', 2), ('Bien asado', 3)) v(t, n);

-- Acompañantes: 2 a elegir (4 en el pollo entero)
SELECT pg_temp.grupo(x, 'Acompañantes', m, m, 2) FROM (VALUES
  ('Costilla de cerdo al barril', 2), ('Bondiola al barril', 2), ('Punta de anca al barril', 2),
  ('Cuarto de pollo al barril', 2), ('Medio pollo al barril', 2), ('Pollo entero al barril', 4),
  ('Chicharrón al barril', 2), ('Mixto al barril', 2)) v(x, m);
SELECT pg_temp.opc(x, 'Acompañantes', o, e, n)
  FROM unnest(ARRAY['Costilla de cerdo al barril','Bondiola al barril','Punta de anca al barril',
                    'Cuarto de pollo al barril','Medio pollo al barril','Pollo entero al barril',
                    'Chicharrón al barril','Mixto al barril']) x,
       (VALUES ('Papa criolla', 0, 1), ('Papa salada', 0, 2), ('Yuca frita', 0, 3), ('Maduro', 0, 4),
               ('Arepa', 0, 5), ('Ensalada', 0, 6), ('Mazorca', 2000, 7), ('Patacón', 1000, 8)) v(o, e, n);
SELECT pg_temp.ro(x, 'Acompañantes', o, i, c)
  FROM unnest(ARRAY['Costilla de cerdo al barril','Bondiola al barril','Punta de anca al barril',
                    'Cuarto de pollo al barril','Medio pollo al barril','Pollo entero al barril',
                    'Chicharrón al barril','Mixto al barril']) x,
       (VALUES ('Papa criolla', 'Papa criolla', 150), ('Papa salada', 'Papa salada (pastusa)', 180),
               ('Yuca frita', 'Yuca', 180), ('Maduro', 'Plátano maduro', 0.5), ('Arepa', 'Arepa', 1),
               ('Ensalada', 'Verduras para ensalada', 80), ('Mazorca', 'Mazorca', 1),
               ('Patacón', 'Plátano verde', 0.5)) v(o, i, c);

-- Salsas: hasta 2, opcionales
SELECT pg_temp.grupo(x, 'Salsas', 0, 2, 3)
  FROM unnest(ARRAY['Costilla de cerdo al barril','Bondiola al barril','Punta de anca al barril',
                    'Cuarto de pollo al barril','Medio pollo al barril','Pollo entero al barril',
                    'Chicharrón al barril','Mixto al barril']) x;
SELECT pg_temp.opc(x, 'Salsas', o, e, n)
  FROM unnest(ARRAY['Costilla de cerdo al barril','Bondiola al barril','Punta de anca al barril',
                    'Cuarto de pollo al barril','Medio pollo al barril','Pollo entero al barril',
                    'Chicharrón al barril','Mixto al barril']) x,
       (VALUES ('BBQ', 0, 1), ('Chimichurri', 0, 2), ('Ají casero', 0, 3), ('Guacamole', 3000, 4)) v(o, e, n);
SELECT pg_temp.ro(x, 'Salsas', o, i, c)
  FROM unnest(ARRAY['Costilla de cerdo al barril','Bondiola al barril','Punta de anca al barril',
                    'Cuarto de pollo al barril','Medio pollo al barril','Pollo entero al barril',
                    'Chicharrón al barril','Mixto al barril']) x,
       (VALUES ('BBQ', 'Salsa BBQ', 40), ('Chimichurri', 'Chimichurri', 30),
               ('Ají casero', 'Ají casero', 30), ('Guacamole', 'Aguacate', 0.5)) v(o, i, c);

-- ─── Para compartir ─────────────────────────────────────────────────────────
SELECT pg_temp.prod('Para compartir', x, p, d, n) FROM (VALUES
  ('Picada para 2',       58000, 'Costilla, 1/4 de pollo, chorizo, chicharrón, papa criolla, yuca, maduro y arepas', 1),
  ('Picada familiar (4)', 108000, 'Costilla, 1/2 pollo, 2 chorizos, morcilla, chicharrón, papa criolla, yuca, maduro, arepas y guacamole', 2),
  ('Barril completo (6)', 165000, 'Costilla, pollo entero, bondiola, 3 chorizos, chicharrón, acompañantes surtidos, arepas y salsas', 3)
) v(x, p, d, n);
SELECT pg_temp.rp('Picada para 2', i, c) FROM (VALUES
  ('Costilla de cerdo', 250), ('Pollo entero', 0.25), ('Chorizo', 1), ('Tocino para chicharrón', 150),
  ('Papa criolla', 200), ('Yuca', 200), ('Plátano maduro', 0.5), ('Arepa', 2), ('Carbón', 250)) v(i, c);
SELECT pg_temp.rp('Picada familiar (4)', i, c) FROM (VALUES
  ('Costilla de cerdo', 500), ('Pollo entero', 0.5), ('Chorizo', 2), ('Morcilla', 1), ('Tocino para chicharrón', 300),
  ('Papa criolla', 400), ('Yuca', 400), ('Plátano maduro', 1), ('Arepa', 4), ('Aguacate', 1), ('Carbón', 450)) v(i, c);
SELECT pg_temp.rp('Barril completo (6)', i, c) FROM (VALUES
  ('Costilla de cerdo', 800), ('Pollo entero', 1), ('Bondiola de cerdo', 400), ('Chorizo', 3), ('Tocino para chicharrón', 400),
  ('Papa criolla', 600), ('Yuca', 500), ('Plátano maduro', 1.5), ('Arepa', 6), ('Salsa BBQ', 100),
  ('Chimichurri', 80), ('Carbón', 700)) v(i, c);

-- ─── Entradas ───────────────────────────────────────────────────────────────
SELECT pg_temp.prod('Entradas', x, p, d, n) FROM (VALUES
  ('Chorizo con arepa',      9000, 'Chorizo al barril con arepa y limón', 1),
  ('Morcilla con arepa',     9000, 'Morcilla al barril con arepa y limón', 2),
  ('Patacones con hogao',   11000, 'Tres patacones con hogao', 3),
  ('Mazorca asada',          8000, 'Mazorca al carbón con mantequilla y sal', 4),
  ('Guacamole con patacón', 14000, 'Guacamole de la casa con patacones', 5)
) v(x, p, d, n);
SELECT pg_temp.rp(x, i, c) FROM (VALUES
  ('Chorizo con arepa', 'Chorizo', 1), ('Chorizo con arepa', 'Arepa', 1), ('Chorizo con arepa', 'Limón', 0.5),
  ('Morcilla con arepa', 'Morcilla', 1), ('Morcilla con arepa', 'Arepa', 1), ('Morcilla con arepa', 'Limón', 0.5),
  ('Patacones con hogao', 'Plátano verde', 1), ('Patacones con hogao', 'Hogao', 80),
  ('Mazorca asada', 'Mazorca', 1),
  ('Guacamole con patacón', 'Aguacate', 1), ('Guacamole con patacón', 'Plátano verde', 1), ('Guacamole con patacón', 'Limón', 1)
) v(x, i, c);

-- ─── Adiciones ──────────────────────────────────────────────────────────────
SELECT pg_temp.prod('Adiciones', x, p, NULL, n) FROM (VALUES
  ('Porción de papa criolla', 6000, 1), ('Porción de yuca', 6000, 2), ('Porción de maduro', 5000, 3),
  ('Arepa adicional', 2500, 4), ('Ensalada', 5000, 5), ('Chorizo adicional', 6000, 6),
  ('Guacamole', 5000, 7), ('Salsa adicional', 1500, 8)
) v(x, p, n);
SELECT pg_temp.rp(x, i, c) FROM (VALUES
  ('Porción de papa criolla', 'Papa criolla', 200), ('Porción de yuca', 'Yuca', 220),
  ('Porción de maduro', 'Plátano maduro', 1), ('Arepa adicional', 'Arepa', 1),
  ('Ensalada', 'Verduras para ensalada', 120), ('Chorizo adicional', 'Chorizo', 1),
  ('Guacamole', 'Aguacate', 0.5)) v(x, i, c);
SELECT pg_temp.grupo('Salsa adicional', 'Salsa', 1, 1, 1);
SELECT pg_temp.opc('Salsa adicional', 'Salsa', o, 0, n)
  FROM (VALUES ('BBQ', 1), ('Chimichurri', 2), ('Ají casero', 3)) v(o, n);
SELECT pg_temp.ro('Salsa adicional', 'Salsa', o, i, 40)
  FROM (VALUES ('BBQ', 'Salsa BBQ'), ('Chimichurri', 'Chimichurri'), ('Ají casero', 'Ají casero')) v(o, i);

-- ─── Bebidas ────────────────────────────────────────────────────────────────
SELECT pg_temp.prod('Bebidas', x, p, d, n) FROM (VALUES
  ('Gaseosa 350 ml',          4500, NULL, 1),
  ('Limonada',                6000, 'Limonada natural 16 oz', 2),
  ('Jugo natural en agua',    6000, '16 oz', 3),
  ('Jugo natural en leche',   7500, '16 oz', 4),
  ('Cerveza nacional',        6000, NULL, 5),
  ('Agua',                    3500, NULL, 6)
) v(x, p, d, n);
SELECT pg_temp.rp(x, i, c) FROM (VALUES
  ('Gaseosa 350 ml', 'Gaseosa 350 ml', 1), ('Cerveza nacional', 'Cerveza nacional', 1), ('Agua', 'Agua en botella', 1),
  ('Limonada', 'Limón', 2), ('Limonada', 'Azúcar', 30),
  ('Jugo natural en agua', 'Pulpa de fruta', 150), ('Jugo natural en agua', 'Azúcar', 25),
  ('Jugo natural en leche', 'Pulpa de fruta', 150), ('Jugo natural en leche', 'Leche', 250), ('Jugo natural en leche', 'Azúcar', 25)
) v(x, i, c);

SELECT pg_temp.grupo('Gaseosa 350 ml', 'Sabor', 1, 1, 1);
SELECT pg_temp.opc('Gaseosa 350 ml', 'Sabor', o, 0, n)
  FROM (VALUES ('Cola', 1), ('Colombiana', 2), ('Manzana', 3), ('Naranja', 4), ('Limón', 5)) v(o, n);
SELECT pg_temp.grupo('Limonada', 'Tipo', 1, 1, 1);
SELECT pg_temp.opc('Limonada', 'Tipo', o, e, n)
  FROM (VALUES ('Natural', 0, 1), ('Cerezada', 2000, 2), ('De coco', 3000, 3), ('Hierbabuena', 1000, 4)) v(o, e, n);
SELECT pg_temp.grupo(x, 'Sabor', 1, 1, 1) FROM unnest(ARRAY['Jugo natural en agua', 'Jugo natural en leche']) x;
SELECT pg_temp.opc(x, 'Sabor', o, 0, n)
  FROM unnest(ARRAY['Jugo natural en agua', 'Jugo natural en leche']) x,
       (VALUES ('Mora', 1), ('Mango', 2), ('Lulo', 3), ('Maracuyá', 4), ('Guanábana', 5), ('Fresa', 6)) v(o, n);
SELECT pg_temp.grupo('Cerveza nacional', 'Marca', 1, 1, 1);
SELECT pg_temp.opc('Cerveza nacional', 'Marca', o, e, n)
  FROM (VALUES ('Águila', 0, 1), ('Poker', 0, 2), ('Club Colombia', 1000, 3), ('Costeña', 0, 4)) v(o, e, n);

-- ─── Apariencia "Brasa" y datos del negocio ─────────────────────────────────
INSERT INTO ajuste (clave, valor) VALUES
  ('tema_primario', '#c62828'), ('tema_acento', '#ff9800'),
  ('tema_barra', '#120d0b'), ('tema_barra2', '#3b2418'), ('tema_icono', '🔥')
ON CONFLICT (restaurante_id, clave) DO UPDATE SET valor = EXCLUDED.valor;
INSERT INTO ajuste (clave, valor) VALUES
  ('costo_envio', '3000'),
  ('pie_ticket', '¡Gracias por su visita! Asado lento, al barril y con todo el sabor.')
ON CONFLICT (restaurante_id, clave) DO UPDATE SET valor = EXCLUDED.valor;

-- Resumen de lo cargado
SELECT (SELECT count(*) FROM categoria WHERE restaurante_id = restaurante_actual()) AS categorias,
       (SELECT count(*) FROM producto  WHERE restaurante_id = restaurante_actual()) AS productos,
       (SELECT count(*) FROM opcion    WHERE restaurante_id = restaurante_actual()) AS opciones,
       (SELECT count(*) FROM receta    WHERE restaurante_id = restaurante_actual()) AS recetas,
       (SELECT count(*) FROM insumo    WHERE restaurante_id = restaurante_actual()) AS insumos;

COMMIT;
