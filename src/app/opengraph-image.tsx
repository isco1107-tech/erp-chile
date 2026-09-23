import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Imagen para compartir en redes y mensajería (1200×630). Antes se usaba el
 * logo (1280×698, fondo blanco): WhatsApp/LinkedIn lo recortaban y no decía
 * qué es Aether. Esta repite el titular y la identidad del landing.
 */
export const alt = 'Aether ERP: ventas, inventario, finanzas y eventos en un solo lugar, hecho para Chile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), 'public/branding/aether-icon.png'));
  const iconSrc = `data:image/png;base64,${icon.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(150deg, #10131a 0%, #0c0f15 60%, #151a24 100%)',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} width={46} height={54} alt="" />
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 44, fontWeight: 600 }}>
            Aether
            <span style={{ fontSize: 18, marginLeft: 10, opacity: 0.6 }}>ERP</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 78, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
          <span>Menos caos.</span>
          <span>Más control.</span>
          <span style={{ color: '#dbc076' }}>Mejor negocio.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, color: '#b7bbc3' }}>
          <span>Ventas · Inventario PMP · Finanzas · F29 · Eventos</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#dbc076' }}>Hecho para Chile</span>
        </div>
      </div>
    ),
    size
  );
}
