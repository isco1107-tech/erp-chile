import type { MetadataRoute } from 'next';

/**
 * Manifest web: nombre, colores e ícono cuando alguien agrega Aether a la
 * pantalla de inicio (móvil) o lo instala desde el navegador. Mismos colores
 * de la identidad (tinta + dorado).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aether ERP',
    short_name: 'Aether',
    description: 'Ventas, inventario, finanzas y eventos en un solo lugar. ERP hecho para Chile.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#10131a',
    theme_color: '#10131a',
    lang: 'es-CL',
    icons: [{ src: '/icon.png', sizes: 'any', type: 'image/png' }],
  };
}
