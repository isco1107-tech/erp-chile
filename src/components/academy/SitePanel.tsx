'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ExternalLink, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { textareaClass } from '@/components/ui/field-classes';
import { cn } from '@/lib/utils';
import {
  ACADEMY_SITE_LIMITS,
  academySiteInputSchema,
  emptyAcademyContent,
  starterAcademyContent,
  suggestAcademySlug,
  type AcademySiteContent,
  type ReadinessItem,
} from '@/lib/academy/site';
import { formatWhatsappNumber } from '@/lib/events/pageant-contact';
import { getAcademySiteAction, saveAcademySiteAction, setAcademySitePublishedAction } from '@/modules/academy/actions/academy.actions';
import type { AcademySiteEditorData } from '@/modules/academy/services/academy-site.service';

/**
 * Editor del micrositio de la academia (pestaña «Sitio web»). Todo se arma
 * acá: portada, textos, clases, pasos, galería, directora, preguntas y
 * contacto. Guardar actualiza el borrador; Publicar exige lo imprescindible
 * (la misma lista que se ve arriba, recalculada en el servidor). Las fotos se
 * suben a nuestro almacenamiento y el servidor rechaza cualquier otra URL.
 */

interface Form {
  name: string;
  slug: string;
  heroImageUrl: string;
  whatsapp: string;
  contactEmail: string;
  instagramHandle: string;
  address: string;
  monthlyFee: string;
  content: AcademySiteContent;
}

function toForm(data: AcademySiteEditorData, fallbackName: string): Form {
  const site = data.site;
  return {
    name: site?.name ?? fallbackName,
    slug: site?.slug ?? suggestAcademySlug(fallbackName),
    heroImageUrl: site?.heroImageUrl ?? '',
    whatsapp: site?.whatsapp ? formatWhatsappNumber(site.whatsapp) : '',
    contactEmail: site?.contactEmail ?? '',
    instagramHandle: site?.instagramHandle ?? '',
    address: site?.address ?? '',
    monthlyFee: site?.content.monthlyFee != null ? String(site.content.monthlyFee) : '',
    content: site?.content ?? emptyAcademyContent(),
  };
}

async function uploadPhoto(file: File, purpose: 'hero' | 'gallery' | 'director'): Promise<string | null> {
  const body = new FormData();
  body.append('purpose', purpose);
  body.append('file', file);
  try {
    const res = await fetch('/api/academy/site-upload', { method: 'POST', body });
    const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
    if (!json.success || !json.data) {
      toast.error(json.error ?? 'No se pudo subir la imagen');
      return null;
    }
    return json.data.url;
  } catch {
    toast.error('No se pudo subir la imagen. Revisa tu conexión');
    return null;
  }
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Controles de una fila de lista: subir, bajar y quitar. */
function RowControls({ index, count, onMove, onRemove, disabled }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void; disabled: boolean }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" size="icon" aria-label="Subir" disabled={disabled || index === 0} onClick={() => onMove(index - 1)}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Bajar" disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)}>
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Quitar" disabled={disabled} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

export default function SitePanel({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<AcademySiteEditorData | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const heroRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const directorRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await getAcademySiteAction();
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setData(result.data);
    setForm(toForm(result.data, result.data.companyName));
    setSlugTouched(Boolean(result.data.site));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data || !form) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const { site } = data;
  const disabled = !canManage || busy;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setContent = <K extends keyof AcademySiteContent>(key: K, value: AcademySiteContent[K]) => setForm((f) => (f ? { ...f, content: { ...f.content, [key]: value } } : f));

  function payload() {
    if (!form) return null;
    const fee = form.monthlyFee.replace(/\D/g, '');
    return {
      name: form.name,
      slug: form.slug,
      heroImageUrl: form.heroImageUrl || null,
      whatsapp: form.whatsapp,
      contactEmail: form.contactEmail,
      instagramHandle: form.instagramHandle,
      address: form.address,
      content: { ...form.content, monthlyFee: fee ? Number(fee) : null },
    };
  }

  async function save(): Promise<boolean> {
    const input = payload();
    if (!input) return false;
    const parsed = academySiteInputSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return false;
    }
    setBusy(true);
    try {
      const result = await saveAcademySiteAction(input);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.message ?? 'Sitio guardado');
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(publish: boolean) {
    if (publish && !(await save())) return;
    setBusy(true);
    try {
      const result = await setAcademySitePublishedAction(publish);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? (publish ? 'Sitio publicado' : 'Sitio despublicado'));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>, purpose: 'hero' | 'gallery' | 'director') {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(purpose);
    try {
      if (purpose === 'gallery') {
        const room = ACADEMY_SITE_LIMITS.gallery - (form?.content.gallery.length ?? 0);
        if (files.length > room) toast.error(`El carrusel admite hasta ${ACADEMY_SITE_LIMITS.gallery} fotos`);
        for (const file of files.slice(0, Math.max(room, 0))) {
          const url = await uploadPhoto(file, 'gallery');
          if (url) setForm((f) => (f ? { ...f, content: { ...f.content, gallery: [...f.content.gallery, { url, caption: '' }] } } : f));
        }
      } else {
        const url = await uploadPhoto(files[0], purpose);
        if (url && purpose === 'hero') set('heroImageUrl', url);
        if (url && purpose === 'director') setForm((f) => (f ? { ...f, content: { ...f.content, director: { ...f.content.director, photoUrl: url } } } : f));
      }
      toast.success('Foto cargada: guarda para publicarla');
    } finally {
      setUploading(null);
    }
  }

  const publicPath = `/academia/${form.slug}`;
  const published = site?.isPublished === true;
  const readiness: ReadinessItem[] = data.readiness;
  const pending = readiness.filter((item) => !item.done);

  return (
    <div className="space-y-4">
      {/* Estado y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={published ? 'success' : 'neutral'}>{published ? 'Publicado' : site ? 'Borrador' : 'Sin crear'}</StatusBadge>
            {site && (
              <a href={publicPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline">
                {publicPath} <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {published ? 'Lo que guardes se ve de inmediato en el sitio público.' : 'El sitio no es público hasta que lo publiques; puedes guardar un borrador.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && !site && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setForm((f) => (f ? { ...f, monthlyFee: '45000', content: starterAcademyContent() } : f))}>
              Cargar textos de ejemplo
            </Button>
          )}
          <Button type="button" disabled={disabled} onClick={() => void save()}>
            {site ? 'Guardar cambios' : 'Crear sitio'}
          </Button>
          {site && (
            <Button type="button" variant={published ? 'outline' : 'default'} disabled={disabled} onClick={() => void togglePublish(!published)}>
              {published ? 'Despublicar' : 'Publicar sitio'}
            </Button>
          )}
        </div>
      </div>

      {/* Qué falta */}
      {site && pending.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Qué le falta a tu sitio</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {readiness.map((item) => (
              <li key={item.id} className={cn('flex items-start gap-2 text-sm', item.done ? 'text-muted-foreground' : 'text-foreground')}>
                {item.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span>
                  {item.label}
                  {!item.done && item.blocking && <span className="ml-1 text-xs text-destructive">(obligatorio para publicar)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Datos del sitio">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="as-name" label="Nombre de la academia">
            <Input
              id="as-name"
              value={form.name}
              disabled={disabled}
              maxLength={120}
              onChange={(e) => {
                set('name', e.target.value);
                if (!slugTouched) set('slug', suggestAcademySlug(e.target.value));
              }}
            />
          </Field>
          <Field id="as-slug" label="Dirección del sitio" hint={`Quedará en /academia/${form.slug || 'tu-academia'}`}>
            <Input
              id="as-slug"
              value={form.slug}
              disabled={disabled}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value.toLowerCase());
              }}
            />
          </Field>
        </div>
        <Field id="as-tagline" label="Frase de portada" hint="Una línea bajo el nombre.">
          <Input id="as-tagline" value={form.content.tagline} disabled={disabled} maxLength={160} onChange={(e) => setContent('tagline', e.target.value)} />
        </Field>
        <Field id="as-promo" label="Promoción vigente (opcional)" hint="Aparece destacada en la portada. Déjala vacía cuando termine.">
          <Input id="as-promo" value={form.content.promo} disabled={disabled} maxLength={300} onChange={(e) => setContent('promo', e.target.value)} />
        </Field>
        <Field id="as-intro" label="Quiénes somos" hint="Presentación de la academia.">
          <textarea id="as-intro" className={textareaClass} rows={4} maxLength={1200} value={form.content.intro} disabled={disabled} onChange={(e) => setContent('intro', e.target.value)} />
        </Field>
      </Section>

      <Section title="Portada" hint="Foto grande de la parte superior. Mínimo 1000 × 520 px, ideal 1600 × 900 px (JPG, PNG o WEBP, hasta 6 MB).">
        <div className="flex flex-wrap items-center gap-3">
          {form.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.heroImageUrl} alt="Portada actual" className="h-24 w-40 rounded-md border object-cover" />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">Sin portada</div>
          )}
          <input ref={heroRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Elegir foto de portada" onChange={(e) => void pickPhoto(e, 'hero')} />
          <Button type="button" variant="outline" disabled={disabled || uploading !== null} onClick={() => heroRef.current?.click()}>
            <ImagePlus aria-hidden="true" /> {uploading === 'hero' ? 'Subiendo…' : form.heroImageUrl ? 'Cambiar foto' : 'Subir foto'}
          </Button>
        </div>
      </Section>

      <Section title="Clases que ofrece" hint={`Hasta ${ACADEMY_SITE_LIMITS.disciplines}. Cada una se muestra como una tarjeta.`}>
        <div className="space-y-2">
          {form.content.disciplines.map((item, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-md border p-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Input aria-label={`Nombre de la clase ${i + 1}`} placeholder="Ej. Pasarela" value={item.title} disabled={disabled} maxLength={80} onChange={(e) => setContent('disciplines', form.content.disciplines.map((d, j) => (j === i ? { ...d, title: e.target.value } : d)))} />
                <Input aria-label={`Descripción de la clase ${i + 1}`} placeholder="Descripción (opcional)" value={item.text} disabled={disabled} maxLength={300} onChange={(e) => setContent('disciplines', form.content.disciplines.map((d, j) => (j === i ? { ...d, text: e.target.value } : d)))} />
              </div>
              <RowControls index={i} count={form.content.disciplines.length} disabled={disabled} onMove={(to) => setContent('disciplines', move(form.content.disciplines, i, to))} onRemove={() => setContent('disciplines', form.content.disciplines.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={disabled || form.content.disciplines.length >= ACADEMY_SITE_LIMITS.disciplines} onClick={() => setContent('disciplines', [...form.content.disciplines, { title: '', text: '' }])}>
            <Plus aria-hidden="true" /> Agregar clase
          </Button>
        </div>
      </Section>

      <Section title="Cómo funciona" hint={`Los pasos para ser alumna, en orden (hasta ${ACADEMY_SITE_LIMITS.steps}).`}>
        <div className="space-y-2">
          {form.content.steps.map((item, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-md border p-2">
              <div className="grid min-w-0 flex-1 gap-2">
                <Input aria-label={`Título del paso ${i + 1}`} placeholder="Ej. Te inscribes" value={item.title} disabled={disabled} maxLength={80} onChange={(e) => setContent('steps', form.content.steps.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))} />
                <textarea aria-label={`Descripción del paso ${i + 1}`} className={textareaClass} rows={2} placeholder="Qué pasa en este paso" value={item.text} disabled={disabled} maxLength={400} onChange={(e) => setContent('steps', form.content.steps.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)))} />
              </div>
              <RowControls index={i} count={form.content.steps.length} disabled={disabled} onMove={(to) => setContent('steps', move(form.content.steps, i, to))} onRemove={() => setContent('steps', form.content.steps.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={disabled || form.content.steps.length >= ACADEMY_SITE_LIMITS.steps} onClick={() => setContent('steps', [...form.content.steps, { title: '', text: '' }])}>
            <Plus aria-hidden="true" /> Agregar paso
          </Button>
        </div>
      </Section>

      <Section title="Mensualidad y horarios" hint="Los grupos activos de la pestaña Grupos se muestran con su horario; el precio de cada grupo no se publica.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="as-fee" label="Mensualidad (CLP)" hint="Vacío = no se publica el precio.">
            <Input id="as-fee" inputMode="numeric" placeholder="45000" value={form.monthlyFee} disabled={disabled} onChange={(e) => set('monthlyFee', e.target.value.replace(/\D/g, '').slice(0, 8))} />
          </Field>
          <Field id="as-fee-note" label="Aclaración del precio (opcional)" hint="Ej. matrícula, descuentos, forma de pago.">
            <Input id="as-fee-note" value={form.content.feeNote} disabled={disabled} maxLength={300} onChange={(e) => setContent('feeNote', e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Mostrar grupos y horarios</p>
            <p className="text-xs text-muted-foreground">Se leen en vivo de tus grupos activos.</p>
          </div>
          <Switch label="Mostrar grupos y horarios" checked={form.content.showGroups} disabled={disabled} onCheckedChange={(v) => setContent('showGroups', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Mostrar cuántas alumnas tiene</p>
            <p className="text-xs text-muted-foreground">Cuenta real de alumnas activas; no se muestra si es cero.</p>
          </div>
          <Switch label="Mostrar cuántas alumnas tiene" checked={form.content.showStudentCount} disabled={disabled} onCheckedChange={(v) => setContent('showStudentCount', v)} />
        </div>
      </Section>

      <Section title="Lo que recibe una alumna" hint={`Títulos, desfiles, spots… (hasta ${ACADEMY_SITE_LIMITS.benefits}).`}>
        <div className="space-y-2">
          {form.content.benefits.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input aria-label={`Beneficio ${i + 1}`} value={item} disabled={disabled} maxLength={200} onChange={(e) => setContent('benefits', form.content.benefits.map((b, j) => (j === i ? e.target.value : b)))} />
              <RowControls index={i} count={form.content.benefits.length} disabled={disabled} onMove={(to) => setContent('benefits', move(form.content.benefits, i, to))} onRemove={() => setContent('benefits', form.content.benefits.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={disabled || form.content.benefits.length >= ACADEMY_SITE_LIMITS.benefits} onClick={() => setContent('benefits', [...form.content.benefits, ''])}>
            <Plus aria-hidden="true" /> Agregar beneficio
          </Button>
        </div>
      </Section>

      <Section title="Carrusel de fotos" hint={`Hasta ${ACADEMY_SITE_LIMITS.gallery} fotos (mínimo 600 × 400 px, JPG, PNG o WEBP, hasta 6 MB cada una). Se muestran en este orden.`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {form.content.gallery.map((photo, i) => (
            <div key={`${photo.url}-${i}`} className="space-y-2 rounded-md border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || `Foto ${i + 1}`} className="aspect-[4/5] w-full rounded-md object-cover" />
              <Input aria-label={`Texto de la foto ${i + 1}`} placeholder="Texto bajo la foto (opcional)" value={photo.caption} disabled={disabled} maxLength={120} onChange={(e) => setContent('gallery', form.content.gallery.map((g, j) => (j === i ? { ...g, caption: e.target.value } : g)))} />
              <RowControls index={i} count={form.content.gallery.length} disabled={disabled} onMove={(to) => setContent('gallery', move(form.content.gallery, i, to))} onRemove={() => setContent('gallery', form.content.gallery.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
        <input ref={galleryRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Elegir fotos para el carrusel" onChange={(e) => void pickPhoto(e, 'gallery')} />
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading !== null || form.content.gallery.length >= ACADEMY_SITE_LIMITS.gallery} onClick={() => galleryRef.current?.click()}>
          <ImagePlus aria-hidden="true" /> {uploading === 'gallery' ? 'Subiendo…' : 'Agregar fotos'}
        </Button>
      </Section>

      <Section title="Nuestra historia">
        <textarea id="as-history" aria-label="Historia de la academia" className={textareaClass} rows={6} maxLength={4000} value={form.content.history} disabled={disabled} onChange={(e) => setContent('history', e.target.value)} />
      </Section>

      <Section title="Dirección de la academia (opcional)" hint="Aparece junto a la historia.">
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-2">
            {form.content.director.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.content.director.photoUrl} alt="Foto actual" className="h-32 w-24 rounded-md border object-cover" />
            ) : (
              <div className="flex h-32 w-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">Sin foto</div>
            )}
            <input ref={directorRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Elegir foto de la directora" onChange={(e) => void pickPhoto(e, 'director')} />
            <Button type="button" variant="outline" size="sm" disabled={disabled || uploading !== null} onClick={() => directorRef.current?.click()}>
              <ImagePlus aria-hidden="true" /> {uploading === 'director' ? 'Subiendo…' : 'Foto'}
            </Button>
          </div>
          <div className="grid min-w-0 flex-1 gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="as-dir-name" label="Nombre">
                <Input id="as-dir-name" value={form.content.director.name} disabled={disabled} maxLength={80} onChange={(e) => setContent('director', { ...form.content.director, name: e.target.value })} />
              </Field>
              <Field id="as-dir-role" label="Cargo">
                <Input id="as-dir-role" placeholder="Directora" value={form.content.director.role} disabled={disabled} maxLength={80} onChange={(e) => setContent('director', { ...form.content.director, role: e.target.value })} />
              </Field>
            </div>
            <Field id="as-dir-bio" label="Reseña">
              <textarea id="as-dir-bio" className={textareaClass} rows={3} maxLength={800} value={form.content.director.bio} disabled={disabled} onChange={(e) => setContent('director', { ...form.content.director, bio: e.target.value })} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Preguntas frecuentes" hint={`Hasta ${ACADEMY_SITE_LIMITS.faq}.`}>
        <div className="space-y-2">
          {form.content.faq.map((item, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-md border p-2">
              <div className="grid min-w-0 flex-1 gap-2">
                <Input aria-label={`Pregunta ${i + 1}`} placeholder="Pregunta" value={item.question} disabled={disabled} maxLength={160} onChange={(e) => setContent('faq', form.content.faq.map((q, j) => (j === i ? { ...q, question: e.target.value } : q)))} />
                <textarea aria-label={`Respuesta ${i + 1}`} className={textareaClass} rows={2} placeholder="Respuesta" value={item.answer} disabled={disabled} maxLength={600} onChange={(e) => setContent('faq', form.content.faq.map((q, j) => (j === i ? { ...q, answer: e.target.value } : q)))} />
              </div>
              <RowControls index={i} count={form.content.faq.length} disabled={disabled} onMove={(to) => setContent('faq', move(form.content.faq, i, to))} onRemove={() => setContent('faq', form.content.faq.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={disabled || form.content.faq.length >= ACADEMY_SITE_LIMITS.faq} onClick={() => setContent('faq', [...form.content.faq, { question: '', answer: '' }])}>
            <Plus aria-hidden="true" /> Agregar pregunta
          </Button>
        </div>
      </Section>

      <Section title="Contacto" hint="Lo que verá el público. Con un link de inscripción, el botón «Inscríbete» lleva al formulario; sin él, al WhatsApp.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="as-wa" label="WhatsApp">
            <Input id="as-wa" placeholder="+56 9 1234 5678" value={form.whatsapp} disabled={disabled} maxLength={30} onChange={(e) => set('whatsapp', e.target.value)} />
          </Field>
          <Field id="as-email" label="Correo">
            <Input id="as-email" type="email" value={form.contactEmail} disabled={disabled} maxLength={160} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
          <Field id="as-ig" label="Instagram (uno o varios)" hint="Separa varias cuentas con coma (hasta 5).">
            <Input id="as-ig" placeholder="@tuacademia, @otracuenta" value={form.instagramHandle} disabled={disabled} maxLength={400} onChange={(e) => set('instagramHandle', e.target.value)} />
          </Field>
          <Field id="as-address" label="Dirección o ciudad (opcional)">
            <Input id="as-address" value={form.address} disabled={disabled} maxLength={200} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
      </Section>

      {canManage && (
        <div className="flex justify-end">
          <Button type="button" disabled={disabled} onClick={() => void save()}>
            {site ? 'Guardar cambios' : 'Crear sitio'}
          </Button>
        </div>
      )}
      {!canManage && <p className="text-sm text-muted-foreground">Solo el dueño y los administradores pueden editar el sitio.</p>}
    </div>
  );
}
