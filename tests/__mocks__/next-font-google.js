/**
 * `next/font/google` lo resuelve el cargador de Next al compilar; Jest no lo
 * ejecuta, así que cualquier fuente (`Inter`, `Poppins`…) devuelve un objeto
 * con la misma forma que el real. La clase de variable conserva el nombre
 * pedido (`--wsf-inter` → `mock-wsf-inter`) para poder comprobarla en pruebas.
 */
function font(options) {
  const variable = options && typeof options.variable === 'string' ? `mock${options.variable}` : 'mock-font-variable';
  return { className: 'mock-font', variable, style: { fontFamily: 'mock-font' } };
}

module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, name) {
      if (name in target) return target[name];
      if (typeof name === 'symbol' || name === 'then') return undefined;
      return font;
    },
  }
);
