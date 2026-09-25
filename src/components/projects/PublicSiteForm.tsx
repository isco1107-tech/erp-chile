'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, ImagePlus, Wand2, XCircle } from 'lucide-react';
import type { Project } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { textareaClass } from '@/components/ui/field-classes';
import { formatWhatsappNumber } from '@/lib/events/pageant-contact';
import { slugify } from '@/lib/events/public-slug';
import { DIRECTOR_TITLES, directorCopy, type DirectorTitle } from '@/lib/events/pageant-site';
import { checkPublicSlugAction, updatePublicSiteAction } from '@/modules/projects/actions/projects.actions';
import { PUBLIC_ACCENT_LABELS, PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';
import { cn } from '@/lib/utils';

/** Muestras de color de los acentos del sistema público (los mismos de `PublicShell`). */
const ACCENT_SWATCH: Record<PublicAccentKey, string> = {
  gold: 'linear-gradient(135deg, #e7cd97, #a8823f)',
  violet: 'linear-gradient(135deg, #b39bff, #6d28d9)',
  rose: 'linear-gradient(135deg, #fda4b4, #be123c)',
  cyan: 'linear-gradient(135deg, #67e8f9, #0e7490)',
  emerald: 'linear-gradient(135deg, #6ee7b7, #047857)',
};

type Toggle = 'showCandidatesPublic' | 'showSponsorsPublic' | 'showVoteRankingPublic' | 'showResultsPublic' | 'sponsorLeadFormEnabled';

const TOGGLES: Array<{ key: Toggle; label: string; hint: string }> = [
  { key: 'showCandidatesPublic', label: 'Galería de candidatas', hint: 'Solo oficiales, finalistas y ganadora, con nombre artístico, número, a quién representan, foto y la bio pública.' },
  { key: 'showSponsorsPublic', label: 'Muro de auspiciadores', hint: 'Marcas con contrato confirmado, agrupadas por nivel.' },
  { key: 'sponsorLeadFormEnabled', label: 'Vista y formulario "Ser sponsor"', hint: 'Con CRM, cada solicitud entra como prospecto con tarea de seguimiento; sin CRM llega por correo al contacto del certamen (o a los dueños de la cuenta).' },
  { key: 'showVoteRankingPublic', label: 'Ranking de votación del público', hint: 'Muestra los votos pagados por candidata en vivo.' },
  { key: 'showResultsPublic', label: 'Resultados oficiales', hint: 'Revela ganadora, finalistas y podio cuando la ronda final esté completada. Actívalo al coronar.' },
];

export function PublicSiteForm({ project, canWrite }: { project: Project; canWrite: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({
    publicSlug: project.publicSlug ?? '',
    publicSiteEnabled: project.publicSiteEnabled,
    publicTagline: project.publicTagline ?? '',
    publicDescription: project.publicDescription ?? '',
    coverImageUrl: project.coverImageUrl ?? '',
    publicAccent: ((PUBLIC_ACCENTS as readonly string[]).includes(project.publicAccent) ? project.publicAccent : 'gold') as PublicAccentKey,
    instagramHandle: project.instagramHandle ? `@${project.instagramHandle.replace(/^@/, '')}` : '',
    publicContactEmail: project.publicContactEmail ?? '',
    publicWhatsapp: project.publicWhatsapp ? formatWhatsappNumber(project.publicWhatsapp) : '',
    showCandidatesPublic: project.showCandidatesPublic,
    showSponsorsPublic: project.showSponsorsPublic,
    showVoteRankingPublic: project.showVoteRankingPublic,
    showResultsPublic: project.showResultsPublic,
    sponsorLeadFormEnabled: project.sponsorLeadFormEnabled,
    directorName: project.directorName ?? '',
    directorTitle: (project.directorTitle === 'Directora' ? 'Directora' : 'Director') as DirectorTitle,
    directorRole: project.directorRole ?? '',
    directorBio: project.directorBio ?? '',
    directorPhotoUrl: project.directorPhotoUrl ?? '',
    sponsorExclusivityNote: project.sponsorExclusivityNote ?? '',
  });
  // La trayectoria se edita como texto, un logro por línea.
  const [highlightsText, setHighlightsText] = useState(project.directorHighlights.join('\n'));
  const [uploadingDirector, setUploadingDirector] = useState(false);
  const directorFileRef = useRef<HTMLInputElement>(null);
  const [slugState, setSlugState] = useState<{ available: boolean; problem: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((prev) => ({ ...prev, [key]: value }));

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

  async function uploadImage(file: File): Promise<string | null> {
    const form = new FormData();
    form.append('projectId', project.id);
    form.append('file', file);
    const res = await fetch('/api/projects/cover-upload', { method: 'POST', body: form });
    const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
    if (!json.success || !json.data) {
      toast.error(json.error ?? 'No se pudo subir la imagen');
      return null;
    }
    return json.data.url;
  }

  async function uploadDirectorPhoto(file: File) {
    setUploadingDirector(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        set('directorPhotoUrl', url);
        toast.success('Foto cargada: guarda para publicarla');
      }
    } finally {
      setUploadingDirector(false);
      if (directorFileRef.current) directorFileRef.current.value = '';
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

  async function save() {
    setSaving(true);
    try {
      const result = await updatePublicSiteAction(project.id, { ...values, directorHighlights: highlightsText.split('\n') });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const sitePath = values.publicSlug ? `/certamen/${values.publicSlug}` : null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
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
                  <p className="text-xs text-muted-foreground">JPG o PNG horizontal, hasta 6 MB.</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="site-tagline">Frase principal</Label>
            <Input id="site-tagline" value={values.publicTagline} onChange={(e) => set('publicTagline', e.target.value)} placeholder="La belleza con propósito vuelve a Viña del Mar" disabled={!canWrite} />
          </div>
          <div>
            <Label htmlFor="site-description">Sobre el certamen</Label>
            <textarea id="site-description" className={cn(textareaClass, 'min-h-32')} value={values.publicDescription} onChange={(e) => set('publicDescription', e.target.value)} placeholder="Historia del certamen, qué se busca en una reina, causa social, premios…" disabled={!canWrite} />
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
                  <span className="size-3.5 rounded-full" style={{ background: ACCENT_SWATCH[accent] }} aria-hidden="true" />
                  {PUBLIC_ACCENT_LABELS[accent]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="site-ig">Instagram del certamen</Label>
              <Input id="site-ig" value={values.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} placeholder="@misschileoficial" disabled={!canWrite} />
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

        {canWrite && (
          <div className="flex gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : values.publicSiteEnabled ? 'Guardar y publicar' : 'Guardar'}
            </Button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold">Vista previa</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-foreground text-background">
            <div className="relative h-32">
              {values.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.coverImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-60" aria-hidden="true" />
              )}
              <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: ACCENT_SWATCH[values.publicAccent] }} aria-hidden="true" />
            </div>
            <div className="p-4">
              <p className="text-lg font-semibold">{project.name}</p>
              {values.publicTagline && <p className="text-sm text-background/70">{values.publicTagline}</p>}
            </div>
          </div>
          {sitePath && project.publicSlug === values.publicSlug && project.publicSiteEnabled ? (
            <a href={sitePath} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
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
