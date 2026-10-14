export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class ErrorApp extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

export const entero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// Fecha de hoy en Colombia (YYYY-MM-DD)
export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
