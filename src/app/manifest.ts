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
    // Íconos cuadrados a su tamaño real: el original (1444×1089, 416 KB) se
    // descargaba en cada visita y retrasaba la primera pintura en móvil.
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/branding/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
