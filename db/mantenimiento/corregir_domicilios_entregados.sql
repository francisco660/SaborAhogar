-- Domicilios marcados como "Entregado" cuando la cocina aún no los había terminado.
-- Les quita la marca de entregado para que vuelvan a "pendientes"; cuando la cocina
-- los marque como listos, el domiciliario podrá marcarlos como entregados de nuevo.
-- Se puede ejecutar varias veces (Supabase SQL Editor).

SET search_path TO pos, public;

-- 1) Ver cuáles están mal (solo consulta)
SELECT p.id, p.estado, p.entregado_en, string_agg(i.estado, ', ') AS estados_items
  FROM pedido p JOIN pedido_item i ON i.pedido_id = p.id
 WHERE p.tipo = 'DOMICILIO' AND p.entregado_en IS NOT NULL
   AND EXISTS (SELECT 1 FROM pedido_item x WHERE x.pedido_id = p.id
                 AND x.estado IN ('pendiente', 'en_cocina', 'preparando'))
 GROUP BY p.id;

-- 2) Corregirlos
UPDATE pedido p SET entregado_en = NULL
 WHERE p.tipo = 'DOMICILIO' AND p.entregado_en IS NOT NULL
   AND EXISTS (SELECT 1 FROM pedido_item x WHERE x.pedido_id = p.id
                 AND x.estado IN ('pendiente', 'en_cocina', 'preparando'));
