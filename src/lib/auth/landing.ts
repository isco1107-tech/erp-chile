/**
 * A dónde llega una persona al iniciar sesión cuando no hay otro destino.
 *
 * Un bodeguero con el celular en la mano necesita la app de bodega (`/bodega`),
 * no el panel completo, que está pensado para pantalla grande. En el
 * computador sigue yendo al panel. Es solo una comodidad de navegación: no
 * concede nada (los permisos los exigen la página y la API).
 */
const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile/i;

export function prefersWarehouseApp(input: { role: string; userAgent: string | null | undefined; hasInventory: boolean }): boolean {
  return input.role === 'WAREHOUSE' && input.hasInventory && MOBILE_USER_AGENT.test(input.userAgent ?? '');
}
