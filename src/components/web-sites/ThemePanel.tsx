'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Ban, MoveRight, MoveUp, Sun, ZoomIn } from 'lucide-react';
import {
  ANIMATION_INFO,
  ANIMATION_OPTIONS,
  activeKit,
  BUTTON_STYLES,
  BUTTON_STYLE_INFO,
  CARD_STYLES,
  CARD_STYLE_INFO,
  HEADING_WEIGHTS,
  HEADING_WEIGHT_INFO,
  kitTheme,
  THEME_KITS,
  FONT_OPTIONS,
  FONT_PAIRINGS,
  FONT_STACKS,
  HEX_COLOR_RE,
  RADIUS_OPTIONS,
  RADIUS_VALUES,
  readableOn,
  SPACING_INFO,
  SPACING_OPTIONS,
  THEME_PALETTES,
  themeProblems,
  WIDTH_OPTIONS,
  type SiteAnimation,
  type SiteButtonStyle,
  type SiteCardStyle,
  type SiteFont,
  type SiteHeadingWeight,
  type SiteHeadingFont,
  type SiteRadius,
  type SiteSpacing,
  type SiteWidth,
  type ThemeKit,
  type WebSiteTheme,
} from '@/lib/web-sites/theme';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ChoiceGroup } from './fields';
import { SITE_FONT_CLASSES } from './site-fonts';

type ColorKey = 'primary' | 'accent' | 'background' | 'text';

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'primary', label: 'Color principal', hint: 'Portada, franjas y barra superior. Ej.: el color de tu logo.' },
  { key: 'accent', label: 'Color de acento', hint: 'Botones, títulos destacados y detalles. Ej.: un dorado o un naranjo.' },
  { key: 'background', label: 'Fondo de la página', hint: 'Detrás de los textos. Lo más seguro: blanco o casi blanco.' },
  { key: 'text', label: 'Color del texto', hint: 'Párrafos y títulos. Debe contrastar con el fondo.' },
];

/** `#abc123`, o `abc123` sin numeral (se perdona), o `null` si no es un color completo. */
function normalizeHex(raw: string): string | null {
  const value = raw.trim();
  const withHash = /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : value;
  return HEX_COLOR_RE.test(withHash) ? withHash.toLowerCase() : null;
}

function ColorField({ label, hint, value, disabled, onChange }: { label: string; hint: string; value: string; disabled: boolean; onChange: (hex: string) => void }) {
  const id = useId();
  // Mientras se escribe, el texto puede estar a medias: solo se guarda al completar un color válido.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && normalizeHex(draft) === null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-hex`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.toLowerCase()}
          disabled={disabled}
          aria-label={`${label}: elegir con el selector de color`}
          onChange={(event) => {
            setDraft(null);
            onChange(event.target.value);
          }}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={`${id}-hex`}
          value={shown}
          maxLength={7}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
          className="font-mono uppercase"
          onChange={(event) => {
            const text = event.target.value;
            const hex = normalizeHex(text);
            if (hex) {
              setDraft(null);
              onChange(hex);
            } else {
              setDraft(text);
            }
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      {invalid ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          Escribe el color con 6 dígitos, por ejemplo #B8963E.
        </p>
      ) : null}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vistas rápidas (usan los colores y tipografías reales del sitio del cliente)
// ---------------------------------------------------------------------------

type Colors = Pick<WebSiteTheme, 'primary' | 'accent' | 'background' | 'text'>;

/** Página en miniatura con esos cuatro colores. */
function PaletteThumb({ colors }: { colors: Colors }) {
  return (
    <span className="block space-y-2">
      <span className="block overflow-hidden rounded-md border border-border" style={{ backgroundColor: colors.background }}>
        <span className="flex items-center justify-between px-2 py-1.5" style={{ backgroundColor: colors.primary }}>
          <span className="block h-1 w-6 rounded-full" style={{ backgroundColor: readableOn(colors.primary) }} />
          <span className="flex gap-1">
            <span className="block h-1 w-3 rounded-full opacity-60" style={{ backgroundColor: readableOn(colors.primary) }} />
            <span className="block h-1 w-3 rounded-full opacity-60" style={{ backgroundColor: readableOn(colors.primary) }} />
          </span>
        </span>
        <span className="block space-y-1 px-2 py-2.5">
          <span className="block h-1.5 w-2/3 rounded-full" style={{ backgroundColor: colors.text }} />
          <span className="block h-1 w-full rounded-full opacity-40" style={{ backgroundColor: colors.text }} />
          <span className="block h-1 w-4/5 rounded-full opacity-40" style={{ backgroundColor: colors.text }} />
          <span className="mt-1.5 block h-2.5 w-10 rounded-full" style={{ backgroundColor: colors.accent }} />
        </span>
      </span>
      <span className="flex gap-1.5">
        {(['primary', 'accent', 'background', 'text'] as const).map((key) => (
          <span key={key} className="block size-4 rounded-full border border-border" style={{ backgroundColor: colors[key] }} />
        ))}
      </span>
    </span>
  );
}

/** Marco con el fondo y el texto del sitio, para que las muestras se vean como quedarán. */
function Stage({ theme, children, className }: { theme: WebSiteTheme; children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex min-h-14 items-center justify-center rounded-md border border-border p-2', className)} style={{ backgroundColor: theme.background, color: theme.text }}>
      {children}
    </span>
  );
}

function fontFamily(font: SiteFont): CSSProperties {
  return { fontFamily: FONT_STACKS[font].css };
}

function headingFontOf(theme: Pick<WebSiteTheme, 'font' | 'headingFont'>): SiteFont {
  return theme.headingFont === 'same' ? theme.font : theme.headingFont;
}

function ButtonSample({ variant, theme }: { variant: SiteButtonStyle; theme: WebSiteTheme }) {
  const radius = variant === 'pill' ? 999 : RADIUS_VALUES[theme.radius].px;
  const style: CSSProperties = {
    ...fontFamily(theme.font),
    borderRadius: radius,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    display: 'inline-block',
    lineHeight: 1.2,
  };
  if (variant === 'outline') Object.assign(style, { border: `2px solid ${theme.accent}`, color: theme.accent, padding: '4px 12px' });
  else if (variant === 'gradient') Object.assign(style, { backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`, color: readableOn(theme.primary) });
  else if (variant === 'soft') Object.assign(style, { backgroundColor: `${theme.accent}29`, color: theme.text });
  else if (variant === 'brutal') Object.assign(style, { backgroundColor: theme.accent, color: readableOn(theme.accent), border: `2px solid ${theme.text}`, boxShadow: `3px 3px 0 ${theme.text}`, padding: '4px 12px' });
  else if (variant === 'glow') Object.assign(style, { backgroundColor: theme.accent, color: readableOn(theme.accent), boxShadow: `0 4px 14px -2px ${theme.accent}` });
  else Object.assign(style, { backgroundColor: theme.accent, color: readableOn(theme.accent) });
  return <span style={style}>Cotizar</span>;
}

const ANIMATION_ICONS: Record<SiteAnimation, ReactNode> = {
  none: <Ban className="size-5" />,
  fade: <Sun className="size-5" />,
  rise: <MoveUp className="size-5" />,
  zoom: <ZoomIn className="size-5" />,
  slide: <MoveRight className="size-5" />,
};

/** Tarjeta en miniatura con el estilo elegido y los colores del sitio. */
function CardSample({ variant, theme }: { variant: SiteCardStyle; theme: WebSiteTheme }) {
  const radius = Math.min(RADIUS_VALUES[theme.radius].px, 12);
  const style: CSSProperties = { borderRadius: radius, padding: 8, width: '70%', backgroundColor: `${theme.text}0a`, border: `1px solid ${theme.text}26` };
  if (variant === 'shadow') Object.assign(style, { border: '1px solid transparent', boxShadow: '0 6px 16px -8px rgb(0 0 0 / .45)', backgroundColor: theme.background });
  else if (variant === 'flat') Object.assign(style, { border: '1px solid transparent' });
  else if (variant === 'brutal') Object.assign(style, { border: `2px solid ${theme.text}`, boxShadow: `3px 3px 0 ${theme.text}`, backgroundColor: theme.background });
  else if (variant === 'glass') Object.assign(style, { backgroundColor: `${theme.text}12`, border: `1px solid ${theme.text}30` });
  return (
    <span className="block" style={style}>
      <span className="block h-1.5 w-2/3 rounded-full" style={{ backgroundColor: theme.text }} />
      <span className="mt-1 block h-1 w-full rounded-full opacity-40" style={{ backgroundColor: theme.text }} />
    </span>
  );
}

/** Página en miniatura con un estilo completo: sus colores, su letra y su botón. */
function KitThumb({ kit }: { kit: ThemeKit }) {
  const theme = { ...DEFAULT_KIT_BASE, ...kitTheme(kit) } as WebSiteTheme;
  const title = theme.headingFont === 'same' ? theme.font : theme.headingFont;
  return (
    <span className="block overflow-hidden rounded-md border border-border" style={{ backgroundColor: theme.background, color: theme.text }}>
      <span className="flex items-center justify-between px-2 py-1.5" style={{ backgroundColor: theme.primary }}>
        <span className="block h-1 w-6 rounded-full" style={{ backgroundColor: readableOn(theme.primary) }} />
        <span className="block h-1 w-8 rounded-full opacity-60" style={{ backgroundColor: readableOn(theme.primary) }} />
      </span>
      <span className="block space-y-1.5 px-2 py-2.5">
        <span className="block truncate text-base leading-tight" style={{ ...fontFamily(title), fontWeight: HEADING_WEIGHT_INFO[theme.headingWeight].value, textTransform: theme.headingCase === 'uppercase' ? 'uppercase' : 'none' }}>
          Tu negocio
        </span>
        <span className="block text-[11px] leading-snug opacity-75" style={fontFamily(theme.font)}>
          Así se lee el texto.
        </span>
        <ButtonSample variant={theme.buttonStyle} theme={theme} />
      </span>
    </span>
  );
}

const SPACING_GAP: Record<SiteSpacing, string> = { compact: 'gap-0.5', normal: 'gap-1.5', airy: 'gap-3' };

interface ThemePanelProps {
  theme: WebSiteTheme;
  onChange: (patch: Partial<WebSiteTheme>) => void;
  disabled: boolean;
}

const DEFAULT_KIT_BASE: Partial<WebSiteTheme> = { headingFont: 'same', headingCase: 'normal', headingWeight: 'bold', radius: 'soft' };

/** Apariencia del sitio: estilos completos, paletas, colores, tipografías, botones, tarjetas, bordes, espacio, ancho y animación (solo modo guiado). */
export function ThemePanel({ theme, onChange, disabled }: ThemePanelProps) {
  const problems = themeProblems(theme);
  const activePalette = THEME_PALETTES.find((palette) => (['primary', 'accent', 'background', 'text'] as const).every((key) => palette.colors[key].toLowerCase() === theme[key].toLowerCase()));
  const activePairing = FONT_PAIRINGS.find((pairing) => pairing.font === theme.font && pairing.headingFont === theme.headingFont);
  const headingFont = headingFontOf(theme);
  const currentKit = activeKit(theme);

  const textFonts = FONT_OPTIONS.filter((font) => !FONT_STACKS[font].headingOnly || font === theme.font);

  return (
    <div className={cn('space-y-6', SITE_FONT_CLASSES)}>
      {problems.length > 0 ? (
        <div role="status" className="space-y-1.5 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" /> Ojo con la legibilidad
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section title="Estilos completos" description="Un clic cambia todo el diseño: colores, tipografías, botones, tarjetas, espacio y animación, pensados para combinar. Tus textos y fotos no cambian. Después puedes ajustar cada detalle abajo.">
        <ChoiceGroup
          label="Elige un estilo"
          value={currentKit?.id ?? ''}
          disabled={disabled}
          onChange={(id) => {
            const kit = THEME_KITS.find((item) => item.id === id);
            if (kit) onChange(kitTheme(kit));
          }}
          options={THEME_KITS.map((kit) => ({ value: kit.id, label: kit.label, description: kit.description, preview: <KitThumb kit={kit} /> }))}
          hint={currentKit ? undefined : 'Tu diseño es personalizado: ningún estilo completo coincide exactamente.'}
        />
      </Section>

      <Section title="Paletas listas" description="Un clic cambia los cuatro colores del sitio. Todas están probadas para que el texto se lea bien; después puedes ajustarlas.">
        <ChoiceGroup
          label="Elige una paleta"
          value={activePalette?.id ?? ''}
          disabled={disabled}
          onChange={(id) => {
            const palette = THEME_PALETTES.find((item) => item.id === id);
            if (palette) onChange({ ...palette.colors });
          }}
          options={THEME_PALETTES.map((palette) => ({
            value: palette.id,
            label: palette.label,
            description: `Ideal para: ${palette.mood}`,
            preview: <PaletteThumb colors={palette.colors} />,
          }))}
          hint={activePalette ? undefined : 'Tus colores son personalizados: ninguna paleta coincide exactamente.'}
        />
      </Section>

      <Section title="Colores personalizados" description="Si ya tienes los colores de tu marca (los de tu logo), escríbelos aquí. Si no, quédate con una paleta lista.">
        <div className="grid gap-4 sm:grid-cols-2">
          {COLOR_FIELDS.map((field) => (
            <ColorField key={field.key} label={field.label} hint={field.hint} value={theme[field.key]} disabled={disabled} onChange={(hex) => onChange({ [field.key]: hex })} />
          ))}
        </div>
      </Section>

      <Section title="Combinaciones de tipografía" description="Un tipo de letra para los títulos y otro para el texto, que se ven bien juntos. Si dudas, elige “Moderna”.">
        <ChoiceGroup
          label="Elige una combinación"
          value={activePairing?.id ?? ''}
          disabled={disabled}
          onChange={(id) => {
            const pairing = FONT_PAIRINGS.find((item) => item.id === id);
            if (pairing) onChange({ font: pairing.font, headingFont: pairing.headingFont });
          }}
          options={FONT_PAIRINGS.map((pairing) => {
            const titleFont = pairing.headingFont === 'same' ? pairing.font : pairing.headingFont;
            return {
              value: pairing.id,
              label: pairing.label,
              description: pairing.headingFont === 'same' ? FONT_STACKS[pairing.font].label : `${FONT_STACKS[titleFont].label} + ${FONT_STACKS[pairing.font].label}`,
              preview: (
                <Stage theme={theme} className="flex-col items-start gap-0.5">
                  <span className="text-lg leading-tight font-semibold" style={fontFamily(titleFont)}>
                    Título de ejemplo
                  </span>
                  <span className="text-xs" style={fontFamily(pairing.font)}>
                    Texto de ejemplo para leer.
                  </span>
                </Stage>
              ),
            };
          })}
          hint={activePairing ? undefined : 'Elegiste las tipografías por separado (abajo): ninguna combinación coincide exactamente.'}
        />
      </Section>

      <Section title="Tipografías por separado" description="Para afinar: una tipografía para el texto corrido y otra para los títulos.">
        <ChoiceGroup
          label="Tipografía del texto"
          hint="Las que se ven bien en párrafos largos. Las de estilo llamativo (Playfair, Oswald…) quedan solo para títulos."
          value={theme.font}
          disabled={disabled}
          onChange={(font) => onChange({ font })}
          options={textFonts.map((font) => ({
            value: font,
            label: FONT_STACKS[font].label,
            description: FONT_STACKS[font].headingOnly ? 'Solo para títulos: elige otra para el texto.' : FONT_STACKS[font].description,
            preview: (
              <Stage theme={theme} className="flex-col gap-0.5">
                <span className="text-xl leading-none" style={fontFamily(font)}>
                  Aa
                </span>
                <span className="text-[11px]" style={fontFamily(font)}>
                  Texto de ejemplo
                </span>
              </Stage>
            ),
          }))}
        />
        <ChoiceGroup<SiteHeadingFont>
          label="Tipografía de los títulos"
          hint="“La misma del texto” es lo más seguro. Una distinta le da personalidad."
          value={theme.headingFont}
          disabled={disabled}
          onChange={(next) => onChange({ headingFont: next })}
          options={[
            {
              value: 'same',
              label: 'La misma del texto',
              description: 'Todo el sitio con una sola letra.',
              preview: (
                <Stage theme={theme} className="flex-col gap-0.5">
                  <span className="text-xl leading-none font-semibold" style={fontFamily(theme.font)}>
                    Aa
                  </span>
                  <span className="text-[11px]" style={fontFamily(theme.font)}>
                    Título de ejemplo
                  </span>
                </Stage>
              ),
            },
            ...FONT_OPTIONS.map((font) => ({
              value: font as SiteHeadingFont,
              label: FONT_STACKS[font].label,
              description: FONT_STACKS[font].description,
              preview: (
                <Stage theme={theme} className="flex-col gap-0.5">
                  <span className="text-xl leading-none font-semibold" style={fontFamily(font)}>
                    Aa
                  </span>
                  <span className="text-[11px] font-semibold" style={fontFamily(font)}>
                    Título de ejemplo
                  </span>
                </Stage>
              ),
            })),
          ]}
        />
      </Section>

      <Section title="Estilo de los botones" description="Así se verán “Cotizar”, “Reservar” y todos los botones del sitio, con tus colores.">
        <ChoiceGroup<SiteButtonStyle>
          label="Estilo"
          value={theme.buttonStyle}
          disabled={disabled}
          columns={4}
          onChange={(buttonStyle) => onChange({ buttonStyle })}
          options={BUTTON_STYLES.map((variant) => ({
            value: variant,
            label: BUTTON_STYLE_INFO[variant].label,
            description: BUTTON_STYLE_INFO[variant].description,
            preview: (
              <Stage theme={theme}>
                <ButtonSample variant={variant} theme={theme} />
              </Stage>
            ),
          }))}
        />
      </Section>

      <Section title="Tarjetas" description="Cómo se ven los recuadros de servicios, planes, testimonios y más.">
        <ChoiceGroup<SiteCardStyle>
          label="Estilo de las tarjetas"
          value={theme.cardStyle}
          disabled={disabled}
          onChange={(cardStyle) => onChange({ cardStyle })}
          options={CARD_STYLES.map((variant) => ({
            value: variant,
            label: CARD_STYLE_INFO[variant].label,
            description: CARD_STYLE_INFO[variant].description,
            preview: (
              <Stage theme={theme}>
                <CardSample variant={variant} theme={theme} />
              </Stage>
            ),
          }))}
        />
      </Section>

      <Section title="Títulos y bordes">
        <ChoiceGroup<SiteHeadingWeight>
          label="Grosor de los títulos"
          value={theme.headingWeight}
          disabled={disabled}
          columns={4}
          onChange={(headingWeight) => onChange({ headingWeight })}
          options={HEADING_WEIGHTS.map((weight) => ({
            value: weight,
            label: HEADING_WEIGHT_INFO[weight].label,
            description: HEADING_WEIGHT_INFO[weight].description,
            preview: (
              <Stage theme={theme}>
                <span className="text-lg leading-none" style={{ ...fontFamily(headingFont), fontWeight: HEADING_WEIGHT_INFO[weight].value }}>
                  Título
                </span>
              </Stage>
            ),
          }))}
        />
        <ChoiceGroup
          label="Títulos en mayúsculas"
          value={theme.headingCase}
          disabled={disabled}
          columns={2}
          onChange={(headingCase) => onChange({ headingCase })}
          options={[
            {
              value: 'normal',
              label: 'Normales',
              description: 'Más cercanos y fáciles de leer.',
              preview: (
                <Stage theme={theme}>
                  <span className="text-sm font-semibold" style={fontFamily(headingFont)}>
                    Nuestros servicios
                  </span>
                </Stage>
              ),
            },
            {
              value: 'uppercase',
              label: 'MAYÚSCULAS',
              description: 'Más formales; van bien con letras condensadas.',
              preview: (
                <Stage theme={theme}>
                  <span className="text-sm font-semibold tracking-wide uppercase" style={fontFamily(headingFont)}>
                    Nuestros servicios
                  </span>
                </Stage>
              ),
            },
          ]}
        />
        <ChoiceGroup<SiteRadius>
          label="Bordes de botones y tarjetas"
          value={theme.radius}
          disabled={disabled}
          onChange={(radius) => onChange({ radius })}
          options={RADIUS_OPTIONS.map((radius) => ({
            value: radius,
            label: RADIUS_VALUES[radius].label,
            description: radius === 'none' ? 'Esquinas rectas; serio y moderno.' : radius === 'soft' ? 'Esquinas apenas redondeadas; lo más usado.' : radius === 'medium' ? 'Redondeo marcado; moderno y amable.' : 'Muy redondeadas; amable y juvenil.',
            preview: (
              <Stage theme={theme} className="gap-2">
                <span className="block h-8 w-10 border-2" style={{ borderRadius: RADIUS_VALUES[radius].px, borderColor: theme.accent }} />
                <span className="block h-4 w-8" style={{ borderRadius: Math.min(RADIUS_VALUES[radius].px, 12), backgroundColor: theme.accent }} />
              </Stage>
            ),
          }))}
        />
      </Section>

      <Section title="Espacio y ancho">
        <ChoiceGroup<SiteSpacing>
          label="Espacio entre secciones"
          value={theme.spacing}
          disabled={disabled}
          onChange={(spacing) => onChange({ spacing })}
          options={SPACING_OPTIONS.map((spacing) => ({
            value: spacing,
            label: SPACING_INFO[spacing].label,
            description: SPACING_INFO[spacing].description,
            preview: (
              <Stage theme={theme} className={cn('flex-col', SPACING_GAP[spacing])}>
                <span className="block h-3 w-3/4 rounded-[3px] opacity-25" style={{ backgroundColor: theme.text }} />
                <span className="block h-3 w-3/4 rounded-[3px] opacity-25" style={{ backgroundColor: theme.text }} />
                <span className="block h-3 w-3/4 rounded-[3px] opacity-25" style={{ backgroundColor: theme.text }} />
              </Stage>
            ),
          }))}
        />
        <ChoiceGroup<SiteWidth>
          label="Ancho del contenido"
          value={theme.width}
          disabled={disabled}
          onChange={(width) => onChange({ width })}
          options={WIDTH_OPTIONS.map((width) => ({
            value: width,
            label: width === 'narrow' ? 'Angosto' : width === 'normal' ? 'Centrado' : 'Ancho',
            description: width === 'narrow' ? 'Como una revista: ideal para mucho texto.' : width === 'normal' ? 'Líneas más cortas: se lee más cómodo.' : 'Más espacio para fotos y tarjetas en pantallas grandes.',
            preview: (
              <Stage theme={theme}>
                <span className={cn('block h-8 rounded-[3px] opacity-25', width === 'narrow' ? 'w-1/2' : width === 'normal' ? 'w-2/3' : 'w-full')} style={{ backgroundColor: theme.text }} />
              </Stage>
            ),
          }))}
        />
      </Section>

      <Section title="Animación al bajar" description="Cómo aparecen las secciones cuando la persona baja por la página. Lo sutil suele verse más profesional.">
        <ChoiceGroup<SiteAnimation>
          label="Animación"
          value={theme.animation}
          disabled={disabled}
          columns={3}
          onChange={(animation) => onChange({ animation })}
          options={ANIMATION_OPTIONS.map((animation) => ({
            value: animation,
            label: ANIMATION_INFO[animation].label,
            description: ANIMATION_INFO[animation].description,
            preview: (
              <span className="grid h-14 place-items-center rounded-md border border-border bg-muted/50 text-accent-foreground">{ANIMATION_ICONS[animation]}</span>
            ),
          }))}
        />
      </Section>
    </div>
  );
}
