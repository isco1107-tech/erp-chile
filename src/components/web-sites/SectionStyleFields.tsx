'use client';

import { useId, type CSSProperties } from 'react';
import { ChevronDown, ImageIcon } from 'lucide-react';
import { SECTION_BACKGROUNDS, type BlockStyle, type BlockType, type SectionAlign, type SectionBackground, type SectionPattern, type SectionShape, type SectionSpacing, type SectionWidth } from '@/lib/web-sites/blocks';
import { readableOn, type WebSiteTheme } from '@/lib/web-sites/theme';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { ChoiceGroup } from './fields';
import { ImagePicker } from './ImagePicker';
import { Label } from '@/components/ui/label';

interface SectionStyleFieldsProps {
  style: BlockStyle;
  onChange: (patch: Partial<BlockStyle>) => void;
  disabled: boolean;
  type: BlockType;
  /** Colores del sitio: si se pasan, las muestras usan los reales; si no, muestras neutras. */
  theme?: Pick<WebSiteTheme, 'primary' | 'accent' | 'background' | 'text'>;
}

const BACKGROUND_LABELS: Record<SectionBackground, { label: string; description: string }> = {
  default: { label: 'Igual que la página', description: 'Sin franja de color.' },
  muted: { label: 'Suave', description: 'Un tono apenas distinto; separa sin llamar la atención.' },
  primary: { label: 'Color principal', description: 'Resalta con el color de tu marca.' },
  accent: { label: 'Acento', description: 'El color de los botones; úsalo poco.' },
  dark: { label: 'Oscuro', description: 'Fondo oscuro con texto claro.' },
  image: { label: 'Foto', description: 'Una foto detrás del texto.' },
  gradient: { label: 'Degradado', description: 'Tu color principal con brillos del acento.' },
  soft: { label: 'Tinte suave', description: 'Fondo claro con un toque de tus colores.' },
};

const NEUTRAL_SWATCH: Record<SectionBackground, string> = {
  default: 'bg-card',
  muted: 'bg-muted',
  primary: 'bg-foreground/85 text-background',
  accent: 'bg-accent-foreground/80 text-background',
  dark: 'bg-foreground text-background',
  image: 'bg-gradient-to-br from-foreground/70 to-foreground/30 text-background',
  gradient: 'bg-gradient-to-br from-foreground/90 to-accent-foreground/70 text-background',
  soft: 'bg-gradient-to-br from-accent/60 to-card',
};

function swatchStyle(background: SectionBackground, theme: SectionStyleFieldsProps['theme']): CSSProperties | undefined {
  if (!theme) return undefined;
  switch (background) {
    case 'default':
      return { backgroundColor: theme.background, color: theme.text };
    case 'muted':
      return { backgroundColor: `color-mix(in srgb, ${theme.text} 7%, ${theme.background})`, color: theme.text };
    case 'primary':
      return { backgroundColor: theme.primary, color: readableOn(theme.primary) };
    case 'accent':
      return { backgroundColor: theme.accent, color: readableOn(theme.accent) };
    case 'dark':
      return { backgroundColor: '#111827', color: '#f9fafb' };
    case 'image':
      return undefined;
    case 'gradient':
      return { backgroundColor: theme.primary, backgroundImage: `radial-gradient(70% 90% at 0% 0%, ${theme.accent}99, transparent 70%)`, color: readableOn(theme.primary) };
    case 'soft':
      return { backgroundColor: theme.background, backgroundImage: `radial-gradient(80% 100% at 10% 0%, ${theme.accent}33, transparent 70%)`, color: theme.text };
  }
}

function Swatch({ background, theme }: { background: SectionBackground; theme: SectionStyleFieldsProps['theme'] }) {
  const custom = swatchStyle(background, theme);
  return (
    <span
      className={cn('flex h-12 flex-col justify-center gap-1 rounded-md border border-border px-2', !custom && NEUTRAL_SWATCH[background], background === 'image' && 'items-start')}
      style={custom}
    >
      {background === 'image' ? <ImageIcon className="size-4 opacity-80" /> : null}
      <span className="block h-[3px] w-2/3 rounded-full bg-current opacity-80" />
      <span className="block h-[3px] w-1/2 rounded-full bg-current opacity-45" />
    </span>
  );
}

const SPACING_OPTIONS: { value: SectionSpacing; label: string; description: string }[] = [
  { value: 'auto', label: 'Automático', description: 'El del diseño general.' },
  { value: 'none', label: 'Sin espacio', description: 'Pegada a las de arriba y abajo.' },
  { value: 'sm', label: 'Poco', description: 'Compacta.' },
  { value: 'md', label: 'Normal', description: 'Aire equilibrado.' },
  { value: 'lg', label: 'Mucho', description: 'Respira más.' },
];

const ALIGN_OPTIONS: { value: SectionAlign; label: string; description: string }[] = [
  { value: 'auto', label: 'Automática', description: 'Como está pensada la sección.' },
  { value: 'left', label: 'A la izquierda', description: 'Textos alineados a la izquierda.' },
  { value: 'center', label: 'Centrada', description: 'Textos al centro.' },
];

const PATTERN_OPTIONS: { value: SectionPattern; label: string; description: string }[] = [
  { value: 'none', label: 'Sin textura', description: 'Fondo liso.' },
  { value: 'dots', label: 'Puntos', description: 'Una trama de puntos suave.' },
  { value: 'grid', label: 'Cuadrícula', description: 'Líneas finas, estilo técnico.' },
  { value: 'diagonal', label: 'Diagonales', description: 'Rayas diagonales muy tenues.' },
  { value: 'rings', label: 'Ondas', description: 'Círculos desde una esquina.' },
];

const PATTERN_PREVIEW: Record<SectionPattern, string> = {
  none: '',
  dots: 'bg-[radial-gradient(currentColor_1px,transparent_1.5px)] bg-[length:8px_8px]',
  grid: 'bg-[linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] bg-[length:12px_12px]',
  diagonal: 'bg-[repeating-linear-gradient(45deg,currentColor_0_1px,transparent_1px_6px)]',
  rings: 'bg-[repeating-radial-gradient(circle_at_100%_0%,transparent_0_8px,currentColor_8px_9px)]',
};

const SHAPE_OPTIONS: { value: SectionShape; label: string; description: string }[] = [
  { value: 'none', label: 'Recto', description: 'Borde horizontal de siempre.' },
  { value: 'wave', label: 'Ola', description: 'Una onda suave.' },
  { value: 'curve', label: 'Curva', description: 'Un arco amplio.' },
  { value: 'slant', label: 'Diagonal', description: 'Corte inclinado.' },
  { value: 'zigzag', label: 'Zigzag', description: 'Dientes de sierra.' },
  { value: 'triangle', label: 'Punta', description: 'Un triángulo al centro.' },
  { value: 'steps', label: 'Escalones', description: 'Peldaños de un lado al otro.' },
];

const SHAPE_PATH: Record<SectionShape, string> = {
  none: 'M0,24 L120,24 L120,30 L0,30 Z',
  wave: 'M0,18 C20,30 40,6 60,16 C80,26 100,8 120,18 L120,30 L0,30 Z',
  curve: 'M0,30 Q60,0 120,30 Z',
  slant: 'M0,30 L120,6 L120,30 Z',
  zigzag: 'M0,30 L0,22 L10,12 L20,22 L30,12 L40,22 L50,12 L60,22 L70,12 L80,22 L90,12 L100,22 L110,12 L120,22 L120,30 Z',
  triangle: 'M0,30 L60,4 L120,30 Z',
  steps: 'M0,30 L0,24 L30,24 L30,18 L60,18 L60,12 L90,12 L90,6 L120,6 L120,30 Z',
};

const WIDTH_OPTIONS: { value: SectionWidth; label: string; description: string }[] = [
  { value: 'auto', label: 'El del sitio', description: 'El ancho elegido en Diseño.' },
  { value: 'narrow', label: 'Angosto', description: 'Ideal para leer textos largos.' },
  { value: 'wide', label: 'Ancho', description: 'Más espacio para fotos y tarjetas.' },
];

function SpacingSketch({ value }: { value: SectionSpacing }) {
  const pad = value === 'none' ? 'py-0' : value === 'sm' ? 'py-0.5' : value === 'lg' ? 'py-3' : 'py-1.5';
  return (
    <span className="flex h-9 flex-col justify-center rounded-md border border-border bg-muted/50 px-2">
      <span className={cn('flex flex-col rounded-[3px] bg-foreground/10 px-1', pad, value === 'auto' && 'py-1')}>
        <span className="block h-[3px] w-2/3 rounded-full bg-foreground/45" />
      </span>
    </span>
  );
}

function AlignSketch({ value }: { value: SectionAlign }) {
  const align = value === 'center' ? 'items-center' : value === 'left' ? 'items-start' : 'items-start';
  return (
    <span className={cn('flex h-9 flex-col justify-center gap-1 rounded-md border border-border bg-muted/50 px-2', align)}>
      <span className="block h-[3px] w-2/3 rounded-full bg-foreground/45" />
      <span className="block h-[3px] w-1/2 rounded-full bg-foreground/25" />
      {value === 'auto' ? <span className="block h-[3px] w-1/3 rounded-full bg-foreground/15" /> : null}
    </span>
  );
}

/** Bloque plegable “Fondo y espacio”: fondo, foto de fondo, textura, borde, espacio, ancho y alineación. */
export function SectionStyleFields({ style, onChange, disabled, type, theme }: SectionStyleFieldsProps) {
  const sliderId = useId();
  const photo = safeImageSrc(style.backgroundImage);
  const background = BACKGROUND_LABELS[style.background];
  const spacing = SPACING_OPTIONS.find((option) => option.value === style.spacing);
  const showAlign = type !== 'divider' && type !== 'image';

  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Fondo, borde y espacio</span>
          <span className="block truncate text-xs text-muted-foreground">
            Fondo: {background.label} · Borde: {SHAPE_OPTIONS.find((option) => option.value === style.shape)?.label ?? 'Recto'} · Espacio: {spacing?.label ?? 'Automático'}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="space-y-5 border-t border-border p-3">
        <ChoiceGroup
          label="Fondo de la sección"
          hint="Alternar fondos entre secciones seguidas (claro, suave, oscuro) ayuda a leer la página por bloques."
          value={style.background}
          onChange={(next) => onChange({ background: next })}
          disabled={disabled}
          options={SECTION_BACKGROUNDS.map((value) => ({
            value,
            label: BACKGROUND_LABELS[value].label,
            description: BACKGROUND_LABELS[value].description,
            preview: <Swatch background={value} theme={theme} />,
          }))}
        />

        {style.background === 'image' ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <ImagePicker label="Foto de fondo" value={style.backgroundImage} onChange={(backgroundImage) => onChange({ backgroundImage })} hint="Horizontal y de buena calidad. Usa fotos propias: las de internet se notan y pueden tener derechos de autor." />
            {!style.backgroundImage ? <p className="text-xs font-medium text-warning">Elige una foto para que el fondo se vea.</p> : null}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={sliderId}>Oscurecer la foto</Label>
                <span className="text-sm font-medium tabular-nums">{style.overlay} %</span>
              </div>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={90}
                step={5}
                value={style.overlay}
                disabled={disabled}
                aria-valuetext={`${style.overlay} por ciento`}
                onChange={(event) => onChange({ overlay: Number(event.target.value) })}
                className="w-full accent-[var(--color-primary)] disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">Más oscuro = texto más legible. Si la foto es clara o tiene mucho detalle, sube este valor.</p>
            </div>
            <div className="relative grid h-24 place-items-center overflow-hidden rounded-lg bg-muted" aria-hidden="true">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
              ) : null}
              <span className="absolute inset-0 bg-black" style={{ opacity: style.overlay / 100 }} />
              <span className="relative text-sm font-semibold text-white">Así se leerá tu texto</span>
            </div>
          </div>
        ) : null}

        {style.background !== 'image' ? (
          <ChoiceGroup
            label="Textura del fondo"
            hint="Un detalle sutil que da profundidad. Úsala en una o dos secciones, no en todas."
            value={style.pattern}
            onChange={(next) => onChange({ pattern: next })}
            disabled={disabled}
            options={PATTERN_OPTIONS.map((option) => ({
              ...option,
              preview: (
                <span className="relative flex h-10 overflow-hidden rounded-md border border-border bg-card text-foreground/25">
                  <span className={cn('absolute inset-0', PATTERN_PREVIEW[option.value])} />
                </span>
              ),
            }))}
          />
        ) : null}

        <ChoiceGroup
          label="Forma del borde de abajo"
          hint="Se dibuja con el color de la sección siguiente. Luce cuando las dos secciones tienen fondos distintos."
          value={style.shape}
          onChange={(next) => onChange({ shape: next })}
          disabled={disabled}
          options={SHAPE_OPTIONS.map((option) => ({
            ...option,
            preview: (
              <span className="flex h-10 items-end overflow-hidden rounded-md border border-border bg-foreground/75">
                <svg viewBox="0 0 120 30" preserveAspectRatio="none" className="block h-6 w-full fill-card">
                  <path d={SHAPE_PATH[option.value]} />
                </svg>
              </span>
            ),
          }))}
        />

        <ChoiceGroup
          label="Espacio arriba y abajo"
          value={style.spacing}
          onChange={(next) => onChange({ spacing: next })}
          disabled={disabled}
          options={SPACING_OPTIONS.map((option) => ({ ...option, preview: <SpacingSketch value={option.value} /> }))}
        />

        <ChoiceGroup
          label="Ancho del contenido"
          value={style.width}
          onChange={(next) => onChange({ width: next })}
          disabled={disabled}
          options={WIDTH_OPTIONS.map((option) => ({
            ...option,
            preview: (
              <span className="flex h-9 items-center justify-center rounded-md border border-border bg-muted/50 px-1">
                <span className={cn('block h-4 rounded-[3px] bg-foreground/25', option.value === 'narrow' ? 'w-1/2' : option.value === 'wide' ? 'w-full' : 'w-3/4')} />
              </span>
            ),
          }))}
        />

        {showAlign ? (
          <ChoiceGroup
            label="Alineación del texto"
            value={style.align}
            onChange={(next) => onChange({ align: next })}
            disabled={disabled}
            options={ALIGN_OPTIONS.map((option) => ({ ...option, preview: <AlignSketch value={option.value} /> }))}
          />
        ) : null}
      </div>
    </details>
  );
}
