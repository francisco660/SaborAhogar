-- ============================================================================
--  Datos iniciales: menú real de "Con Sabor a Hogar" (Cra 72 cl 20f -4, París-Bello)
--  Los INSUMOS, COSTOS y CANTIDADES DE RECETA son EJEMPLOS: ajústelos desde la
--  app (Menú → Receta, Inventario → Insumos) con los valores reales.
-- ============================================================================
SET search_path TO pos, public;

INSERT INTO ajuste (clave, valor) VALUES
  ('nombre_negocio', 'Con Sabor a Hogar'),
  ('direccion',      'Cra 72 cl 20f -4, París - Bello'),
  ('telefono',       '304 662 5131'),
  ('costo_envio',    '2000'),
  ('pie_ticket',     '¡Gracias por su compra! Comida casera, con el sabor de siempre.')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO mesa (nombre, orden)
SELECT 'Mesa ' || n, n FROM generate_series(1, 8) n
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO categoria (nombre, orden) VALUES
  ('Desayunos', 1), ('Adiciones desayuno', 2), ('Almuerzo', 3),
  ('Platos a la carta', 4), ('Adiciones almuerzo', 5), ('Bebidas', 6)
ON CONFLICT (nombre) DO NOTHING;

-- ─── Insumos (unidad base: g, ml o und) y costo por unidad base ─────────────
INSERT INTO insumo (nombre, unidad, stock_minimo, costo_promedio) VALUES
  ('Huevo',                    'und',   30,    600),
  ('Arepa grande',             'und',   20,    700),
  ('Arepa pequeña',            'und',   30,    250),
  ('Pan',                      'und',   10,    500),
  ('Queso campesino',          'g',   1000,     22),
  ('Queso mozzarella',         'g',   1000,     28),
  ('Jamón',                    'g',    500,     25),
  ('Hogao',                    'g',    500,      8),
  ('Chocolate en pastilla',    'g',    500,     30),
  ('Café molido',              'g',    250,     50),
  ('Leche',                    'ml',  3000,      4.5),
  ('Azúcar',                   'g',   1000,      4),
  ('Arroz',                    'g',   5000,      4.5),
  ('Fríjol',                   'g',   3000,     12),
  ('Chicharrón',               'g',   1000,     30),
  ('Carne de res',             'g',   2000,     32),
  ('Carne de cerdo',           'g',   2000,     24),
  ('Morcilla',                 'und',   10,   2500),
  ('Chorizo',                  'und',   10,   2200),
  ('Churrasco',                'g',   3000,     48),
  ('Punta de anca',            'g',   3000,     45),
  ('Solomo',                   'g',   3000,     44),
  ('Pechuga de pollo',         'g',   3000,     20),
  ('Costilla de cerdo',        'g',   3000,     22),
  ('Salsa BBQ',                'g',    500,     15),
  ('Papa',                     'g',   5000,      3),
  ('Verduras para ensalada',   'g',   2000,      8),
  ('Aguacate',                 'und',    5,   3000),
  ('Fruta para jugo',          'g',   3000,      8),
  ('Plátano maduro',           'und',   10,   1500),
  ('Base sopa del día',        'g',   3000,     10),
  ('Aceite',                   'ml',  2000,     10)
ON CONFLICT (nombre) DO NOTHING;

-- Inventario inicial de ejemplo: 3 veces el stock mínimo
INSERT INTO movimiento_inventario (insumo_id, tipo, cantidad, costo_unit, nota)
SELECT i.id, 'INICIAL', i.stock_minimo * 3, i.costo_promedio, 'Inventario inicial de ejemplo'
  FROM insumo i
 WHERE NOT EXISTS (
   SELECT 1 FROM movimiento_inventario m WHERE m.insumo_id = i.id AND m.tipo = 'INICIAL'
 );

-- ─── Ayudas para escribir el menú sin ids ───────────────────────────────────
CREATE FUNCTION pg_temp.prod(p_cat text, p_nombre text, p_precio numeric, p_desc text, p_orden int)
RETURNS int LANGUAGE sql AS $$
  INSERT INTO pos.producto (categoria_id, nombre, precio, descripcion, orden)
  SELECT id, p_nombre, p_precio, p_desc, p_orden FROM pos.categoria WHERE nombre = p_cat
  RETURNING id
$$;

CREATE FUNCTION pg_temp.grupo(p_prod text, p_nombre text, p_orden int) RETURNS int LANGUAGE sql AS $$
  INSERT INTO pos.grupo_opcion (producto_id, nombre, orden)
  SELECT id, p_nombre, p_orden FROM pos.producto WHERE nombre = p_prod
  RETURNING id
$$;

CREATE FUNCTION pg_temp.opc(p_prod text, p_grupo text, p_nombre text, p_orden int) RETURNS int LANGUAGE sql AS $$
  INSERT INTO pos.opcion (grupo_id, nombre, orden)
  SELECT g.id, p_nombre, p_orden FROM pos.grupo_opcion g JOIN pos.producto p ON p.id = g.producto_id
   WHERE p.nombre = p_prod AND g.nombre = p_grupo
  RETURNING id
$$;

-- receta de un producto
CREATE FUNCTION pg_temp.rp(p_prod text, p_insumo text, p_cant numeric) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.receta (producto_id, insumo_id, cantidad)
  SELECT p.id, i.id, p_cant FROM pos.producto p, pos.insumo i
   WHERE p.nombre = p_prod AND i.nombre = p_insumo
$$;

-- receta de una opción
CREATE FUNCTION pg_temp.ro(p_prod text, p_grupo text, p_opc text, p_insumo text, p_cant numeric)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO pos.receta (opcion_id, insumo_id, cantidad)
  SELECT o.id, i.id, p_cant
    FROM pos.opcion o
    JOIN pos.grupo_opcion g ON g.id = o.grupo_id
    JOIN pos.producto p ON p.id = g.producto_id
    JOIN pos.insumo i ON i.nombre = p_insumo
   WHERE p.nombre = p_prod AND g.nombre = p_grupo AND o.nombre = p_opc
$$;

-- ─── Desayunos ──────────────────────────────────────────────────────────────
SELECT pg_temp.prod('Desayunos', 'Desayuno Tradicional', 10000,
  'Arepa con huevos al gusto, jamón u hogao, queso, pan y bebida caliente', 1);
SELECT pg_temp.prod('Desayunos', 'Desayuno Especial', 14000,
  'Calentado con huevos al gusto, arepa, queso y bebida caliente', 2);
SELECT pg_temp.prod('Desayunos', 'Desayuno Con Sabor a Hogar', 18000,
  'Calentado con huevos al gusto, arepa, queso, proteína a elección y bebida caliente', 3);

SELECT pg_temp.grupo('Desayuno Tradicional', 'Acompañante', 1);
SELECT pg_temp.opc('Desayuno Tradicional', 'Acompañante', 'Jamón', 1);
SELECT pg_temp.opc('Desayuno Tradicional', 'Acompañante', 'Hogao', 2);
SELECT pg_temp.ro('Desayuno Tradicional', 'Acompañante', 'Jamón', 'Jamón', 40);
SELECT pg_temp.ro('Desayuno Tradicional', 'Acompañante', 'Hogao', 'Hogao', 60);

SELECT pg_temp.grupo('Desayuno Con Sabor a Hogar', 'Proteína', 1);
SELECT pg_temp.opc('Desayuno Con Sabor a Hogar', 'Proteína', x, n)
  FROM (VALUES ('Chicharrón',1),('Carne de res',2),('Cerdo',3),('Morcilla',4),('Chorizo',5)) v(x,n);
SELECT pg_temp.ro('Desayuno Con Sabor a Hogar', 'Proteína', 'Chicharrón',   'Chicharrón', 120);
SELECT pg_temp.ro('Desayuno Con Sabor a Hogar', 'Proteína', 'Carne de res', 'Carne de res', 120);
SELECT pg_temp.ro('Desayuno Con Sabor a Hogar', 'Proteína', 'Cerdo',        'Carne de cerdo', 120);
SELECT pg_temp.ro('Desayuno Con Sabor a Hogar', 'Proteína', 'Morcilla',     'Morcilla', 1);
SELECT pg_temp.ro('Desayuno Con Sabor a Hogar', 'Proteína', 'Chorizo',      'Chorizo', 1);

-- Bebida caliente para los tres desayunos
SELECT pg_temp.grupo(d, 'Bebida', 2)
  FROM unnest(ARRAY['Desayuno Tradicional','Desayuno Especial','Desayuno Con Sabor a Hogar']) d;
SELECT pg_temp.opc(d, 'Bebida', 'Chocolate caliente', 1),
       pg_temp.opc(d, 'Bebida', 'Café con leche', 2)
  FROM unnest(ARRAY['Desayuno Tradicional','Desayuno Especial','Desayuno Con Sabor a Hogar']) d;
SELECT pg_temp.ro(d, 'Bebida', 'Chocolate caliente', 'Chocolate en pastilla', 25),
       pg_temp.ro(d, 'Bebida', 'Chocolate caliente', 'Leche', 200),
       pg_temp.ro(d, 'Bebida', 'Café con leche', 'Café molido', 10),
       pg_temp.ro(d, 'Bebida', 'Café con leche', 'Leche', 150)
  FROM unnest(ARRAY['Desayuno Tradicional','Desayuno Especial','Desayuno Con Sabor a Hogar']) d;

-- Base de cada desayuno
SELECT pg_temp.rp('Desayuno Tradicional', 'Arepa grande', 1),
       pg_temp.rp('Desayuno Tradicional', 'Huevo', 2),
       pg_temp.rp('Desayuno Tradicional', 'Queso campesino', 40),
       pg_temp.rp('Desayuno Tradicional', 'Pan', 1),
       pg_temp.rp('Desayuno Tradicional', 'Aceite', 10);
SELECT pg_temp.rp(d, 'Arepa grande', 1),
       pg_temp.rp(d, 'Huevo', 2),
       pg_temp.rp(d, 'Queso campesino', 40),
       pg_temp.rp(d, 'Arroz', 60),
       pg_temp.rp(d, 'Fríjol', 50),
       pg_temp.rp(d, 'Aceite', 15)
  FROM unnest(ARRAY['Desayuno Especial','Desayuno Con Sabor a Hogar']) d;

-- ─── Adiciones de desayuno ──────────────────────────────────────────────────
SELECT pg_temp.prod('Adiciones desayuno', x, p, NULL, n)
  FROM (VALUES ('Arepa grande',1000,1),('Arepa con mozzarella',2000,2),
               ('Huevos revueltos con aliños',2500,3),('Hogao (adición)',1500,4),
               ('Queso tajada',2000,5),('Chocolate caliente',2000,6),('Café con leche',2000,7)) v(x,p,n);
SELECT pg_temp.rp('Arepa grande', 'Arepa grande', 1);
SELECT pg_temp.rp('Arepa con mozzarella', 'Arepa grande', 1), pg_temp.rp('Arepa con mozzarella', 'Queso mozzarella', 30);
SELECT pg_temp.rp('Huevos revueltos con aliños', 'Huevo', 2), pg_temp.rp('Huevos revueltos con aliños', 'Hogao', 20);
SELECT pg_temp.rp('Hogao (adición)', 'Hogao', 60);
SELECT pg_temp.rp('Queso tajada', 'Queso campesino', 50);
SELECT pg_temp.rp('Chocolate caliente', 'Chocolate en pastilla', 25), pg_temp.rp('Chocolate caliente', 'Leche', 200);
SELECT pg_temp.rp('Café con leche', 'Café molido', 10), pg_temp.rp('Café con leche', 'Leche', 150);

-- ─── Almuerzo: menú del día ─────────────────────────────────────────────────
SELECT pg_temp.prod('Almuerzo', 'Menú del día', 18000,
  'Sopa del día, arroz, ensalada, acompañantes, arepa y jugo natural en agua', 1);
SELECT pg_temp.rp('Menú del día', x, c)
  FROM (VALUES ('Base sopa del día',350),('Arroz',90),('Verduras para ensalada',60),
               ('Plátano maduro',0.5),('Arepa pequeña',1),('Fruta para jugo',120),
               ('Azúcar',20),('Aceite',15)) v(x,c);

-- ─── Platos a la carta (con papas, arepa con mozzarella y ensalada) ─────────
SELECT pg_temp.prod('Platos a la carta', x, p, d, n)
  FROM (VALUES
    ('Churrasco',     42000, 'Churrasco 300 g, papas, arepa con mozzarella y ensalada', 1),
    ('Punta de anca', 40000, 'Punta de anca 300 g, papas, arepa con mozzarella y ensalada', 2),
    ('Solomo',        40000, 'Solomo 300 g, papas, arepa con mozzarella y ensalada', 3),
    ('Cerdo',         35000, 'Carne de cerdo, papas, arepa con mozzarella y ensalada', 4),
    ('Res',           35000, 'Carne de res, papas, arepa con mozzarella y ensalada', 5),
    ('Pollo',         35000, 'Pechuga de pollo, papas, arepa con mozzarella y ensalada', 6),
    ('Costillas BBQ', 35000, 'Costillas BBQ, papas, arepa con mozzarella y ensalada', 7)) v(x,p,d,n);

SELECT pg_temp.rp(x, 'Papa', 200), pg_temp.rp(x, 'Arepa pequeña', 1),
       pg_temp.rp(x, 'Queso mozzarella', 30), pg_temp.rp(x, 'Verduras para ensalada', 60),
       pg_temp.rp(x, 'Aceite', 40)
  FROM unnest(ARRAY['Churrasco','Punta de anca','Solomo','Cerdo','Res','Pollo','Costillas BBQ']) x;
SELECT pg_temp.rp(x, i, c)
  FROM (VALUES ('Churrasco','Churrasco',300),('Punta de anca','Punta de anca',300),
               ('Solomo','Solomo',300),('Cerdo','Carne de cerdo',250),('Res','Carne de res',250),
               ('Pollo','Pechuga de pollo',250),('Costillas BBQ','Costilla de cerdo',350),
               ('Costillas BBQ','Salsa BBQ',40)) v(x,i,c);

SELECT pg_temp.grupo(x, 'Término', 1) FROM unnest(ARRAY['Churrasco','Punta de anca','Solomo','Res']) x;
SELECT pg_temp.opc(x, 'Término', t, n)
  FROM unnest(ARRAY['Churrasco','Punta de anca','Solomo','Res']) x,
       (VALUES ('Término medio',1),('Tres cuartos',2),('Bien asado',3)) v(t,n);

-- ─── Adiciones de almuerzo y bebidas ────────────────────────────────────────
SELECT pg_temp.prod('Adiciones almuerzo', x, p, NULL, n)
  FROM (VALUES ('Ensalada',3000,1),('Porción de papas',4000,2),
               ('Arepa pequeña',500,3),('Aguacate',3000,4)) v(x,p,n);
SELECT pg_temp.rp('Ensalada', 'Verduras para ensalada', 120);
SELECT pg_temp.rp('Porción de papas', 'Papa', 250), pg_temp.rp('Porción de papas', 'Aceite', 40);
SELECT pg_temp.rp('Arepa pequeña', 'Arepa pequeña', 1);
SELECT pg_temp.rp('Aguacate', 'Aguacate', 0.5);

SELECT pg_temp.prod('Bebidas', 'Jugo natural en agua (12 oz)', 6000, NULL, 1);
SELECT pg_temp.prod('Bebidas', 'Jugo natural en leche (12 oz)', 10000, NULL, 2);
SELECT pg_temp.grupo(x, 'Sabor', 1)
  FROM unnest(ARRAY['Jugo natural en agua (12 oz)','Jugo natural en leche (12 oz)']) x;
SELECT pg_temp.opc(x, 'Sabor', s, n)
  FROM unnest(ARRAY['Jugo natural en agua (12 oz)','Jugo natural en leche (12 oz)']) x,
       (VALUES ('Mora',1),('Fresa',2),('Lulo',3),('Maracuyá',4),('Mango',5),('Naranja',6)) v(s,n);
SELECT pg_temp.rp('Jugo natural en agua (12 oz)', 'Fruta para jugo', 150),
       pg_temp.rp('Jugo natural en agua (12 oz)', 'Azúcar', 25);
SELECT pg_temp.rp('Jugo natural en leche (12 oz)', 'Fruta para jugo', 150),
       pg_temp.rp('Jugo natural en leche (12 oz)', 'Leche', 250),
       pg_temp.rp('Jugo natural en leche (12 oz)', 'Azúcar', 25);

INSERT INTO proveedor (nombre) VALUES ('Plaza de mercado'), ('Carnicería'), ('Distribuidor lácteos')
ON CONFLICT (nombre) DO NOTHING;
