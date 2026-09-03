/**
 * `server-only` lanza al importarse fuera del runtime de servidor de Next, lo
 * que impide testear en Jest los módulos que lo declaran. Este mock lo
 * neutraliza solo dentro de los tests: la frontera sigue vigente en el build
 * real, que es donde importa que un componente de cliente no arrastre secretos.
 */
module.exports = {};
