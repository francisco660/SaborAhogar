// Proveedores tecnológicos disponibles. Para conectar el real, copie plantilla.js,
// complételo con la API contratada y agréguelo a esta lista.
import simulador from './simulador.js';

const PROVEEDORES = [simulador];

export const listaProveedores = () => PROVEEDORES.map((p) => ({ id: p.id, nombre: p.nombre, necesitaCredenciales: p.necesitaCredenciales }));

export function proveedor(id) {
  const p = PROVEEDORES.find((x) => x.id === id);
  if (!p) throw new Error(`Proveedor de facturación "${id || '(ninguno)'}" no configurado`);
  return p;
}
