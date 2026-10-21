'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { textareaClass } from '@/components/ui/field-classes';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  MAX_POSTER_FACTS,
  MAX_POSTER_LIST_ITEMS,
  MAX_SPONSOR_LOGOS,
  POSTER_TEXT_LIMITS,
  TITLE_SCALE_MAX,
  TITLE_SCALE_MIN,
  type PosterHideable,
  type PosterOverrides,
  type PosterTextSlot,
} from '@/lib/posters/overrides';
import { PHOTO_POSITIONS, type PhotoPosition, type PosterContent } from '@/lib/posters/pieces';

/**
 * Panel de personalización del estudio de afiches: textos propios (vacío =
 * automático), datos y lista editables, imágenes (foto, logo y logos de
 * auspiciadores, subidas a la carpeta de afiches de la empresa), bloques
 * ocultos y tamaño del titular. No guarda nada por sí solo: cambia el pedido
 * que la vista previa dibuja; guardar es "Diseños guardados".
 */

const TEXT_FIELDS: Array<{ slot: PosterTextSlot; label: string; multiline?: boolean }> = [
  { slot: 'eyebrow', label: 'Rótulo' },
  { slot: 'kicker', label: 'Antetítulo' },
  { slot: 'headline', label: 'Titular' },
  { slot: 'edition', label: 'Edición' },
  { slot: 'subline', label: 'Bajada', multiline: true },
  { slot: 'cta', label: 'Texto del botón' },
  { slot: 'url', label: 'Dirección bajo el botón' },
  { slot: 'note', label: 'Mensaje destacado', multiline: true },
];

const HIDE_LABELS: Array<{ key: PosterHideable; label: string }> = [
  { key: 'kicker', label: 'Antetítulo' },
  { key: 'edition', label: 'Edición' },
  { key: 'subline', label: 'Bajada' },
  { key: 'facts', label: 'Datos' },
  { key: 'list', label: 'Lista' },
  { key: 'note', label: 'Mensaje' },
  { key: 'cta', label: 'Botón' },
  { key: 'contact', label: 'Contacto' },
  { key: 'photo', label: 'Foto principal' },
];

const POSITION_LABELS: Record<PhotoPosition, string> = { top: 'Arriba', center: 'Centro', bottom: 'Abajo' };

function autoText(content: PosterContent | null, slot: PosterTextSlot): string {
  if (!content) return '';
  if (slot === 'cta') return content.cta?.label ?? '';
  if (slot === 'url') return content.cta?.displayUrl ?? '';
  return content[slot] ?? '';
}

async function uploadImage(projectId: string, purpose: 'poster-photo' | 'poster-logo', file: File): Promise<string | null> {
  const form = new FormData();
  form.append('projectId', projectId);
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
    toast.error('No se pudo subir la imagen. Revisa tu conexión e intenta de nuevo.');
    return null;
  }
}

function Group({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-md border border-border">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium marker:hidden">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        {title}
      </summary>
      <div className="space-y-3 border-t border-border p-3">{children}</div>
    </details>
  );
}

function Thumb({ src, onRemove, label }: { src: string; onRemove: () => void; label: string }) {
  return (
    <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-full max-w-full object-contain" />
      <button type="button" onClick={onRemove} aria-label={label} className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm hover:bg-background">
        <X aria-hidden="true" className="size-3" />
      </button>
    </div>
  );
}

export interface PosterCustomizerProps {
  projectId: string;
  canWrite: boolean;
  /** Contenido automático de la pieza actual (para mostrar lo que sale si no se escribe nada). */
  auto: PosterContent | null;
  hasPhotoSlot: boolean;
  overrides: PosterOverrides;
  onChange: (next: PosterOverrides) => void;
}

export function PosterCustomizer({ projectId, canWrite, auto, hasPhotoSlot, overrides, onChange }: PosterCustomizerProps) {
  const [uploading, setUploading] = useState<null | 'photo' | 'logo' | 'sponsors'>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const sponsorInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<PosterOverrides>) => onChange({ ...overrides, ...patch });
  const setText = (slot: PosterTextSlot, value: string) => set({ texts: { ...overrides.texts, [slot]: value || undefined } });
  const hidden = new Set(overrides.hidden);
  const toggleHidden = (key: PosterHideable) => set({ hidden: hidden.has(key) ? overrides.hidden.filter((k) => k !== key) : [...overrides.hidden, key] });

  const facts = overrides.facts;
  const list = overrides.list;

  async function upload(kind: 'photo' | 'logo' | 'sponsors', files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(kind);
    try {
      if (kind === 'sponsors') {
        const room = MAX_SPONSOR_LOGOS - overrides.sponsorLogos.length;
        const picked = Array.from(files).slice(0, room);
        if (files.length > room) toast.warning(`Solo caben ${MAX_SPONSOR_LOGOS} logos; se subieron los primeros ${room}.`);
        const urls: string[] = [];
        for (const file of picked) {
          const url = await uploadImage(projectId, 'poster-logo', file);
          if (url) urls.push(url);
        }
        if (urls.length > 0) set({ sponsorLogos: [...overrides.sponsorLogos, ...urls] });
      } else {
        const url = await uploadImage(projectId, kind === 'photo' ? 'poster-photo' : 'poster-logo', files[0]!);
        if (url) set(kind === 'photo' ? { photoUrl: url } : { logoUrl: url });
      }
    } finally {
      setUploading(null);
    }
  }

  const uploadButton = (kind: 'photo' | 'logo' | 'sponsors', label: string, input: React.RefObject<HTMLInputElement | null>, disabled = false) => (
    <Button type="button" variant="outline" size="sm" disabled={!canWrite || uploading !== null || disabled} onClick={() => input.current?.click()}>
      {uploading === kind ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-4" />}
      {label}
    </Button>
  );

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-labelledby="poster-custom">
      <div className="flex items-center justify-between gap-2">
        <h2 id="poster-custom" className="text-sm font-semibold">
          Personalizar
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ texts: {}, hidden: [], sponsorLogos: overrides.sponsorLogos, logoUrl: overrides.logoUrl, titleScale: 1 })}>
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Volver a lo automático
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Lo que dejes vacío sale solo, con los datos del certamen. Logo y logos de auspiciadores se mantienen al cambiar de pieza.</p>

      <Group title="Textos" open>
        {TEXT_FIELDS.map(({ slot, label, multiline }) => {
          const value = overrides.texts[slot] ?? '';
          const placeholder = autoText(auto, slot) || 'Sin texto automático';
          const limit = POSTER_TEXT_LIMITS[slot];
          return (
            <label key={slot} className="block space-y-1">
              <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                {label}
                {value && (
                  <span className="tabular-nums">
                    {value.length}/{limit}
                  </span>
                )}
              </span>
              {multiline ? (
                <textarea className={cn(textareaClass, 'min-h-14')} maxLength={limit} value={value} placeholder={placeholder} onChange={(e) => setText(slot, e.target.value)} />
              ) : (
                <Input maxLength={limit} value={value} placeholder={placeholder} onChange={(e) => setText(slot, e.target.value)} />
              )}
            </label>
          );
        })}
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            Tamaño del titular
            <span className="tabular-nums">{Math.round(overrides.titleScale * 100)}%</span>
          </span>
          <input
            type="range"
            min={TITLE_SCALE_MIN}
            max={TITLE_SCALE_MAX}
            step={0.05}
            aria-label="Tamaño del titular"
            value={overrides.titleScale}
            onChange={(e) => set({ titleScale: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <span className="block text-xs text-muted-foreground">Si no cabe, el motor lo ajusta igual: nunca se corta.</span>
        </label>
      </Group>

      <Group title="Datos y lista">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Datos (hasta {MAX_POSTER_FACTS})</span>
            {facts ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ facts: undefined })}>
                Usar automáticos
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ facts: (auto?.facts ?? []).map((f) => ({ ...f })) })}>
                Editar
              </Button>
            )}
          </div>
          {!facts && <p className="text-xs text-muted-foreground">{auto?.facts.length ? auto.facts.map((f) => `${f.label}: ${f.value}`).join(' · ') : 'Esta pieza no trae datos automáticos.'}</p>}
          {facts?.map((fact, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2">
              <Input className="w-2/5" maxLength={24} placeholder="Etiqueta" value={fact.label} onChange={(e) => set({ facts: facts.map((f, i) => (i === index ? { ...f, label: e.target.value } : f)) })} />
              <Input className="min-w-0 flex-1" maxLength={48} placeholder="Dato" value={fact.value} onChange={(e) => set({ facts: facts.map((f, i) => (i === index ? { ...f, value: e.target.value } : f)) })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar dato" onClick={() => set({ facts: facts.filter((_, i) => i !== index) })}>
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ))}
          {facts && facts.length < MAX_POSTER_FACTS && (
            <Button type="button" variant="outline" size="sm" onClick={() => set({ facts: [...facts, { label: '', value: '' }] })}>
              <Plus aria-hidden="true" className="size-4" />
              Agregar dato
            </Button>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Lista (hasta {MAX_POSTER_LIST_ITEMS} ítems)</span>
            {list ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ list: undefined })}>
                Usar automática
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ list: { title: auto?.list?.title ?? '', items: [...(auto?.list?.items ?? []).slice(0, MAX_POSTER_LIST_ITEMS)] } })}>
                Editar
              </Button>
            )}
          </div>
          {!list && <p className="text-xs text-muted-foreground">{auto?.list ? `${auto.list.title}: ${auto.list.items.join(' · ')}` : 'Esta pieza no trae lista; puedes crear una (requisitos, beneficios…).'}</p>}
          {list && (
            <>
              <Input maxLength={30} placeholder="Título (ej. Requisitos)" value={list.title} onChange={(e) => set({ list: { ...list, title: e.target.value } })} />
              {list.items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input className="min-w-0 flex-1" maxLength={70} placeholder={`Ítem ${index + 1}`} value={item} onChange={(e) => set({ list: { ...list, items: list.items.map((it, i) => (i === index ? e.target.value : it)) } })} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar ítem" onClick={() => set({ list: { ...list, items: list.items.filter((_, i) => i !== index) } })}>
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              ))}
              {list.items.length < MAX_POSTER_LIST_ITEMS && (
                <Button type="button" variant="outline" size="sm" onClick={() => set({ list: { ...list, items: [...list.items, ''] } })}>
                  <Plus aria-hidden="true" className="size-4" />
                  Agregar ítem
                </Button>
              )}
            </>
          )}
        </div>
      </Group>

      <Group title="Imágenes">
        {!canWrite && <p className="text-xs text-muted-foreground">Necesitas permiso de edición de certámenes para subir imágenes.</p>}

        {hasPhotoSlot && (
          <div className="space-y-2">
            <span className="block text-xs font-medium text-muted-foreground">Foto principal</span>
            <div className="flex flex-wrap items-center gap-2">
              {overrides.photoUrl && <Thumb src={overrides.photoUrl} onRemove={() => set({ photoUrl: undefined })} label="Quitar foto propia" />}
              {uploadButton('photo', overrides.photoUrl ? 'Cambiar foto' : 'Subir foto propia', photoInput)}
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Encuadre de la foto">
              {PHOTO_POSITIONS.map((position) => (
                <button
                  key={position}
                  type="button"
                  role="radio"
                  aria-checked={overrides.photoPosition === position}
                  onClick={() => set({ photoPosition: overrides.photoPosition === position ? undefined : position })}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs', overrides.photoPosition === position ? 'border-primary bg-primary/5 font-medium' : 'border-border text-muted-foreground')}
                >
                  {POSITION_LABELS[position]}
                </button>
              ))}
              <span className="self-center text-xs text-muted-foreground">Encuadre</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-xs font-medium text-muted-foreground">Logo (reemplaza la corona o va en la cabecera)</span>
          <div className="flex flex-wrap items-center gap-2">
            {overrides.logoUrl && <Thumb src={overrides.logoUrl} onRemove={() => set({ logoUrl: undefined })} label="Quitar logo" />}
            {uploadButton('logo', overrides.logoUrl ? 'Cambiar logo' : 'Subir logo', logoInput)}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-muted-foreground">
            Logos de auspiciadores ({overrides.sponsorLogos.length}/{MAX_SPONSOR_LOGOS})
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {overrides.sponsorLogos.map((src, index) => (
              <Thumb key={`${src}-${index}`} src={src} onRemove={() => set({ sponsorLogos: overrides.sponsorLogos.filter((_, i) => i !== index) })} label={`Quitar logo ${index + 1}`} />
            ))}
            {uploadButton('sponsors', 'Agregar logos', sponsorInput, overrides.sponsorLogos.length >= MAX_SPONSOR_LOGOS)}
          </div>
          <p className="text-xs text-muted-foreground">Mejor en PNG con fondo transparente. Van sobre una franja clara para que se lean en cualquier estilo.</p>
        </div>

        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload('photo', e.target.files).finally(() => (e.target.value = ''))} />
        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload('logo', e.target.files).finally(() => (e.target.value = ''))} />
        <input ref={sponsorInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => void upload('sponsors', e.target.files).finally(() => (e.target.value = ''))} />
      </Group>

      <Group title="Mostrar u ocultar">
        <div className="grid grid-cols-2 gap-2">
          {HIDE_LABELS.filter(({ key }) => key !== 'photo' || hasPhotoSlot).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={!hidden.has(key)} onChange={() => toggleHidden(key)} />
              {label}
            </label>
          ))}
        </div>
      </Group>
    </section>
  );
}
