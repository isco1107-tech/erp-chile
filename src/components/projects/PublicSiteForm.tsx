'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, ImagePlus, Maximize2, MousePointerClick, Wand2, XCircle } from 'lucide-react';
import type { Project } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { textareaClass } from '@/components/ui/field-classes';
import { slugify } from '@/lib/events/public-slug';
import { DIRECTOR_TITLES, directorCopy } from '@/lib/events/pageant-site';
import { checkPublicSlugAction, updatePublicSiteAction } from '@/modules/projects/actions/projects.actions';
import { PUBLIC_ACCENT_LABELS, PUBLIC_ACCENT_SWATCH, PUBLIC_ACCENTS } from '@/modules/projects/schema';
import { cn } from '@/lib/utils';
import { CreativeStudio } from '@/components/web-sites/CreativeStudio';
import { PageantVisualStudio } from './PageantVisualStudio';
import { PageantDraftNotice, usePageantDraft } from './PageantDraftRecovery';
import { pageantNativeTextOf } from '@/lib/events/pageant-native-text';
import { SiteDesignAssistant } from '@/components/web-sites/SiteDesignAssistant';
import { CustomDomainSection } from './CustomDomainSection';
import { PageantFooterFields } from './PageantFooterFields';
import { TypographyPicker } from './TypographyPicker';
import { effectiveFont, pageantFontInfo } from '@/lib/events/pageant-typography';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import { AboutTextPreview } from './AboutTextPreview';
import { FooterPartnersEditor, type FooterPartnersDraft } from './FooterPartnersEditor';
import { PageantVisualEditor } from './site-editor/PageantVisualEditor';
import { initialPartners, initialSiteFormValues, stateFingerprint, toCanvasDraft, type SiteEditorState } from './site-editor/site-draft';

type Toggle = 'showCandidatesPublic' | 'showSponsorsPublic' | 'showVoteRankingPublic' | 'showResultsPublic' | 'sponsorLeadFormEnabled';

const TOGGLES: Array<{ key: Toggle; label: string; hint: string }> = [
  { key: 'showCandidatesPublic', label: 'Galería de candidatas', hint: 'Solo oficiales, finalistas y ganadora, con nombre artístico, número, a quién representan, foto y la bio pública.' },
  { key: 'showSponsorsPublic', label: 'Muro de auspiciadores', hint: 'Marcas con contrato confirmado, agrupadas por nivel.' },
  { key: 'sponsorLeadFormEnabled', label: 'Vista y formulario "Ser sponsor"', hint: 'Con CRM, cada solicitud entra como prospecto con tarea de seguimiento; sin CRM llega por correo al contacto del certamen (o a los dueños de la cuenta).' },
  { key: 'showVoteRankingPublic', label: 'Ranking de votación del público', hint: 'Muestra los votos pagados por candidata en vivo.' },
  { key: 'showResultsPublic', label: 'Resultados oficiales', hint: 'Revela ganadora, finalistas y podio cuando la ronda final esté completada. Actívalo al coronar.' },
];

export function PublicSiteForm({ project, canWrite, userId }: { project: Project; canWrite: boolean; userId: string }) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialSiteFormValues(project));
  const { footer, ...creative } = values.publicSiteDesign;
  const draft = usePageantDraft({ project, canWrite, userId, values });
  // Logos del pie: el enlace queda como se escribió y se normaliza al guardar.
  const [partners, setPartners] = useState<FooterPartnersDraft>(() => initialPartners(project));
  // La trayectoria se edita como texto, un logro por línea.
  const [highlightsText, setHighlightsText] = useState(project.directorHighlights.join('\n'));
  const [uploadingDirector, setUploadingDirector] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const faviconFileRef = useRef<HTMLInputElement>(null);
  const directorFileRef = useRef<HTMLInputElement>(null);
  const [slugState, setSlugState] = useState<{ available: boolean; problem: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  // Editor visual: edita ESTE mismo borrador, así que cerrar el editor no pierde nada.
  const editorState: SiteEditorState = useMemo(() => ({ values, partners, highlightsText }), [values, partners, highlightsText]);
  const fingerprint = useMemo(() => stateFingerprint(editorState), [editorState]);
  const [savedFingerprint, setSavedFingerprint] = useState(fingerprint);
  const dirty = fingerprint !== savedFingerprint;
  // Cerrar la pestaña o recargar con cambios sin guardar pide confirmación (el navegador muestra su aviso).
  useEffect(() => {
    if (!dirty || !canWrite) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, canWrite]);
  const [editorHost, setEditorHost] = useState<Element | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  // Verificación de la dirección mientras se escribe (espera 400 ms entre teclas).
  useEffect(() => {
    const slug = values.publicSlug.trim();
    if (!slug || slug === project.publicSlug) {
      setSlugState(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      const result = await checkPublicSlugAction(project.id, slug);
      if (result.success) setSlugState(result.data);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [values.publicSlug, project.id, project.publicSlug]);

  async function uploadImage(file: File, purpose: 'cover' | 'director' | 'favicon' | 'studio' = 'cover'): Promise<string | null> {
    const form = new FormData();
    form.append('projectId', project.id);
    form.append('purpose', purpose);
    form.append('file', file);
    try {
      const res = await fetch('/api/projects/cover-upload', { method: 'POST', body: form });
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'No se pudo subir la imagen');
        return null;
      }
      return json.data.url;
    } catch {
      toast.error('No se pudo conectar con el almacenamiento. Intenta nuevamente.');
      return null;
    }
  }

  async function uploadDirectorPhoto(file: File) {
    setUploadingDirector(true);
    try {
      const url = await uploadImage(file, 'director');
      if (url) {
        set('directorPhotoUrl', url);
        toast.success('Foto cargada: guarda para publicarla');
      }
    } finally {
      setUploadingDirector(false);
      if (directorFileRef.current) directorFileRef.current.value = '';
    }
  }

  async function uploadFavicon(file: File) {
    setUploadingFavicon(true);
    try {
      const url = await uploadImage(file, 'favicon');
      if (url) {
        set('faviconUrl', url);
        toast.success('Logo cargado: guarda para publicarlo');
      }
    } finally {
      setUploadingFavicon(false);
      if (faviconFileRef.current) faviconFileRef.current.value = '';
    }
  }

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        set('coverImageUrl', url);
        toast.success('Portada cargada: guarda para publicarla');
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** Guarda lo que hay en pantalla (formulario y editor visual comparten el borrador). */
  async function save(): Promise<boolean> {
    if (!canWrite || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    const sent = fingerprint;
    try {
      const result = await updatePublicSiteAction(project.id, { ...values, directorHighlights: highlightsText.split('\n'), footerPartners: partners });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setSavedFingerprint(sent);
      draft.markSaved(values);
      toast.success(result.message ?? 'Guardado');
      router.refresh();
      return true;
    } catch {
      toast.error('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function openEditor() {
    // Dentro del tema del panel (y de su paleta de marca), fuera de cualquier contenedor con scroll.
    setEditorHost(rootRef.current?.closest('.theme-saas-light') ?? document.body);
  }

  function closeEditor() {
    setEditorHost(null);
    if (dirty && canWrite) toast.info('Tus cambios siguen aquí, sin guardar: usa «Guardar» para no perderlos.');
  }

  const sitePath = values.publicSlug ? `/certamen/${values.publicSlug}` : null;

  return (
    <div ref={rootRef} className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
            <MousePointerClick className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Editor visual</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Edita el sitio sobre la página real y en grande: agrega secciones donde quieras, cambia el orden arrastrando, escribe los títulos con doble clic y elige el fondo de cada sección.
            </p>
          </div>
          <Button type="button" onClick={openEditor} className="shrink-0">
            <Maximize2 aria-hidden="true" />
            Abrir editor visual
          </Button>
        </section>
        <PageantDraftNotice draft={draft} onRestore={(restored) => setValues((previous) => ({ ...previous, ...restored }))} />
        <PageantVisualStudio
          projectId={project.id} design={values.publicSiteDesign}
          content={toCanvasDraft(editorState, false)}
          nativeText={pageantNativeTextOf(values)} onNativeTextChange={(text) => setValues((previous) => ({ ...previous, ...text }))}
          images={[values.coverImageUrl, values.directorPhotoUrl, values.faviconUrl].filter(Boolean)}
          galaDate={project.galaDate?.toISOString() ?? null} venueName={project.venueName}
          canWrite={canWrite} saving={saving} publishOnSave={values.publicSiteEnabled}
          onChange={(design) => set('publicSiteDesign', design)} onSave={async () => { await save(); }}
        />
        <CreativeStudio target="event" resourceId={project.id} name={project.name} value={creative} disabled={!canWrite || saving} images={[values.coverImageUrl, values.directorPhotoUrl, values.faviconUrl].filter(Boolean)} onChange={(design) => setValues((previous) => ({ ...previous, publicSiteDesign: { ...previous.publicSiteDesign, ...design } }))} orderNote={values.publicSiteDesign.layout ? 'El orden de todo el sitio se definió en el editor visual: las secciones nuevas aparecen al final y ahí puedes moverlas.' : undefined} />
        <SiteDesignAssistant disabled={!canWrite || saving} context={{ target: 'event', resourceId: project.id, current: { publicTagline: values.publicTagline, publicDescription: values.publicDescription, publicAccent: values.publicAccent, sponsorExclusivityNote: values.sponsorExclusivityNote } }} onApply={(proposal) => { if (proposal.target === 'event') { setValues((previous) => ({ ...previous, ...proposal.design })); toast.success('Propuesta aplicada: revisa y guarda los cambios'); } }} />
        <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Publicación</h2>
              <p className="text-xs text-muted-foreground">Mientras esté apagado, el enlace responde &quot;no disponible&quot;.</p>
            </div>
            <Switch checked={values.publicSiteEnabled} onCheckedChange={(v) => set('publicSiteEnabled', v)} label="Sitio publicado" disabled={!canWrite} />
          </div>
          <div>
            <Label htmlFor="site-slug">Dirección del sitio</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">/certamen/</span>
              <Input id="site-slug" className="max-w-sm flex-1" value={values.publicSlug} onChange={(e) => set('publicSlug', e.target.value.toLowerCase())} placeholder="miss-universe-chile-2026" disabled={!canWrite} />
              <Button type="button" size="sm" variant="outline" onClick={() => set('publicSlug', slugify(project.name))} disabled={!canWrite}>
                <Wand2 aria-hidden="true" />
                Usar el nombre
              </Button>
            </div>
            {slugState && (
              <p className={cn('mt-1 flex items-center gap-1 text-xs', slugState.available ? 'text-success' : 'text-danger')}>
                {slugState.available ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <XCircle className="size-3.5" aria-hidden="true" />}
                {slugState.available ? 'Dirección disponible' : slugState.problem}
              </p>
            )}
          </div>
        </section>

        <CustomDomainSection projectId={project.id} canWrite={canWrite} siteEnabled={project.publicSiteEnabled} />

        <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold">Portada y textos</h2>
          <div>
            <Label>Imagen de portada</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="relative h-24 w-40 overflow-hidden rounded-md border border-border bg-muted">
                {values.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={values.coverImageUrl} alt="Portada del certamen" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted-foreground">Sin portada</span>
                )}
              </div>
              {canWrite && (
                <div className="flex flex-col gap-1.5">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])} />
                  <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <ImagePlus aria-hidden="true" />
                    {uploading ? 'Subiendo…' : values.coverImageUrl ? 'Cambiar portada' : 'Subir portada'}
                  </Button>
                  {values.coverImageUrl && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => set('coverImageUrl', '')}>
                      Quitar portada
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">JPG o PNG horizontal de al menos 1600 × 900 px (mínimo 1000 × 520) y hasta 6 MB. Una imagen chica se ve pixelada a pantalla completa.</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Logo de la pestaña del navegador</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {values.faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={values.faviconUrl} alt="Logo de la pestaña" className="size-full object-cover" />
                ) : (
                  <span className="px-1 text-center text-[10px] text-muted-foreground">Aether</span>
                )}
              </div>
              {canWrite && (
                <div className="flex flex-col gap-1.5">
                  <input ref={faviconFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadFavicon(e.target.files[0])} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={uploadingFavicon} onClick={() => faviconFileRef.current?.click()}>
                      <ImagePlus aria-hidden="true" />
                      {uploadingFavicon ? 'Subiendo…' : values.faviconUrl ? 'Cambiar logo' : 'Subir logo'}
                    </Button>
                    {values.faviconUrl && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => set('faviconUrl', '')}>
                        Quitar logo
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">El ícono chico de la pestaña y los favoritos. Cuadrado, ideal 512 × 512 px (mínimo 64 × 64). Sin logo, se ve el de Aether.</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="site-tagline">Frase principal</Label>
            <Input
              id="site-tagline"
              className={cn(PAGEANT_FONT_CLASSES, SITE_FONT_CLASSES, 'text-base italic md:text-base')}
              style={{ fontFamily: pageantFontInfo(effectiveFont(values.publicTypography, 'tagline')).css }}
              value={values.publicTagline} onChange={(e) => set('publicTagline', e.target.value)} placeholder="La belleza con propósito vuelve a Viña del Mar" disabled={!canWrite} />
          </div>
          <div>
            <Label htmlFor="site-description">Sobre el certamen</Label>
            {/* Con la letra del primer párrafo del sitio (cambia al elegir otra en «Tipografía»). */}
            <textarea
              id="site-description"
              className={cn(textareaClass, PAGEANT_FONT_CLASSES, SITE_FONT_CLASSES, 'min-h-32 text-lg leading-relaxed md:text-lg')}
              style={{ fontFamily: pageantFontInfo(effectiveFont(values.publicTypography, 'lead')).css }}
              value={values.publicDescription}
              onChange={(e) => set('publicDescription', e.target.value)}
              placeholder="Historia del certamen, qué se busca en una reina, causa social, premios…"
              disabled={!canWrite}
            />
            <p className="mt-1 text-xs text-muted-foreground">Deja una línea en blanco para empezar otro párrafo. El primero va destacado y con letra capital.</p>
            <div className="mt-3">
              <AboutTextPreview name={project.name} description={values.publicDescription} typography={values.publicTypography} accent={values.publicAccent} />
            </div>
          </div>
          <div>
            <Label>Color de acento</Label>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Color de acento">
              {PUBLIC_ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  role="radio"
                  aria-checked={values.publicAccent === accent}
                  disabled={!canWrite}
                  onClick={() => set('publicAccent', accent)}
                  className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs', values.publicAccent === accent ? 'border-foreground font-medium' : 'border-border text-muted-foreground')}
                >
                  <span className="size-3.5 rounded-full" style={{ background: PUBLIC_ACCENT_SWATCH[accent] }} aria-hidden="true" />
                  {PUBLIC_ACCENT_LABELS[accent]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="site-ig">Instagram del certamen (uno o varios)</Label>
              <Input id="site-ig" value={values.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} placeholder="@misschileoficial, @otracuenta" disabled={!canWrite} />
            </div>
            <div>
              <Label htmlFor="site-wsp">WhatsApp del certamen</Label>
              <Input id="site-wsp" type="tel" value={values.publicWhatsapp} onChange={(e) => set('publicWhatsapp', e.target.value)} placeholder="+56 9 1234 5678" disabled={!canWrite} />
            </div>
            <div>
              <Label htmlFor="site-email">Correo de contacto público</Label>
              <Input id="site-email" type="email" value={values.publicContactEmail} onChange={(e) => set('publicContactEmail', e.target.value)} placeholder="contacto@…" disabled={!canWrite} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">El mismo contacto aparece en el formulario de postulación del certamen.</p>
        </section>

        <TypographyPicker
          value={values.publicTypography}
          onChange={(typography) => set('publicTypography', typography)}
          disabled={!canWrite}
          texts={{ name: project.name, tagline: values.publicTagline, description: values.publicDescription }}
        />

        <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
          <div>
            <h2 className="text-base font-semibold">{directorCopy(values.directorTitle).invite.replace(/^c/, 'C')}</h2>
            <p className="text-xs text-muted-foreground">Aparece en las vistas de candidatas y sponsors. Sin nombre, la sección no se muestra.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative size-20 overflow-hidden rounded-full border border-border bg-muted">
              {values.directorPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.directorPhotoUrl} alt="Foto del director" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-xs text-muted-foreground">Sin foto</span>
              )}
            </div>
            {canWrite && (
              <div className="flex flex-col gap-1.5">
                <input
                  ref={directorFileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && void uploadDirectorPhoto(e.target.files[0])}
                />
                <Button type="button" size="sm" variant="outline" disabled={uploadingDirector} onClick={() => directorFileRef.current?.click()}>
                  <ImagePlus aria-hidden="true" />
                  {uploadingDirector ? 'Subiendo…' : values.directorPhotoUrl ? 'Cambiar foto' : 'Subir foto'}
                </Button>
                {values.directorPhotoUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => set('directorPhotoUrl', '')}>
                    Quitar foto
                  </Button>
                )}
              </div>
            )}
          </div>
          <div>
            <Label>Se muestra como</Label>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Director o directora">
              {DIRECTOR_TITLES.map((title) => (
                <button
                  key={title}
                  type="button"
                  role="radio"
                  aria-checked={values.directorTitle === title}
                  disabled={!canWrite}
                  onClick={() => set('directorTitle', title)}
                  className={cn('rounded-full border px-3 py-1 text-sm', values.directorTitle === title ? 'border-foreground font-medium' : 'border-border text-muted-foreground')}
                >
                  {title}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">En el sitio se lee &quot;{directorCopy(values.directorTitle).invite}&quot;.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="site-director-name">Nombre</Label>
              <Input id="site-director-name" value={values.directorName} onChange={(e) => set('directorName', e.target.value)} placeholder="Constanza Rey Ortiz" disabled={!canWrite} />
            </div>
            <div>
              <Label htmlFor="site-director-role">Cargo o empresas</Label>
              <Input id="site-director-role" value={values.directorRole} onChange={(e) => set('directorRole', e.target.value)} placeholder="CEO Venusmodel · CEO Kidsmodel" disabled={!canWrite} />
            </div>
          </div>
          <div>
            <Label htmlFor="site-director-bio">Presentación</Label>
            <textarea
              id="site-director-bio"
              className={textareaClass}
              value={values.directorBio}
              onChange={(e) => set('directorBio', e.target.value)}
              placeholder="Una trayectoria dedicada a la formación de reinas de belleza…"
              disabled={!canWrite}
            />
          </div>
          <div>
            <Label htmlFor="site-director-highlights">Trayectoria (un logro por línea)</Label>
            <textarea
              id="site-director-highlights"
              className={cn(textareaClass, 'min-h-32')}
              value={highlightsText}
              onChange={(e) => setHighlightsText(e.target.value)}
              placeholder={'Director Miss Universo Providencia 2025\nMejor Director Teen Universe Chile 2023'}
              disabled={!canWrite}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-card">
          <div>
            <h2 className="text-base font-semibold">Nota para sponsors</h2>
            <p className="text-xs text-muted-foreground">Se muestra bajo los paquetes, como &quot;Exclusividad por categoría&quot;. Vacía = no aparece.</p>
          </div>
          <textarea
            id="site-sponsor-note"
            aria-label="Nota para sponsors"
            className={textareaClass}
            value={values.sponsorExclusivityNote}
            onChange={(e) => set('sponsorExclusivityNote', e.target.value)}
            placeholder="Las categorías Diamond, Crown y Royal pueden optar a exclusividad dentro de su rubro comercial…"
            disabled={!canWrite}
          />
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold">Secciones</h2>
          <ul className="mt-3 divide-y divide-border">
            {TOGGLES.map((toggle) => (
              <li key={toggle.key} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{toggle.label}</p>
                  <p className="text-xs text-muted-foreground">{toggle.hint}</p>
                </div>
                <Switch checked={values[toggle.key]} onCheckedChange={(v) => set(toggle.key, v)} label={toggle.label} disabled={!canWrite} />
              </li>
            ))}
          </ul>
        </section>

        <PageantFooterFields
          value={footer}
          disabled={!canWrite || saving}
          onChange={(footer) => setValues((previous) => ({ ...previous, publicSiteDesign: { ...previous.publicSiteDesign, footer } }))}
        />

        <FooterPartnersEditor projectId={project.id} value={partners} onChange={setPartners} disabled={!canWrite || saving} />

        {canWrite && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : values.publicSiteEnabled ? 'Guardar y publicar' : 'Guardar'}
            </Button>
            {dirty && !saving && <span className="text-xs font-medium text-warning">Cambios sin guardar</span>}
          </div>
        )}
      </div>

      {editorHost &&
        createPortal(
          <PageantVisualEditor
            project={{
              id: project.id,
              name: project.name,
              publicSlug: project.publicSlug,
              publicSiteEnabled: project.publicSiteEnabled,
              publicUrl: project.publicSlug ? (project.customDomain && project.customDomainVerifiedAt ? `https://${project.customDomain}` : `/certamen/${project.publicSlug}`) : null,
            }}
            state={editorState}
            onChange={(next) => {
              setValues(next.values);
              setPartners(next.partners);
              setHighlightsText(next.highlightsText);
            }}
            onSave={save}
            saving={saving}
            dirty={dirty}
            canWrite={canWrite}
            upload={uploadImage}
            onClose={closeEditor}
          />,
          editorHost
        )}

      <aside className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold">Vista previa</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-foreground text-background">
            <div className="relative h-32">
              {values.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.coverImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-60" aria-hidden="true" />
              )}
              <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: PUBLIC_ACCENT_SWATCH[values.publicAccent] }} aria-hidden="true" />
            </div>
            <div className="p-4">
              <p className="text-lg font-semibold">{project.name}</p>
              {values.publicTagline && <p className="text-sm text-background/70">{values.publicTagline}</p>}
            </div>
          </div>
          {sitePath && project.publicSlug === values.publicSlug && project.publicSiteEnabled ? (
            <a href={project.customDomain && project.customDomainVerifiedAt ? `https://${project.customDomain}` : sitePath} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden="true" />
              Ver el sitio publicado
            </a>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Guarda con el sitio publicado para verlo en vivo.</p>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <h2 className="text-base font-semibold text-foreground">Qué se muestra</h2>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Botones de entradas, votación y postulación aparecen solos cuando cada link está activo.</li>
            <li>La cuenta regresiva usa la fecha de la gala del certamen.</li>
            <li>Los planes de auspicio salen del tarifario (solo los marcados como públicos).</li>
            <li>Nunca se publica RUT, edad, contacto ni ficha de postulación de las candidatas.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
