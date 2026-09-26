import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Imagen para compartir `/empresas` en redes y mensajería (1200×630). Tono
 * claro a propósito (fondo blanco, tinta como texto, dorado solo de acento):
 * la landing corporativa es blanca, así que lo que se comparte en LinkedIn o
 * correo debe verse coherente con la página, no con la imagen oscura de `/`.
 */
export const alt = 'Aether ERP para empresas: gestión, finanzas y cumplimiento SII en un solo sistema';
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
          background: '#ffffff',
          color: '#12161f',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src={iconSrc} width={46} height={54} alt="" />
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 44, fontWeight: 600 }}>
            Aether
            <span style={{ fontSize: 18, marginLeft: 10, color: '#45474d' }}>ERP</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 64, fontWeight: 600, lineHeight: 1.15, letterSpacing: -1.5 }}>
          <span>El ERP que ordena</span>
          <span>tu empresa y cumple</span>
          <span style={{ color: '#7a5d1c' }}>con el SII.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, color: '#45474d' }}>
          <span>Ventas · Inventario · Finanzas · Contabilidad · SII</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7a5d1c' }}>Para empresas chilenas</span>
        </div>
      </div>
    ),
    size
  );
}
