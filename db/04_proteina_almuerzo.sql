-- Proteína a elección en el "Menú del día" (almuerzo).
-- Idempotente: se puede ejecutar sobre una base existente sin duplicar datos.

INSERT INTO pos.insumo (nombre, unidad, stock_minimo, costo_promedio)
VALUES ('Pescado', 'g', 2000, 30)
ON CONFLICT DO NOTHING;

INSERT INTO pos.grupo_opcion (producto_id, nombre, orden)
SELECT p.id, 'Proteína', 1 FROM pos.producto p
 WHERE p.nombre = 'Menú del día'
   AND NOT EXISTS (SELECT 1 FROM pos.grupo_opcion g WHERE g.producto_id = p.id AND g.nombre = 'Proteína');

-- Opción, orden, insumo y cantidad que descuenta del inventario
WITH v(opc, n, ins, cant) AS (VALUES
  ('Carne de cerdo', 1, 'Carne de cerdo',   150),
  ('Carne de res',   2, 'Carne de res',     150),
  ('Chicharrón',     3, 'Chicharrón',       150),
  ('Pechuga',        4, 'Pechuga de pollo', 150),
  ('Chorizo',        5, 'Chorizo',            1),
  ('Pescado',        6, 'Pescado',          180)
), g AS (
  SELECT g.id FROM pos.grupo_opcion g JOIN pos.producto p ON p.id = g.producto_id
   WHERE p.nombre = 'Menú del día' AND g.nombre = 'Proteína'
), nuevas AS (
  INSERT INTO pos.opcion (grupo_id, nombre, orden)
  SELECT g.id, v.opc, v.n FROM g, v
   WHERE NOT EXISTS (SELECT 1 FROM pos.opcion o WHERE o.grupo_id = g.id AND o.nombre = v.opc)
  RETURNING id, nombre
)
INSERT INTO pos.receta (opcion_id, insumo_id, cantidad)
SELECT nuevas.id, i.id, v.cant
  FROM nuevas JOIN v ON v.opc = nuevas.nombre JOIN pos.insumo i ON i.nombre = v.ins;
