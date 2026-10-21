'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-provider';
import { createPastWinnerAction, deletePastWinnerAction, updatePastWinnerAction } from '@/modules/projects/actions/past-winners.actions';
import { MAX_PAST_WINNERS, PAST_WINNER_TITLE_SUGGESTIONS } from '@/modules/projects/schema';

export interface PastWinnerRow {
  id: string;
  name: string;
  title: string;
  year: number | null;
  note: string | null;
  photoUrl: string;
  featured: boolean;
}

interface Draft {
  name: string;
  title: string;
  year: string;
  note: string;
  featured: boolean;
}

const EMPTY: Draft = { name: '', title: 'Ganadora', year: '', note: '', featured: false };
const LIST_ID = 'past-winner-titles';

function toInput(draft: Draft, photoUrl: string) {
  const year = draft.year.trim();
  return { name: draft.name, title: draft.title, year: year ? Number(year) : null, note: draft.note, featured: draft.featured, photoUrl };
}

/** Campos comunes (nombre, título del pie de foto, año, nota) de una ganadora nueva o existente. */
function Fields({ value, onChange, disabled, idPrefix }: { value: Draft; onChange: (next: Draft) => void; disabled?: boolean; idPrefix: string }) {
  const set = (key: 'name' | 'title' | 'year' | 'note') => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: event.target.value });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>Nombre</Label>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={set('name')} maxLength={120} placeholder="Ej. Camila Rojas" disabled={disabled} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-title`}>Título en el pie de foto</Label>
        <Input id={`${idPrefix}-title`} value={value.title} onChange={set('title')} maxLength={60} list={LIST_ID} placeholder="Ganadora, Virreina…" disabled={disabled} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-year`}>Año de la edición</Label>
        <Input id={`${idPrefix}-year`} value={value.year} onChange={set('year')} inputMode="numeric" maxLength={4} placeholder="2025" disabled={disabled} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-note`}>Detalle (opcional)</Label>
        <Input id={`${idPrefix}-note`} value={value.note} onChange={set('note')} maxLength={160} placeholder="Ej. Representó a Temuco" disabled={disabled} />
      </div>
      <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3 sm:col-span-2">
        <div>
          <p className="text-sm font-medium">Reciente · foto completa</p>
          <p className="text-xs text-muted-foreground">
            Actívalo para las ganadoras de la última edición: se muestran grandes, todas con el mismo formato. Si lo dejas apagado, aparece en el carrusel de &quot;Ediciones anteriores&quot;.
          </p>
        </div>
        <Switch checked={value.featured} onCheckedChange={(featured) => onChange({ ...value, featured })} label="Reciente, con foto completa" disabled={disabled} />
      </div>
    </div>
  );
}

async function uploadPhoto(projectId: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.append('projectId', projectId);
  form.append('purpose', 'winner');
  form.append('file', file);
  const res = await fetch('/api/projects/cover-upload', { method: 'POST', body: form });
  const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
  if (!json.success || !json.data) {
    toast.error(json.error ?? 'No se pudo subir la foto');
    return null;
  }
  return json.data.url;
}

function WinnerCard({ projectId, winner, canWrite }: { projectId: string; winner: PastWinnerRow; canWrite: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>({ name: winner.name, title: winner.title, year: winner.year ? String(winner.year) : '', note: winner.note ?? '', featured: winner.featured });
  const [photoUrl, setPhotoUrl] = useState(winner.photoUrl);
  const [busy, setBusy] = useState(false);
  const dirty = photoUrl !== winner.photoUrl || draft.name !== winner.name || draft.title !== winner.title || draft.year !== (winner.year ? String(winner.year) : '') || draft.note !== (winner.note ?? '') || draft.featured !== winner.featured;

  async function changePhoto(file: File) {
    setBusy(true);
    try {
      const url = await uploadPhoto(projectId, file);
      if (url) setPhotoUrl(url);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    setBusy(true);
    try {
      const result = await updatePastWinnerAction(projectId, winner.id, toInput(draft, photoUrl));
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Guardado');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: `¿Quitar a ${winner.name} del salón de la fama?`, description: 'Deja de mostrarse en el sitio público. La foto no se puede recuperar desde aquí.', confirmLabel: 'Quitar' });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await deletePastWinnerAction(projectId, winner.id);
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Eliminada');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row">
      <div className="flex shrink-0 flex-row items-start gap-3 sm:flex-col">
        <div className="aspect-[3/4] w-28 overflow-hidden rounded-md border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt={`Foto de ${winner.name}`} className="size-full object-cover object-top" loading="lazy" />
        </div>
        {canWrite && (
          <>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void changePhoto(e.target.files[0])} />
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus aria-hidden="true" />
              Cambiar foto
            </Button>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <Fields value={draft} onChange={setDraft} disabled={!canWrite || busy} idPrefix={`winner-${winner.id}`} />
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={!dirty || busy} onClick={save}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}>
              <Trash2 aria-hidden="true" />
              Quitar
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Salón de la fama del micrositio: fotos de ganadoras de ediciones anteriores
 * con su pie de foto (nombre, título y año). Lo que se carga acá se publica tal
 * cual en `/certamen/[slug]`; la más reciente queda destacada.
 */
export function PastWinnersEditor({ projectId, winners, canWrite }: { projectId: string; winners: PastWinnerRow[]; canWrite: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // La primera ganadora que se carga es, casi siempre, la reciente: parte encendido solo si todavía no hay ninguna.
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, featured: !winners.some((w) => w.featured) });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = winners.length >= MAX_PAST_WINNERS;

  function pick(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function add() {
    if (!file) return void toast.error('Sube la foto de la ganadora');
    setBusy(true);
    try {
      const url = await uploadPhoto(projectId, file);
      if (!url) return;
      const result = await createPastWinnerAction(projectId, toInput(draft, url));
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Ganadora agregada');
      setDraft({ ...EMPTY, featured: false });
      pick(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="past-winners-title">
      <datalist id={LIST_ID}>
        {PAST_WINNER_TITLE_SUGGESTIONS.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>
      <div>
        <h2 id="past-winners-title" className="text-base font-semibold">
          Salón de la fama · ganadoras anteriores
        </h2>
        <p className="text-xs text-muted-foreground">
          Fotos de ganadoras de ediciones pasadas, con pie de foto (nombre, título y año). Se publican en el sitio como &quot;Nuestras ganadoras&quot;: la edición más reciente va destacada y las demás en un carrusel.
          Sin fotos, la sección no aparece.
        </p>
      </div>

      {winners.length > 0 && (
        <ul className="space-y-3" aria-label="Ganadoras publicadas">
          {winners.map((winner) => (
            <WinnerCard key={`${winner.id}-${winner.photoUrl}-${winner.featured}`} projectId={projectId} winner={winner} canWrite={canWrite} />
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">Agregar ganadora</p>
          {full ? (
            <p className="text-xs text-muted-foreground">Llegaste al máximo de {MAX_PAST_WINNERS} fotos. Quita alguna para agregar otra.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex shrink-0 flex-row items-start gap-3 sm:flex-col">
                <div className="aspect-[3/4] w-28 overflow-hidden rounded-md border border-border bg-muted">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Vista previa de la foto" className="size-full object-cover object-top" />
                  ) : (
                    <span className="flex size-full items-center justify-center px-2 text-center text-xs text-muted-foreground">Foto vertical</span>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <ImagePlus aria-hidden="true" />
                  {file ? 'Cambiar foto' : 'Subir foto'}
                </Button>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <Fields value={draft} onChange={setDraft} disabled={busy} idPrefix="winner-new" />
                <Button type="button" size="sm" disabled={busy || !file || !draft.name.trim()} onClick={add}>
                  {busy ? 'Agregando…' : 'Agregar al salón de la fama'}
                </Button>
                <p className="text-xs text-muted-foreground">Mejor una foto vertical (retrato) de al menos 800 × 1067 px. JPG, PNG o WEBP de hasta 6 MB.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
