import type { BadgeTemplate } from '@prisma/client';
import { ACCREDITATION_LEVEL_LABELS } from './schema';
import type { AccreditationLevel } from '@prisma/client';

export const BADGE_WIDTH = 640;
export const BADGE_HEIGHT = 1000;

export interface BadgeRenderInput {
  template: BadgeTemplate | null;
  companyName: string;
  projectName: string;
  fullName: string;
  role: string;
  organization: string | null;
  accessLevel: AccreditationLevel;
  badgeCode: string;
  /** `data:image/png;base64,...` — ya resuelto por el llamador (ImageResponse/satori no hacen fetch de rutas internas de la propia app). */
  qrDataUrl: string;
}

const FALLBACK_TEMPLATE = {
  backgroundMode: 'COLOR' as const,
  backgroundColor: '#1e3a5f',
  backgroundImageUrl: null as string | null,
  imageDisplayMode: 'SOLID' as const,
  watermarkOpacityBps: 2000,
  accentColor: '#1e3a5f',
  textColor: '#0f172a',
};

/**
 * JSX que consume `ImageResponse` (satori) para componer el fondo (color
 * sólido, imagen opaca, o imagen en marca de agua) más los datos de la
 * credencial y el QR encima. Único punto de composición visual, compartido
 * entre el PNG descargable y — vía los mismos valores — la página de
 * verificación pública.
 */
export function renderBadgeElement(input: BadgeRenderInput) {
  const t = input.template ?? FALLBACK_TEMPLATE;
  const hasImage = t.backgroundMode === 'IMAGE' && !!t.backgroundImageUrl;
  const isWatermark = hasImage && t.imageDisplayMode === 'WATERMARK';
  const watermarkOpacity = Math.max(0, Math.min(1, t.watermarkOpacityBps / 10000));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: t.backgroundColor,
        fontFamily: 'sans-serif',
      }}
    >
      {hasImage && t.backgroundImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={t.backgroundImageUrl}
          alt=""
          width={BADGE_WIDTH}
          height={BADGE_HEIGHT}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isWatermark ? watermarkOpacity : 1,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: t.accentColor,
            padding: '28px 32px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#ffffff' }}>{input.companyName}</div>
          <div style={{ display: 'flex', fontSize: 16, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>{input.projectName}</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            margin: '24px',
            padding: '28px',
            borderRadius: 20,
            backgroundColor: hasImage && !isWatermark ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.96)',
            alignItems: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={input.qrDataUrl} width={260} height={260} alt="" style={{ borderRadius: 12 }} />

          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: t.textColor, marginTop: 24, textAlign: 'center' }}>
            {input.fullName}
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: t.textColor, opacity: 0.75, marginTop: 6 }}>{input.role}</div>
          {input.organization && (
            <div style={{ display: 'flex', fontSize: 16, color: t.textColor, opacity: 0.6, marginTop: 4 }}>{input.organization}</div>
          )}

          <div
            style={{
              display: 'flex',
              marginTop: 24,
              padding: '8px 20px',
              borderRadius: 999,
              backgroundColor: t.accentColor,
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {ACCREDITATION_LEVEL_LABELS[input.accessLevel]}
          </div>

          <div style={{ display: 'flex', fontSize: 13, color: t.textColor, opacity: 0.5, marginTop: 20, fontFamily: 'monospace' }}>
            {input.badgeCode}
          </div>
        </div>
      </div>
    </div>
  );
}
