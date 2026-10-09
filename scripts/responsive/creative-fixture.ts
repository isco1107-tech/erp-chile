import { blockSchema } from '@/lib/web-sites/blocks';
import { creativeSiteSchema } from '@/lib/web-sites/creative';

/** El mismo lienzo se verifica en los sitios generales y en los estudios integrados. */
export const CREATIVE_FIXTURE = creativeSiteSchema.parse({
  enabled: true,
  blocks: [blockSchema.parse({
    type: 'text', id: 'lienzo-responsive', body: '',
    style: { canvas: {
      enabled: true, replaceContent: true, height: 560, mobileHeight: 700,
      elements: [
        { id: 'fondo', kind: 'shape', transparent: false, background: '#e0f2fe', desktop: { x: 2, y: 2, width: 96, height: 96 }, radius: 24 },
        { id: 'titulo', kind: 'text', text: 'Tu página en Temuco/Longuimay', fontSize: 48, mobileFontSize: 26, desktop: { x: 8, y: 8, width: 84, height: 26 }, mobile: { x: 8, y: 6, width: 84, height: 28 } },
        { id: 'texto', kind: 'text', text: 'Diseño personalizable para Academia, certámenes y eventos. Crea, revisa y publica con tu propia identidad.', fontSize: 26, fontWeight: '400', mobileFontSize: 18, desktop: { x: 8, y: 36, width: 84, height: 28 }, mobile: { x: 8, y: 38, width: 84, height: 30 } },
        { id: 'boton', kind: 'button', text: 'Conoce la academia', href: 'https://ejemplo.cl', fontSize: 24, mobileFontSize: 18, transparent: false, background: '#0c4a6e', color: '#ffffff', align: 'center', radius: 12, desktop: { x: 8, y: 72, width: 70, height: 15 }, mobile: { x: 8, y: 75, width: 84, height: 15 } },
      ],
    } },
  })],
});
