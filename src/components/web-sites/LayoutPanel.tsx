'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, MessageCircle, Megaphone, Menu, PanelBottom, PanelTop, Share2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  ANNOUNCEMENT_STYLES,
  autoMenuItems,
  FOOTER_LAYOUTS,
  FOOTER_STYLES,
  HEADER_LAYOUTS,
  HEADER_STYLES,
  publishedPages,
  siteMenu,
  type ActionBar,
  type FooterColumn,
  type MenuItem,
  type SiteDocument,
  type SiteFooter,
  type SiteHeader,
  type SiteSocial,
  type WhatsappButton,
} from '@/lib/web-sites/site';
import { safeHref, SOCIAL_LABELS, SOCIAL_NETWORKS, socialHref, whatsappHref, type SocialNetwork } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { ChoiceGroup, SwitchRow, TextField, type ChoiceOption } from './fields';
import { LinkField } from './LinkField';
import { FooterColumnsEditor, MENU_COMFORT_LIMIT, MenuItemsEditor } from './LinkListEditors';
import { AnnouncementDrawing, FooterDrawing, HeaderDrawing } from './layout-drawings';
import type { EditorTab } from './editor-shared';

type Announcement = SiteHeader['announcement'];
type FooterLayout = (typeof FOOTER_LAYOUTS)[number];
type FooterStyle = (typeof FOOTER_STYLES)[number];

/** Textos del botón destacado según lo que busca el negocio: un toque y ya está. */
const CTA_SUGGESTIONS: { label: string; whatsapp?: boolean }[] = [
  { label: 'Reservar mesa' },
  { label: 'Agendar hora' },
  { label: 'Cotizar por WhatsApp', whatsapp: true },
  { label: 'Consultar disponibilidad' },
  { label: 'Dona' },
];

const SOCIAL_PLACEHOLDERS: Record<SocialNetwork, string> = {
  instagram: '@minegocio',
  facebook: 'facebook.com/minegocio',
  tiktok: '@minegocio',
  youtube: '@minegocio',
  linkedin: 'linkedin.com/company/minegocio',
  x: '@minegocio',
};

const HEADER_LAYOUT_LABELS: Record<(typeof HEADER_LAYOUTS)[number], { label: string; description: string }> = {
  classic: { label: 'Clásico', description: 'Logo a la izquierda y menú a la derecha.' },
  centered: { label: 'Centrado', description: 'Logo al centro y el menú debajo.' },
  minimal: { label: 'Mínimo', description: 'Solo el logo y un botón ☰ que abre el menú.' },
  split: { label: 'Dividido', description: 'Menú a la izquierda, logo al centro y botón a la derecha.' },
};

const HEADER_STYLE_LABELS: Record<(typeof HEADER_STYLES)[number], { label: string; description: string }> = {
  light: { label: 'Claro', description: 'Del color del fondo de tu página.' },
  primary: { label: 'Color principal', description: 'Con el color de tu marca.' },
  transparent: { label: 'Transparente', description: 'Se ve sobre la portada.' },
  dark: { label: 'Oscuro', description: 'Fondo oscuro y letras claras.' },
  floating: { label: 'Flotante', description: 'Una barra redondeada que flota sobre la página.' },
};

const FOOTER_STYLE_LABELS: Record<FooterStyle, string> = { light: 'Claro', muted: 'Gris suave', dark: 'Oscuro', primary: 'Color principal' };
const ANNOUNCEMENT_STYLE_LABELS: Record<(typeof ANNOUNCEMENT_STYLES)[number], string> = { accent: 'Color de acento', primary: 'Color principal', dark: 'Oscuro' };

interface SectionProps {
  title: string;
  summary: ReactNode;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Bloque plegable del panel: título, un resumen de cómo está hoy y, abierto, sus controles. */
function Section({ title, summary, icon: Icon, open, onToggle, children }: SectionProps) {
  const id = useId();
  return (
    <section className="rounded-lg border border-border bg-card shadow-card">
      <h2>
        <button type="button" id={`${id}-button`} aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle} className="flex w-full items-center gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{title}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </h2>
      {open ? (
        <div id={`${id}-body`} role="region" aria-labelledby={`${id}-button`} className="space-y-4 border-t border-border p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Subtitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-0.5 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{children}</h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface LayoutPanelProps {
  doc: SiteDocument;
  /** Página que se está editando: los enlaces de "una sección de esta página" hablan de ella. */
  pageId: string;
  onDocumentChange: (updater: (previous: SiteDocument) => SiteDocument) => void;
  /** Mover la vista previa hasta arriba o abajo del sitio, según lo que se esté editando. */
  onFocusArea?: (area: 'top' | 'bottom') => void;
  onGoToTab: (tab: EditorTab) => void;
  disabled: boolean;
}

/** Pestaña "Encabezado y pie": barra superior, menú, pie, redes y botones de contacto. */
export function LayoutPanel({ doc, pageId, onDocumentChange, onFocusArea, onGoToTab, disabled }: LayoutPanelProps) {
  const confirm = useConfirm();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(['header']));
  const { header, footer, social, whatsapp, actionBar } = doc;

  const toggle = (id: string, area: 'top' | 'bottom') => {
    const isOpen = open.has(id);
    setOpen((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!isOpen) onFocusArea?.(area);
  };

  const setHeader = (patch: Partial<SiteHeader>) => onDocumentChange((previous) => ({ ...previous, header: { ...previous.header, ...patch } }));
  const setAnnouncement = (patch: Partial<Announcement>) => onDocumentChange((previous) => ({ ...previous, header: { ...previous.header, announcement: { ...previous.header.announcement, ...patch } } }));
  const setFooter = (patch: Partial<SiteFooter>) => onDocumentChange((previous) => ({ ...previous, footer: { ...previous.footer, ...patch } }));
  const setSocial = (network: SocialNetwork, value: string) => onDocumentChange((previous) => ({ ...previous, social: { ...previous.social, [network]: value } satisfies SiteSocial }));
  const setWhatsapp = (patch: Partial<WhatsappButton>) => onDocumentChange((previous) => ({ ...previous, whatsapp: { ...previous.whatsapp, ...patch } }));
  const setActionBar = (patch: Partial<ActionBar>) => onDocumentChange((previous) => ({ ...previous, actionBar: { ...previous.actionBar, ...patch } }));
  const updateMenu = (updater: (items: MenuItem[]) => MenuItem[]) => onDocumentChange((previous) => ({ ...previous, header: { ...previous.header, menu: updater(previous.header.menu) } }));
  const updateColumns = (updater: (columns: FooterColumn[]) => FooterColumn[]) => onDocumentChange((previous) => ({ ...previous, footer: { ...previous.footer, columns: updater(previous.footer.columns) } }));

  function setMenuMode(mode: 'auto' | 'custom') {
    onDocumentChange((previous) => {
      // La primera vez que se pasa a personalizado, el menú parte armado con las páginas: se ajusta, no se escribe de cero.
      if (mode === 'custom' && previous.header.menu.length === 0) return { ...previous, header: { ...previous.header, menuMode: mode, menu: autoMenuItems(previous) } };
      return { ...previous, header: { ...previous.header, menuMode: mode } };
    });
  }

  async function reloadMenu() {
    const ok = await confirm({
      title: '¿Rehacer el menú desde tus páginas?',
      description: 'Se reemplazan las opciones de tu menú personalizado (incluidos los submenús) por una opción por cada página que se muestra en el menú.',
      confirmLabel: 'Rehacer menú',
    });
    if (!ok) return;
    onDocumentChange((previous) => ({ ...previous, header: { ...previous.header, menu: autoMenuItems(previous) } }));
  }

  const autoItems = siteMenu({ ...doc, header: { ...header, menuMode: 'auto' } }, pageId);
  const multiPage = publishedPages(doc).length > 1;
  const whatsappValid = whatsappHref(whatsapp.number) !== null;
  const whatsappTyped = whatsapp.number.trim().length > 0;
  const whatsappError = whatsappTyped && !whatsappValid ? 'Escribe el número completo con el código de país, por ejemplo +56 9 1234 5678.' : whatsapp.enabled && !whatsappTyped ? 'Escribe tu número para que el botón funcione.' : null;
  const phoneValid = actionBar.phone.trim() !== '' && safeHref(`tel:${actionBar.phone.trim()}`) !== null;
  const phoneError = actionBar.phone.trim() !== '' && !phoneValid ? 'Escribe el teléfono con su código, por ejemplo +56 2 2345 6789.' : null;
  const barActions = [phoneValid ? 'Llamar' : null, whatsappValid ? 'WhatsApp' : null, actionBar.address.trim().length >= 3 ? 'Cómo llegar' : null].filter((label): label is string => label !== null);
  const configuredNetworks = SOCIAL_NETWORKS.filter((network) => social[network].trim() !== '');

  const layoutOptions: ChoiceOption<SiteHeader['layout']>[] = HEADER_LAYOUTS.map((value) => ({ value, ...HEADER_LAYOUT_LABELS[value], preview: <HeaderDrawing layout={value} style={header.style} /> }));
  const styleOptions: ChoiceOption<SiteHeader['style']>[] = HEADER_STYLES.map((value) => ({ value, ...HEADER_STYLE_LABELS[value], preview: <HeaderDrawing layout={header.layout} style={value} /> }));
  const footerLayoutOptions: ChoiceOption<FooterLayout>[] = [
    { value: 'simple', label: 'Simple', description: 'Una línea con tu leyenda y, si quieres, el menú y las redes.', preview: <FooterDrawing layout="simple" style={footer.style} /> },
    { value: 'columns', label: 'En columnas', description: 'Descripción, columnas de enlaces y redes.', preview: <FooterDrawing layout="columns" style={footer.style} /> },
    { value: 'centered', label: 'Centrado', description: 'Logo, descripción, menú y redes, todo al centro.', preview: <FooterDrawing layout="centered" style={footer.style} /> },
    { value: 'big', label: 'Nombre gigante', description: 'En columnas y con tu nombre enorme al final.', preview: <FooterDrawing layout="big" style={footer.style} /> },
  ];
  const footerStyleOptions: ChoiceOption<FooterStyle>[] = FOOTER_STYLES.map((value) => ({ value, label: FOOTER_STYLE_LABELS[value], preview: <FooterDrawing layout={footer.layout} style={value} /> }));

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------------------------ Encabezado */}
      <Section
        title="Encabezado"
        icon={PanelTop}
        open={open.has('header')}
        onToggle={() => toggle('header', 'top')}
        summary={header.enabled ? `${HEADER_LAYOUT_LABELS[header.layout].label} · ${HEADER_STYLE_LABELS[header.style].label.toLowerCase()}${header.ctaLabel.trim() ? ` · botón «${header.ctaLabel.trim()}»` : ''}` : 'Apagado'}
      >
        <SwitchRow label="Mostrar el encabezado" description="La barra de arriba con tu logo y tu menú. Sin ella, nadie puede moverse entre tus páginas." checked={header.enabled} disabled={disabled} onChange={(checked) => setHeader({ enabled: checked })} />
        {!header.enabled && multiPage ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Tu sitio tiene varias páginas y el encabezado está apagado: quien lo visite no verá el menú. Actívalo, o al menos deja el menú en el pie.</p> : null}

        {header.enabled ? (
          <>
            <ChoiceGroup label="Diseño" value={header.layout} options={layoutOptions} onChange={(value) => setHeader({ layout: value })} disabled={disabled} />
            <ChoiceGroup label="Estilo" value={header.style} options={styleOptions} onChange={(value) => setHeader({ style: value })} disabled={disabled} />
            <div className="grid gap-2 sm:grid-cols-2">
              <SwitchRow label="Fijo arriba" description="Se queda a la vista cuando la persona baja por la página." checked={header.sticky} disabled={disabled} onChange={(checked) => setHeader({ sticky: checked })} />
              <SwitchRow label="Mostrar redes sociales" description="Los íconos de tus redes junto al menú." checked={header.showSocial} disabled={disabled} onChange={(checked) => setHeader({ showSocial: checked })} />
              <SwitchRow label="Mostrar el logo" description="Súbelo en la pestaña «Ajustes»." checked={header.showLogo} disabled={disabled} onChange={(checked) => setHeader({ showLogo: checked })} />
              <SwitchRow label="Mostrar el nombre del negocio" description="Escrito junto al logo." checked={header.showName} disabled={disabled} onChange={(checked) => setHeader({ showName: checked })} />
            </div>

            <TextField
              label="Texto del encabezado"
              value={header.tagline}
              max={80}
              disabled={disabled}
              placeholder="Ej.: Repostería artesanal en Ñuñoa"
              hint="Una frase corta bajo el nombre: qué haces o dónde estás. Es lo primero que lee quien llega."
              onChange={(value) => setHeader({ tagline: value })}
            />

            <Subtitle hint="Es el botón más importante del sitio: lleva a lo que quieres que la gente haga primero.">Botón destacado</Subtitle>
            <div className="space-y-2">
              <TextField label="Texto del botón" value={header.ctaLabel} max={30} disabled={disabled} placeholder="Ej.: Agendar hora" onChange={(value) => setHeader({ ctaLabel: value })} />
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ideas para el texto del botón">
                <span className="text-xs text-muted-foreground">Ideas:</span>
                {CTA_SUGGESTIONS.map((idea) => (
                  <Button
                    key={idea.label}
                    type="button"
                    variant={header.ctaLabel === idea.label ? 'secondary' : 'outline'}
                    size="xs"
                    disabled={disabled}
                    onClick={() => {
                      const link = idea.whatsapp && !header.ctaHref.trim() ? whatsappHref(whatsapp.number, whatsapp.message || undefined) : null;
                      setHeader({ ctaLabel: idea.label, ...(link ? { ctaHref: link } : {}) });
                    }}
                  >
                    {idea.label}
                  </Button>
                ))}
              </div>
            </div>
            <LinkField label="¿A dónde lleva el botón?" value={header.ctaHref} onChange={(value) => setHeader({ ctaHref: value })} document={doc} pageId={pageId} disabled={disabled} newTab={{ checked: header.ctaNewTab, onChange: (checked) => setHeader({ ctaNewTab: checked }) }} />
            {header.ctaHref.trim() && !header.ctaLabel.trim() ? <p className="text-xs font-medium text-warning">El botón tiene enlace pero no tiene texto: escríbelo arriba.</p> : null}

            <Subtitle hint="Una franja delgada sobre el encabezado para avisar promociones o novedades.">Barra de anuncio</Subtitle>
            <SwitchRow label="Mostrar barra de anuncio" checked={header.announcement.enabled} disabled={disabled} onChange={(checked) => setAnnouncement({ enabled: checked })} />
            {header.announcement.enabled ? (
              <div className="space-y-3">
                <TextField
                  label="Texto del anuncio"
                  value={header.announcement.text}
                  max={140}
                  disabled={disabled}
                  placeholder="Ej.: Despacho gratis sobre $30.000"
                  hint="Lo ideal es que tenga menos de 60 caracteres: se lee de un vistazo, también en el celular."
                  warning={header.announcement.text.trim().length > 60 ? 'Es largo: en el celular se puede cortar. Lo ideal son 60 caracteres o menos.' : null}
                  onChange={(value) => setAnnouncement({ text: value })}
                />
                <TextField label="Texto del enlace (opcional)" value={header.announcement.linkLabel} max={30} disabled={disabled} placeholder="Ej.: Ver más" onChange={(value) => setAnnouncement({ linkLabel: value })} />
                <LinkField label="¿A dónde lleva el anuncio? (opcional)" value={header.announcement.href} onChange={(value) => setAnnouncement({ href: value })} document={doc} pageId={pageId} disabled={disabled} />
                <ChoiceGroup
                  label="Color de la barra"
                  value={header.announcement.style}
                  options={ANNOUNCEMENT_STYLES.map((value) => ({ value, label: ANNOUNCEMENT_STYLE_LABELS[value], preview: <AnnouncementDrawing style={value} /> }))}
                  onChange={(value) => setAnnouncement({ style: value })}
                  disabled={disabled}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </Section>

      {/* ------------------------------------------------------------------ Menú */}
      <Section title="Menú" icon={Menu} open={open.has('menu')} onToggle={() => toggle('menu', 'top')} summary={header.menuMode === 'auto' ? `Automático · ${autoItems.length} ${autoItems.length === 1 ? 'opción' : 'opciones'}` : `Personalizado · ${header.menu.length} ${header.menu.length === 1 ? 'opción' : 'opciones'}`}>
        {!header.enabled ? (
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            El menú vive en el encabezado, que está apagado.
            <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => setHeader({ enabled: true })}>
              Activar el encabezado
            </Button>
          </p>
        ) : null}
        <ChoiceGroup
          label="¿Cómo se arma tu menú?"
          columns={2}
          value={header.menuMode}
          disabled={disabled}
          onChange={setMenuMode}
          options={[
            { value: 'auto', label: 'Automático (se arma con tus páginas)', description: 'Si agregas, quitas u ordenas páginas, el menú se actualiza solo.' },
            { value: 'custom', label: 'Personalizado', description: 'Tú eliges qué opciones hay, en qué orden y a dónde lleva cada una. Permite submenús.' },
          ]}
        />

        {header.menuMode === 'auto' ? (
          <div className="space-y-3">
            {autoItems.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Así se ve tu menú ahora</p>
                <ul className="flex flex-wrap gap-1.5">
                  {autoItems.map((item) => (
                    <li key={item.key}>
                      <StatusBadge tone="neutral" className="px-3 py-1 text-sm font-medium">
                        {item.label}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay nada para mostrar en el menú. Agrega páginas, o ponles título a las secciones de tu página de inicio.</p>
            )}
            {autoItems.length > MENU_COMFORT_LIMIT ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Tu menú tiene {autoItems.length} opciones. Con {MENU_COMFORT_LIMIT} o menos se lee mejor en el celular. Puedes sacar páginas del menú o pasar a «Personalizado» y agrupar en submenús.</p> : null}
            <p className="text-xs text-muted-foreground">
              {multiPage ? 'El menú lleva a cada página que se muestra en él.' : 'Como tu sitio tiene una sola página, el menú baja a sus secciones con título.'} Para sacar una página del menú, apaga «Mostrar en el menú» en la pestaña{' '}
              <button type="button" onClick={() => onGoToTab('pages')} className="rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Páginas
              </button>
              .
            </p>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">¿Necesitas submenús?</span> Pasa a «Personalizado». Ejemplo: «Servicios ▸ Remodelaciones, Gasfitería»: al pasar el mouse por «Servicios» se despliegan las dos opciones.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Ejemplo de submenú:</span> «Servicios ▸ Remodelaciones, Gasfitería». Al pasar el mouse por «Servicios» (o tocarlo, en el celular) se despliegan las dos opciones. Cada opción puede llevar a una página, a una sección o a otro sitio. Si vuelves a «Automático», tu menú personalizado se guarda por si lo quieres después.
            </p>
            <MenuItemsEditor doc={doc} pageId={pageId} items={header.menu} onChange={updateMenu} disabled={disabled} />
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void reloadMenu()}>
              Rehacer el menú desde mis páginas
            </Button>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ Pie */}
      <Section title="Pie de página" icon={PanelBottom} open={open.has('footer')} onToggle={() => toggle('footer', 'bottom')} summary={footer.enabled ? `${footerLayoutOptions.find((option) => option.value === footer.layout)?.label ?? 'Simple'} · ${FOOTER_STYLE_LABELS[footer.style].toLowerCase()}` : 'Apagado'}>
        <SwitchRow label="Mostrar el pie de página" description="La zona de abajo, con tus datos, enlaces y redes." checked={footer.enabled} disabled={disabled} onChange={(checked) => setFooter({ enabled: checked })} />
        {footer.enabled ? (
          <>
            <ChoiceGroup label="Diseño" columns={2} value={footer.layout} options={footerLayoutOptions} onChange={(value) => setFooter({ layout: value })} disabled={disabled} />
            <ChoiceGroup label="Estilo" columns={4} value={footer.style} options={footerStyleOptions} onChange={(value) => setFooter({ style: value })} disabled={disabled} />

            {footer.layout !== 'simple' ? (
              <>
                <TextField
                  label="Descripción breve"
                  value={footer.about}
                  max={300}
                  multiline
                  rows={3}
                  disabled={disabled}
                  placeholder="Ej.: Somos una pastelería familiar de Ñuñoa. Hacemos tortas y postres por encargo desde 2015."
                  hint="Aparece junto a tu logo: cuenta en dos frases quién eres."
                  onChange={(value) => setFooter({ about: value })}
                />
                {footer.layout !== 'centered' ? (
                  <>
                    <Subtitle hint="Agrupa enlaces por tema, por ejemplo «Empresa» (Nosotros, Contacto) y «Ayuda» (Preguntas frecuentes).">Columnas de enlaces</Subtitle>
                    <FooterColumnsEditor doc={doc} pageId={pageId} columns={footer.columns} onChange={updateColumns} disabled={disabled} />
                  </>
                ) : null}
              </>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <SwitchRow label="Repetir el menú" description="Los mismos enlaces del menú principal, también abajo." checked={footer.showMenu} disabled={disabled} onChange={(checked) => setFooter({ showMenu: checked })} />
              <SwitchRow label="Mostrar redes sociales" description="Los íconos de tus redes en el pie." checked={footer.showSocial} disabled={disabled} onChange={(checked) => setFooter({ showSocial: checked })} />
            </div>

            <TextField
              label="Leyenda final"
              value={footer.text}
              max={200}
              disabled={disabled}
              placeholder="© 2026 Mi Empresa SpA · Santiago"
              hint="Derechos, razón social o ciudad. Si la dejas vacía, se usa «© año» y el nombre de tu negocio."
              onChange={(value) => setFooter({ text: value })}
            />
          </>
        ) : null}
      </Section>

      {/* ------------------------------------------------------------------ Redes */}
      <Section title="Redes sociales" icon={Share2} open={open.has('social')} onToggle={() => toggle('social', 'top')} summary={configuredNetworks.length > 0 ? configuredNetworks.map((network) => SOCIAL_LABELS[network]).join(' · ') : 'Ninguna todavía'}>
        <p className="text-sm text-muted-foreground">Escribe solo las redes que uses. Puedes poner tu @usuario o pegar la dirección de tu perfil. Aparecen en el pie y, si lo activas arriba, también en el encabezado.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((network) => {
            const value = social[network];
            const href = value.trim() ? socialHref(network, value) : null;
            const invalid = value.trim() !== '' && href === null;
            return (
              <TextField
                key={network}
                label={SOCIAL_LABELS[network]}
                value={value}
                max={200}
                disabled={disabled}
                placeholder={SOCIAL_PLACEHOLDERS[network]}
                autoComplete="off"
                error={invalid ? `No reconocemos ese perfil de ${SOCIAL_LABELS[network]}. Escribe tu @usuario o pega la dirección de tu perfil.` : null}
                hint={href ? `Se abrirá ${href.replace(/^https?:\/\//, '')}` : undefined}
                onChange={(next) => setSocial(network, next)}
              />
            );
          })}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ WhatsApp y llamadas */}
      <Section
        title="WhatsApp y llamadas"
        icon={MessageCircle}
        open={open.has('contact')}
        onToggle={() => toggle('contact', 'top')}
        summary={[whatsapp.enabled ? 'Botón flotante' : null, actionBar.enabled ? 'Barra en el celular' : null].filter(Boolean).join(' · ') || 'Apagado'}
      >
        <Subtitle hint="Con un número, tus clientes te escriben con un toque, desde cualquier página.">Tu WhatsApp</Subtitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Número de WhatsApp" type="tel" value={whatsapp.number} max={40} disabled={disabled} placeholder="+56 9 1234 5678" autoComplete="tel" error={whatsappError} onChange={(value) => setWhatsapp({ number: value })} />
          <TextField label="Mensaje inicial (opcional)" value={whatsapp.message} max={200} disabled={disabled} placeholder="Hola, quiero cotizar…" hint="Es el texto que aparece escrito cuando se abre la conversación." onChange={(value) => setWhatsapp({ message: value })} />
        </div>

        <SwitchRow label="Botón flotante de WhatsApp" description="Un botón en la esquina de todas las páginas, siempre a la vista." checked={whatsapp.enabled} disabled={disabled} onChange={(checked) => setWhatsapp({ enabled: checked })} />
        {whatsapp.enabled ? <TextField label="Texto junto al ícono (opcional)" value={whatsapp.label} max={30} disabled={disabled} placeholder="Ej.: Escríbenos" hint="Si lo dejas vacío, se ve solo el ícono." onChange={(value) => setWhatsapp({ label: value })} /> : null}

        <Subtitle>Barra de acciones en el celular</Subtitle>
        <SwitchRow
          label="Mostrar la barra fija en el celular"
          description="Una barra pegada abajo con «Llamar», «WhatsApp» y «Cómo llegar». Ideal si te llaman por urgencias (gasfíter, veterinaria, taller)."
          checked={actionBar.enabled}
          disabled={disabled}
          onChange={(checked) => setActionBar({ enabled: checked })}
        />
        {actionBar.enabled ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Teléfono para llamar" type="tel" value={actionBar.phone} max={40} disabled={disabled} placeholder="+56 2 2345 6789" autoComplete="tel" error={phoneError} onChange={(value) => setActionBar({ phone: value })} />
              <TextField label="Dirección para «Cómo llegar»" value={actionBar.address} max={200} disabled={disabled} placeholder="Ej.: Av. Providencia 1234, Santiago" hint="Abre Google Maps en el celular." onChange={(value) => setActionBar({ address: value })} />
            </div>
            {barActions.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                En la barra saldrán: <span className="font-medium text-foreground">{barActions.join(' · ')}</span>.
                {!whatsappValid ? ' WhatsApp aparecerá cuando escribas tu número arriba.' : ''}
              </p>
            ) : (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">La barra todavía no tiene ninguna acción. Escribe un teléfono, una dirección o tu número de WhatsApp.</p>
            )}
          </div>
        ) : null}
      </Section>

      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Megaphone className="size-3.5 shrink-0" aria-hidden="true" /> Los cambios se ven al instante en la vista previa. Puedes deshacerlos con Ctrl+Z.
      </p>
    </div>
  );
}
