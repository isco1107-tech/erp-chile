'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Lightbulb, RefreshCw, RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChoiceGroup, SwitchRow, TextField } from '@/components/web-sites/fields';
import { BlockFields } from '@/components/web-sites/BlockEditor';
import { CanvasEditor } from '@/components/web-sites/CanvasEditor';
import { LayoutPicker } from '@/components/web-sites/LayoutPicker';
import { SectionStyleFields } from '@/components/web-sites/SectionStyleFields';
import { ThemePanel } from '@/components/web-sites/ThemePanel';
import { DIRECTOR_TITLES, directorCopy } from '@/lib/events/pageant-site';
import type { PageantSiteDesign } from '@/lib/events/pageant-site-design';
import {
  PAGEANT_SECTION_INFO,
  SECTION_SPACING_LABELS,
  patchSectionSettings,
  SECTION_TONE_LABELS,
  sectionSettings,
  tonesFor,
  type PageantSectionId,
  type SectionSettings,
  type SectionSpacing,
  type SectionTone,
} from '@/lib/events/pageant-layout';
import { BLOCK_INFO, type BlockStyle, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { documentFromBlocks, homeOf } from '@/lib/web-sites/site';
import { sampleTextCount } from '@/lib/events/pageant-design-ops';
import { PUBLIC_ACCENT_LABELS, PUBLIC_ACCENT_SWATCH, PUBLIC_ACCENTS } from '@/modules/projects/schema';
import { cn } from '@/lib/utils';
import { FooterPartnersEditor, type FooterPartnersDraft } from '../FooterPartnersEditor';
import { PageantFooterFields } from '../PageantFooterFields';
import { PalettePicker } from '../PalettePicker';
import { TypographyPicker } from '../TypographyPicker';
import { paletteAfterNewCover, type PageantPalette } from '@/lib/events/pageant-palette';
import type { SiteEditorState, SiteFormValues } from './site-draft';

export type UploadPurpose = 'cover' | 'director' | 'favicon';

export interface PanelApi {
  state: SiteEditorState;
  readOnly: boolean;
  projectId: string;
  projectName: string;
  /** Cambia el diseño (orden, ajustes por sección, estudio). `boundary`: paso propio del historial. */
  changeDesign: (fn: (design: PageantSiteDesign) => PageantSiteDesign, boundary?: boolean) => void;
  /** Cambia campos del certamen (frase, textos, interruptores…). */
  changeValues: (patch: Partial<SiteFormValues>, boundary?: boolean) => void;
  changePartners: (partners: FooterPartnersDraft) => void;
  changeHighlights: (text: string) => void;
  upload: (file: File, purpose: UploadPurpose, options?: { onPalette?: (palette: PageantPalette | null) => void }) => Promise<string | null>;
  reloadCanvas: () => void;
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Texto propio de una sección: vacío = el automático (se ve como ejemplo),
 * escrito = el propio, «Quitar» = sin texto. Las tres cosas se distinguen.
 */
function OverrideField({
  label,
  value,
  automatic,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  automatic: string;
  max: number;
  disabled: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const none = value === '';
  const custom = typeof value === 'string' && value !== '';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-1">
          {none && <StatusBadge tone="neutral">Sin texto</StatusBadge>}
          {(custom || none) && (
            <Button type="button" variant="ghost" size="xs" disabled={disabled} onClick={() => onChange(undefined)} title="Volver al texto automático">
              <RotateCcw aria-hidden="true" />
              Automático
            </Button>
          )}
          {!none && (
            <Button type="button" variant="ghost" size="xs" disabled={disabled} onClick={() => onChange('')} title="Que no se muestre este texto">
              Quitar
            </Button>
          )}
        </span>
      </div>
      <input
        aria-label={label}
        className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        value={custom ? value : ''}
        maxLength={max}
        disabled={disabled}
        placeholder={none ? 'Sin texto' : automatic}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
    </div>
  );
}

function ImageField({ label, url, hint, disabled, onUpload, onClear, round = false }: { label: string; url: string; hint: string; disabled: boolean; onUpload: (file: File) => Promise<void>; onClear: () => void; round?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className={cn('size-16 shrink-0 overflow-hidden border border-border bg-muted', round ? 'rounded-full' : 'rounded-md')}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-[10px] text-muted-foreground">Sin imagen</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                await onUpload(file);
              } finally {
                setBusy(false);
                if (fileRef.current) fileRef.current.value = '';
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus aria-hidden="true" />
            {busy ? 'Subiendo…' : url ? 'Cambiar' : 'Subir'}
          </Button>
          {url && (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onClear}>
              Quitar
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ── Secciones propias ────────────────────────────────────────────────────────

export function SectionPanel({ id, api, rendered }: { id: PageantSectionId; api: PanelApi; rendered: boolean | null }) {
  const { state, readOnly } = api;
  const { values } = state;
  const design = values.publicSiteDesign;
  const info = PAGEANT_SECTION_INFO[id];
  const raw = design.sections?.[id] ?? {};
  const resolved = sectionSettings(design.sections, id);
  const set = (patch: Partial<SectionSettings>, boundary = false) =>
    api.changeDesign((current) => ({ ...current, sections: patchSectionSettings(current.sections, id, patch) }), boundary);
  const tones = tonesFor(id);
  const toneValue: SectionTone = raw.tone && tones.includes(raw.tone as Exclude<SectionTone, 'auto'>) ? raw.tone : 'auto';
  const options = design.options;
  const setOption = (patch: Partial<PageantSiteDesign['options']>) => api.changeDesign((current) => ({ ...current, options: { ...current.options, ...patch } }), true);
  const copy = directorCopy(values.directorTitle);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sección del certamen</p>
        <h2 className="text-lg font-semibold">{info.label}</h2>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </div>
      {rendered === false && !resolved.hidden && <Note>No se ve todavía: {info.appearsWhen}</Note>}

      <SwitchRow label="Mostrar en el sitio" description="Oculta, conserva todo y vuelve a aparecer al encenderla." checked={!resolved.hidden} disabled={readOnly} onChange={(show) => set({ hidden: !show }, true)} />

      {info.heading && (
        <Group title="Textos" hint="Vacío = el texto automático (se ve de ejemplo). También puedes hacer doble clic sobre el texto en la vista previa.">
          <OverrideField label={id === 'inicio' ? 'Etiqueta sobre el nombre' : 'Etiqueta'} value={raw.kicker} automatic={info.defaults.kicker ?? 'Automática según los datos'} max={60} disabled={readOnly} onChange={(kicker) => set({ kicker })} />
          <OverrideField
            label={id === 'inicio' ? 'Llamado bajo el nombre' : 'Título'}
            value={raw.title}
            automatic={id === 'inicio' ? 'Automático según la vista' : id === 'director' ? copy.lead : (info.defaults.lead ?? (id === 'certamen' ? api.projectName : 'Automático según los datos'))}
            max={120}
            disabled={readOnly}
            onChange={(title) => set({ title })}
          />
          {id !== 'inicio' && (
            <OverrideField
              label="Palabras en cursiva del título"
              value={raw.titleAccent}
              automatic={id === 'director' ? copy.word : (info.defaults.accent ?? 'Automáticas según los datos')}
              max={80}
              disabled={readOnly}
              onChange={(titleAccent) => set({ titleAccent })}
            />
          )}
          {id !== 'inicio' && (
            <TextField label="Nombre en el menú" value={raw.navLabel ?? ''} max={30} placeholder={info.label} disabled={readOnly} onChange={(navLabel) => set({ navLabel: navLabel || undefined })} />
          )}
        </Group>
      )}

      <SectionContent id={id} api={api} setOption={setOption} options={options} />

      {tones.length > 0 && (
        <Group title="Apariencia">
          <ChoiceGroup<SectionTone>
            label="Fondo"
            value={toneValue}
            columns={3}
            onChange={(tone) => set({ tone: tone === 'auto' ? undefined : tone }, true)}
            disabled={readOnly}
            options={[{ value: 'auto', label: 'De fábrica', description: SECTION_TONE_LABELS[info.defaultTone!] }, ...tones.map((tone) => ({ value: tone as SectionTone, label: SECTION_TONE_LABELS[tone] }))]}
          />
          <ChoiceGroup<SectionSpacing>
            label="Espacio arriba y abajo"
            value={raw.spacing ?? 'auto'}
            columns={3}
            onChange={(spacing) => set({ spacing: spacing === 'auto' ? undefined : spacing }, true)}
            disabled={readOnly}
            options={(['auto', 'compact', 'airy'] as const).map((spacing) => ({ value: spacing, label: SECTION_SPACING_LABELS[spacing] }))}
          />
        </Group>
      )}
    </div>
  );
}

function SectionContent({ id, api, setOption, options }: { id: PageantSectionId; api: PanelApi; setOption: (patch: Partial<PageantSiteDesign['options']>) => void; options: PageantSiteDesign['options'] }) {
  const { state, readOnly } = api;
  const { values } = state;
  const uploadTo = (purpose: UploadPurpose, field: 'coverImageUrl' | 'directorPhotoUrl') => async (file: File) => {
    // La portada trae sus tres colores: pintan el sitio salvo que la persona ya los haya ajustado a mano.
    let detected: PageantPalette | null = null;
    const url = await api.upload(file, purpose, purpose === 'cover' ? { onPalette: (palette) => (detected = palette) } : undefined);
    if (url) {
      const { palette, applied } = paletteAfterNewCover(values.publicPalette, detected);
      api.changeValues({ [field]: url, ...(purpose === 'cover' ? { publicPalette: palette } : {}) } as Partial<SiteFormValues>, true);
      toast.success(applied ? 'Portada cargada y colores del sitio detectados: guarda para publicarlos' : 'Imagen cargada: guarda para publicarla');
    }
  };

  switch (id) {
    case 'inicio':
      return (
        <Group title="Contenido">
          <ImageField label="Imagen de portada" url={values.coverImageUrl} hint="Horizontal, de al menos 1600 × 900 px (JPG o PNG, hasta 6 MB)." disabled={readOnly} onUpload={uploadTo('cover', 'coverImageUrl')} onClear={() => api.changeValues({ coverImageUrl: '' }, true)} />
          <TextField label="Frase principal" value={values.publicTagline} max={160} placeholder="La belleza con propósito vuelve a la ciudad" disabled={readOnly} onChange={(publicTagline) => api.changeValues({ publicTagline })} />
          <SwitchRow label="Cuenta regresiva a la gala" checked={options.countdown} disabled={readOnly} onChange={(countdown) => setOption({ countdown })} />
          <SwitchRow label="Datos clave (cupos, fechas, paquetes)" checked={options.pills} disabled={readOnly} onChange={(pills) => setOption({ pills })} />
          <SwitchRow label="Cinta animada bajo la portada" checked={options.ribbon} disabled={readOnly} onChange={(ribbon) => setOption({ ribbon })} />
        </Group>
      );
    case 'certamen':
      return (
        <Group title="Contenido">
          <TextField
            label="Sobre el certamen"
            value={values.publicDescription}
            max={4000}
            multiline
            rows={9}
            disabled={readOnly}
            placeholder="Historia del certamen, qué se busca en una reina, causa social, premios…"
            hint="Deja una línea en blanco para empezar otro párrafo. El primero va destacado y con letra capital."
            onChange={(publicDescription) => api.changeValues({ publicDescription })}
          />
        </Group>
      );
    case 'candidatas':
      return (
        <Group title="Contenido">
          <SwitchRow label="Galería de candidatas" description="Solo oficiales, finalistas y ganadora, con nombre artístico, número, a quién representan, foto y la bio pública." checked={values.showCandidatesPublic} disabled={readOnly} onChange={(showCandidatesPublic) => api.changeValues({ showCandidatesPublic }, true)} />
          <Note>Quiénes aparecen y su presentación se deciden en el Tablero de casting.</Note>
        </Group>
      );
    case 'votacion':
      return (
        <Group title="Contenido">
          <SwitchRow label="Ranking de votación del público" description="Muestra los votos pagados por candidata en vivo." checked={values.showVoteRankingPublic} disabled={readOnly} onChange={(showVoteRankingPublic) => api.changeValues({ showVoteRankingPublic }, true)} />
        </Group>
      );
    case 'resultados':
      return (
        <Group title="Contenido">
          <SwitchRow label="Resultados oficiales" description="Revela ganadora, finalistas y podio cuando la ronda final esté completada. Actívalo al coronar." checked={values.showResultsPublic} disabled={readOnly} onChange={(showResultsPublic) => api.changeValues({ showResultsPublic }, true)} />
        </Group>
      );
    case 'auspicios':
      return (
        <Group title="Contenido">
          <SwitchRow label="Muro de auspiciadores" description="Marcas con contrato confirmado, agrupadas por nivel." checked={values.showSponsorsPublic} disabled={readOnly} onChange={(showSponsorsPublic) => api.changeValues({ showSponsorsPublic }, true)} />
          <SwitchRow label="Vista y formulario «Ser sponsor»" description="Cada solicitud entra como prospecto (con CRM) o llega por correo." checked={values.sponsorLeadFormEnabled} disabled={readOnly} onChange={(sponsorLeadFormEnabled) => api.changeValues({ sponsorLeadFormEnabled }, true)} />
          <TextField label="Nota para sponsors" value={values.sponsorExclusivityNote} max={800} multiline disabled={readOnly} hint="Se muestra bajo los paquetes, como «Exclusividad por categoría». Vacía = no aparece." onChange={(sponsorExclusivityNote) => api.changeValues({ sponsorExclusivityNote })} />
          <Note>Los paquetes y sus precios salen del tarifario de auspicios (solo los marcados como públicos).</Note>
        </Group>
      );
    case 'director':
      return (
        <Group title="Contenido" hint="Sin nombre, la sección no se muestra.">
          <ImageField label="Foto" url={values.directorPhotoUrl} hint="Vertical u horizontal, JPG o PNG." round disabled={readOnly} onUpload={uploadTo('director', 'directorPhotoUrl')} onClear={() => api.changeValues({ directorPhotoUrl: '' }, true)} />
          <ChoiceGroup label="Se muestra como" value={values.directorTitle} columns={2} disabled={readOnly} onChange={(directorTitle) => api.changeValues({ directorTitle }, true)} options={DIRECTOR_TITLES.map((title) => ({ value: title, label: title }))} />
          <TextField label="Nombre" value={values.directorName} max={120} disabled={readOnly} placeholder="Constanza Rey Ortiz" onChange={(directorName) => api.changeValues({ directorName })} />
          <TextField label="Cargo o empresas" value={values.directorRole} max={160} disabled={readOnly} onChange={(directorRole) => api.changeValues({ directorRole })} />
          <TextField label="Presentación" value={values.directorBio} max={1500} multiline rows={5} disabled={readOnly} onChange={(directorBio) => api.changeValues({ directorBio })} />
          <TextField label="Trayectoria (un logro por línea)" value={state.highlightsText} multiline rows={6} disabled={readOnly} onChange={api.changeHighlights} />
        </Group>
      );
    case 'ganadoras':
      return (
        <Group title="Contenido">
          <Note>Las ganadoras (foto, nombre, título y año) se cargan en «Salón de la fama», debajo del formulario del sitio.</Note>
          <Button type="button" size="sm" variant="outline" onClick={api.reloadCanvas}>
            <RefreshCw aria-hidden="true" />
            Recargar la vista previa
          </Button>
        </Group>
      );
    case 'postula':
      return <Note>El proceso, los cupos, los beneficios y el formulario salen de la convocatoria del certamen. Cuando la convocatoria no está abierta, el título muestra el aviso automático (abrirá pronto o ya cerró).</Note>;
    case 'camino':
      return <Note>Las etapas y cuál va «Ahora» se calculan solas con la convocatoria, las candidatas, la gala y los resultados.</Note>;
    case 'gala':
      return <Note>La fecha, el lugar, la dirección y las entradas salen de los datos del certamen y del módulo de entradas.</Note>;
    case 'preguntas':
      return <Note>Las preguntas y sus respuestas se arman solas con los datos reales del certamen (inscripción, votación, entradas, gala, contacto).</Note>;
  }
}

// ── Pie de página ────────────────────────────────────────────────────────────

export function FooterPanel({ api }: { api: PanelApi }) {
  const { state, readOnly } = api;
  const { values } = state;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sección fija</p>
        <h2 className="text-lg font-semibold">Pie de página</h2>
        <p className="text-xs text-muted-foreground">Siempre al final: redes, contacto, enlaces y logos de quienes organizan o apoyan.</p>
      </div>
      <Group title="Contacto público" hint="Se usa en el pie, los botones de WhatsApp, las preguntas frecuentes y la postulación.">
        <TextField label="Instagram (uno o varios)" value={values.instagramHandle} max={400} placeholder="@micertamen, @otracuenta" disabled={readOnly} onChange={(instagramHandle) => api.changeValues({ instagramHandle })} />
        <TextField label="WhatsApp" type="tel" value={values.publicWhatsapp} max={30} placeholder="+56 9 1234 5678" disabled={readOnly} onChange={(publicWhatsapp) => api.changeValues({ publicWhatsapp })} />
        <TextField label="Correo" type="email" value={values.publicContactEmail} max={160} placeholder="contacto@…" disabled={readOnly} onChange={(publicContactEmail) => api.changeValues({ publicContactEmail })} />
      </Group>
      <PageantFooterFields value={values.publicSiteDesign.footer} disabled={readOnly} onChange={(footer) => api.changeDesign((design) => ({ ...design, footer }))} />
      <FooterPartnersEditor projectId={api.projectId} value={state.partners} onChange={api.changePartners} disabled={readOnly} />
    </div>
  );
}

// ── Bloques del estudio ──────────────────────────────────────────────────────

export function BlockPanel({ block, api, onChange }: { block: WebSiteBlock; api: PanelApi; onChange: (block: WebSiteBlock, boundary?: boolean) => void }) {
  const design = api.state.values.publicSiteDesign;
  const document = documentFromBlocks(design.blocks, design.theme);
  const pageId = homeOf(document).id;
  const info = block.style.canvas?.enabled && block.style.canvas.replaceContent ? { ...BLOCK_INFO[block.type], label: 'Lienzo libre' } : BLOCK_INFO[block.type];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sección del estudio</p>
        <h2 className="text-lg font-semibold">{info.label}</h2>
      </div>
      <Note>{info.help}</Note>
      {sampleTextCount(block) > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
          Todavía tiene texto de ejemplo («Escribe aquí…», «Tu nombre o marca»): cámbialo en los campos de abajo antes de publicar.
        </p>
      )}
      <SwitchRow label="Mostrar en el sitio" checked={!block.hidden} disabled={api.readOnly} onChange={(show) => onChange({ ...block, hidden: !show }, true)} />
      {!(block.style.canvas?.enabled && block.style.canvas.replaceContent) && (
        <>
          <LayoutPicker block={block} theme={design.theme} document={document} disabled={api.readOnly} onChange={(next) => onChange(next, true)} />
          <BlockFields block={block} disabled={api.readOnly} document={document} pageId={pageId} onChange={(next) => onChange(next)} />
        </>
      )}
      <CanvasEditor
        background={design.theme.background}
        font={design.theme.font}
        value={block.style.canvas}
        disabled={api.readOnly}
        document={document}
        pageId={pageId}
        onChange={(canvas) => onChange({ ...block, style: { ...block.style, canvas } })}
      />
      <SectionStyleFields style={block.style} type={block.type} theme={design.theme} disabled={api.readOnly} onChange={(patch: Partial<BlockStyle>) => onChange({ ...block, style: { ...block.style, ...patch } }, true)} />
    </div>
  );
}

// ── Diseño global ────────────────────────────────────────────────────────────

export function DesignPanel({ api }: { api: PanelApi }) {
  const { state, readOnly } = api;
  const { values } = state;
  const design = values.publicSiteDesign;
  const setOption = (patch: Partial<PageantSiteDesign['options']>) => api.changeDesign((current) => ({ ...current, options: { ...current.options, ...patch } }), true);
  return (
    <div className="space-y-5">
      <Group title="Color de acento" hint={values.publicPalette ? 'Con los colores del sitio activos (más abajo) este acento no se usa.' : 'El tono metálico de títulos, botones y detalles de todo el sitio.'}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de acento">
          {PUBLIC_ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              role="radio"
              aria-checked={values.publicAccent === accent}
              disabled={readOnly}
              onClick={() => api.changeValues({ publicAccent: accent }, true)}
              className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs', values.publicAccent === accent ? 'border-foreground font-medium' : 'border-border text-muted-foreground')}
            >
              <span className="size-3.5 rounded-full" style={{ background: PUBLIC_ACCENT_SWATCH[accent] }} aria-hidden="true" />
              {PUBLIC_ACCENT_LABELS[accent]}
            </button>
          ))}
        </div>
      </Group>

      <PalettePicker
        projectId={api.projectId}
        value={values.publicPalette}
        onChange={(publicPalette) => api.changeValues({ publicPalette }, true)}
        coverImageUrl={values.coverImageUrl}
        disabled={readOnly}
      />

      <Group title="Piezas del sitio">
        <SwitchRow label="Numeración de secciones (01, 02…)" checked={design.options.numbers} disabled={readOnly} onChange={(numbers) => setOption({ numbers })} />
        <SwitchRow label="Botón flotante de WhatsApp" checked={design.options.whatsappFloat} disabled={readOnly} onChange={(whatsappFloat) => setOption({ whatsappFloat })} />
        <SwitchRow label="Cinta animada bajo la portada" checked={design.options.ribbon} disabled={readOnly} onChange={(ribbon) => setOption({ ribbon })} />
        <SwitchRow label="Cuenta regresiva de la portada" checked={design.options.countdown} disabled={readOnly} onChange={(countdown) => setOption({ countdown })} />
        <SwitchRow label="Datos clave de la portada" checked={design.options.pills} disabled={readOnly} onChange={(pills) => setOption({ pills })} />
      </Group>

      <TypographyPicker value={values.publicTypography} onChange={(publicTypography) => api.changeValues({ publicTypography }, true)} disabled={readOnly} texts={{ name: api.projectName, tagline: values.publicTagline, description: values.publicDescription }} />

      <Group title="Secciones del estudio" hint="Las que agregas con «+ Agregar aquí»: textos, fotos, galerías, lienzos libres y más, con su propio tema.">
        <SwitchRow label="Mostrar las secciones del estudio" checked={design.enabled} disabled={readOnly} onChange={(enabled) => api.changeDesign((current) => ({ ...current, enabled }), true)} />
        <details className="rounded-lg border border-border px-3">
          <summary className="cursor-pointer py-2 text-sm font-medium">Colores, tipografía y botones del estudio</summary>
          <div className="pb-3">
            <ThemePanel theme={design.theme} disabled={readOnly} onChange={(patch) => api.changeDesign((current) => ({ ...current, theme: { ...current.theme, ...patch } }), true)} />
          </div>
        </details>
      </Group>
    </div>
  );
}

/** Para el panel vacío: qué se puede hacer. */
export function EmptySelection({ onUndoHint }: { onUndoHint?: boolean }) {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Elige qué editar</p>
      <ul className="list-inside list-disc space-y-1 text-xs">
        <li>Haz clic en cualquier sección de la vista previa (o en «Estructura») para ver sus opciones.</li>
        <li>Doble clic sobre un título, una etiqueta, la frase principal o «Sobre el certamen» para escribir ahí mismo.</li>
        <li>Pasa el mouse entre dos secciones y usa «+ Agregar sección aquí» para insertar textos, fotos, galerías, videos o un lienzo libre.</li>
        <li>Usa «Probar» para recorrer el sitio como un visitante.</li>
      </ul>
      {onUndoHint && (
        <p className="flex items-center gap-1 text-xs">
          <Undo2 className="size-3.5" aria-hidden="true" /> Ctrl + Z deshace y Ctrl + Shift + Z rehace.
        </p>
      )}
    </div>
  );
}
