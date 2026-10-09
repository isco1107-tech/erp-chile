'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ExternalLink, File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, Link2, Mail, Presentation, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import { MATERIAL_ACCEPT, MATERIAL_MAX_BYTES, MATERIAL_TYPES_HINT, formatBytes } from '@/lib/academy/materials';
import { addMaterialLinkAction, deleteMaterialAction, getMaterialRecipientsAction, listMaterialsAction, sendMaterialAction } from '@/modules/academy/actions/academy-class.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import type { MaterialRecipients, MaterialRow, SendMaterialResult } from '@/modules/academy/services/academy-material.service';
import { fieldClass } from './shared';

interface MaterialsPanelProps {
  canWrite: boolean;
  groups: GroupRow[];
  /** Grupo fijo (dentro de una clase). `null` = se elige en el formulario y se listan todos. */
  groupId: string | null;
  /** Clase a la que se atan los materiales nuevos (opcional). */
  sessionId?: string;
  /** Avisa que cambió la cantidad de materiales (para refrescar el calendario). */
  onChanged?: () => void;
}

type Mode = 'FILE' | 'LINK';

function iconFor(material: MaterialRow) {
  if (material.kind === 'LINK') return Link2;
  switch (material.typeLabel) {
    case 'PDF':
    case 'Word':
    case 'Documento':
      return FileText;
    case 'PowerPoint':
    case 'Presentación':
      return Presentation;
    case 'Excel':
    case 'Planilla':
      return FileSpreadsheet;
    case 'Imagen':
      return ImageIcon;
    default:
      return FileIcon;
  }
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

/** Resumen de un envío, para el aviso que ve quien lo hizo. */
function describeSend(result: SendMaterialResult): string {
  const parts = [`Enviado a ${result.sent} ${result.sent === 1 ? 'correo' : 'correos'}`];
  if (result.failed > 0) parts.push(`${result.failed} no salieron`);
  if (result.withoutEmail.length > 0) parts.push(`${result.withoutEmail.length} ${result.withoutEmail.length === 1 ? 'alumna sin correo' : 'alumnas sin correo'}`);
  return parts.join(' · ');
}

/**
 * Material de estudio: subir un archivo (o pegar un enlace), enviarlo por correo
 * a las alumnas del grupo y a sus apoderados, y ver qué se ha compartido.
 * Se usa dentro de cada clase del calendario y en la pestaña «Material».
 */
export default function MaterialsPanel({ canWrite, groups, groupId: fixedGroupId, sessionId, onChanged }: MaterialsPanelProps) {
  const confirm = useConfirm();
  const activeGroups = groups.filter((g) => g.isActive);
  const [filterGroup, setFilterGroup] = useState('');
  const [items, setItems] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>('FILE');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [formGroup, setFormGroup] = useState(fixedGroupId ?? activeGroups[0]?.id ?? '');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  // Con material ya cargado, el formulario se esconde detrás de «Agregar material» para ver primero lo que hay.
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const [recipients, setRecipients] = useState<MaterialRecipients | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const targetGroup = fixedGroupId ?? formGroup;
  const listGroup = fixedGroupId ?? filterGroup;

  const load = useCallback(async () => {
    const result = await listMaterialsAction({ groupId: listGroup || undefined, sessionId });
    setLoading(false);
    if (!result.success) return void toast.error(result.error);
    setItems(result.data);
  }, [listGroup, sessionId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Cuántos correos recibirían el material del grupo elegido (y quién se queda sin él).
  useEffect(() => {
    if (!targetGroup || !canWrite) return;
    let active = true;
    void getMaterialRecipientsAction(targetGroup).then((result) => {
      if (active) setRecipients(result.success ? result.data : null);
    });
    return () => {
      active = false;
    };
  }, [targetGroup, canWrite]);

  function pick(next: File | null) {
    if (!next) return;
    if (next.size > MATERIAL_MAX_BYTES) {
      toast.error(`El archivo pesa ${formatBytes(next.size)} y el máximo es ${formatBytes(MATERIAL_MAX_BYTES)}. Si es más grande, súbelo a Drive u OneDrive y agrégalo como enlace.`);
      return;
    }
    setFile(next);
    setTitle((current) => current || next.name.replace(/\.[^.]+$/, ''));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (canWrite) pick(event.dataTransfer.files[0] ?? null);
  }

  function reset() {
    setFile(null);
    setTitle('');
    setDescription('');
    setUrl('');
    if (input.current) input.current.value = '';
  }

  function announceSend(result: SendMaterialResult | null, error: string | null) {
    if (result) toast.success(describeSend(result));
    if (error) toast.error(`El material quedó guardado, pero no se envió: ${error}`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!targetGroup) return void toast.error('Elige un grupo');
    setBusy(true);
    try {
      if (mode === 'FILE') {
        if (!file) return void toast.error('Elige un archivo');
        const body = new FormData();
        body.set('file', file);
        body.set('groupId', targetGroup);
        if (sessionId) body.set('sessionId', sessionId);
        body.set('title', title);
        body.set('description', description);
        body.set('send', send ? '1' : '0');
        const response = await fetch('/api/academy/material-upload', { method: 'POST', body });
        const json = (await response.json().catch(() => null)) as { success: boolean; error?: string; data?: { send: SendMaterialResult | null; sendError: string | null } } | null;
        if (!json) return void toast.error(response.status === 413 ? `El archivo es demasiado grande (máximo ${formatBytes(MATERIAL_MAX_BYTES)}).` : 'No se pudo subir el archivo. Intenta de nuevo');
        if (!json.success || !json.data) return void toast.error(json.error ?? 'No se pudo subir el archivo');
        toast.success('Archivo subido');
        announceSend(json.data.send, json.data.sendError);
      } else {
        const result = await addMaterialLinkAction({ groupId: targetGroup, sessionId: sessionId ?? null, title, description, url, send });
        if (!result.success) return void toast.error(result.error);
        toast.success(result.message ?? 'Enlace guardado');
        announceSend(result.data.send, result.data.sendError);
      }
      reset();
      setFormOpen(false);
      await load();
      onChanged?.();
    } catch {
      toast.error('No se pudo completar la subida. Revisa tu conexión e intenta de nuevo');
    } finally {
      setBusy(false);
    }
  }

  async function resend(material: MaterialRow) {
    const already = material.lastSentAt ? ` Ya se envió el ${dayLabel(material.lastSentAt)} a ${material.lastSentCount} ${material.lastSentCount === 1 ? 'correo' : 'correos'}.` : '';
    const ok = await confirm({
      title: material.lastSentAt ? '¿Reenviar este material?' : '¿Enviar este material por correo?',
      description: `Llegará a las alumnas activas de ${material.groupName} y a sus apoderados.${already}`,
      confirmLabel: material.lastSentAt ? 'Reenviar' : 'Enviar',
      destructive: false,
    });
    if (!ok) return;
    setSendingId(material.id);
    const result = await sendMaterialAction(material.id);
    setSendingId(null);
    if (!result.success) return void toast.error(result.error);
    toast.success(describeSend(result.data));
    await load();
  }

  async function remove(material: MaterialRow) {
    const ok = await confirm({
      title: '¿Eliminar este material?',
      description: material.kind === 'FILE' ? 'El archivo se borra y los enlaces que ya se enviaron por correo dejan de abrir.' : 'Se quita de la lista. El enlace externo no se borra.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const result = await deleteMaterialAction(material.id);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Material eliminado');
    await load();
    onChanged?.();
  }

  const formVisible = canWrite && !loading && (formOpen ?? items.length === 0);
  const recipientCount = recipients?.emailCount ?? 0;
  const submitLabel = busy ? 'Subiendo…' : send ? (recipientCount > 0 ? `${mode === 'FILE' ? 'Subir' : 'Guardar'} y enviar a ${recipientCount} ${recipientCount === 1 ? 'correo' : 'correos'}` : `${mode === 'FILE' ? 'Subir' : 'Guardar'} y enviar`) : mode === 'FILE' ? 'Subir sin enviar' : 'Guardar sin enviar';

  return (
    <div className="space-y-4">
      {canWrite && !loading && !formVisible && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setFormOpen(true)}><Upload aria-hidden="true" /> Agregar material</Button>
        </div>
      )}
      {formVisible && (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div role="tablist" aria-label="Tipo de material" className="inline-flex rounded-md bg-muted p-0.5">
            {([['FILE', 'Subir archivo'], ['LINK', 'Pegar enlace']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', mode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'FILE' ? (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors', dragging ? 'border-primary bg-accent' : 'border-border bg-muted/40')}
            >
              <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
              {file ? (
                <p className="text-sm font-medium">{file.name} <span className="font-normal text-muted-foreground">· {formatBytes(file.size)}</span></p>
              ) : (
                <p className="text-sm text-muted-foreground">Arrastra un archivo aquí o</p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>{file ? 'Cambiar archivo' : 'Elegir archivo'}</Button>
              <input ref={input} type="file" accept={MATERIAL_ACCEPT} className="sr-only" aria-label="Archivo del material" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">{MATERIAL_TYPES_HINT}. Hasta {formatBytes(MATERIAL_MAX_BYTES)}; si pesa más, pega un enlace.</p>
            </div>
          ) : (
            <label className="block space-y-1 text-sm font-medium">Enlace (Drive, OneDrive, YouTube…)
              <Input type="url" inputMode="url" placeholder="https://drive.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={500} />
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Título
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required={mode === 'LINK'} placeholder={mode === 'FILE' ? 'Si lo dejas vacío, usa el nombre del archivo' : 'Ej. Video de la pasarela'} />
            </label>
            {fixedGroupId === null && (
              <label className="space-y-1 text-sm font-medium">Grupo
                <select className={fieldClass} value={formGroup} onChange={(e) => setFormGroup(e.target.value)} required>
                  {activeGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="block space-y-1 text-sm font-medium">Mensaje para las alumnas (opcional)
            <textarea className={cn(fieldClass, 'min-h-16')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Ej. Repasa las diapositivas antes de la próxima clase." />
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={send} onChange={(e) => setSend(e.target.checked)} />
            <span>
              <span className="font-medium">Enviar por correo a las alumnas del grupo</span>
              <span className="block text-xs text-muted-foreground">
                {recipients
                  ? `Llega a ${recipientCount} ${recipientCount === 1 ? 'correo' : 'correos'} (alumnas activas y sus apoderados).`
                  : 'Llega a las alumnas activas del grupo y a sus apoderados.'}
              </span>
            </span>
          </label>
          {send && recipients && recipients.withoutEmail.length > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {recipients.withoutEmail.length === 1 ? '1 alumna no tiene correo y no lo recibirá' : `${recipients.withoutEmail.length} alumnas no tienen correo y no lo recibirán`}: {recipients.withoutEmail.slice(0, 5).join(', ')}
                {recipients.withoutEmail.length > 5 ? '…' : ''}. Agrégalo en su ficha.
              </span>
            </p>
          )}
          {send && recipients && recipients.emailCount === 0 && recipients.students > 0 && (
            <p className="text-xs text-warning">Ninguna alumna de este grupo tiene correo: el material se guardará pero no habrá a quién enviarlo.</p>
          )}

          <div className="flex justify-end gap-2">
            {items.length > 0 && <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancelar</Button>}
            <Button type="submit" disabled={busy || !targetGroup || (mode === 'FILE' && !file) || (mode === 'LINK' && !url.trim())}>
              <Mail aria-hidden="true" /> {submitLabel}
            </Button>
          </div>
        </form>
      )}

      {fixedGroupId === null && activeGroups.length > 0 && (
        <label className="flex items-center gap-2 text-sm font-medium">Ver material de
          <select className={cn(fieldClass, 'w-auto')} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <EmptyState title="Aún no hay material" description={sessionId ? 'Sube la presentación o el documento de esta clase y llega al correo de las alumnas.' : 'Sube documentos, presentaciones o enlaces y envíalos al correo de las alumnas de cada grupo.'} />
        </section>
      ) : (
        <ul className="space-y-2" aria-label="Material">
          {items.map((material) => {
            const Icon = iconFor(material);
            return (
              <li key={material.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-words text-sm font-semibold">{material.title}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {[material.typeLabel, material.sizeBytes ? formatBytes(material.sizeBytes) : null, material.fileName, fixedGroupId === null ? material.groupName : null].filter(Boolean).join(' · ')}
                  </p>
                  {material.description && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{material.description}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {material.sessionLabel && !sessionId && <StatusBadge tone="info">Clase: {material.sessionLabel}</StatusBadge>}
                    {material.lastSentAt ? (
                      <StatusBadge tone="success">Enviado el {dayLabel(material.lastSentAt)} · {material.lastSentCount} {material.lastSentCount === 1 ? 'correo' : 'correos'}</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Aún no enviado</StatusBadge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <a href={material.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-[0.8rem] font-medium hover:bg-muted">
                    <ExternalLink className="size-3.5" aria-hidden="true" /> Abrir
                  </a>
                  {canWrite && (
                    <>
                      <Button type="button" size="sm" variant="outline" disabled={sendingId === material.id} onClick={() => void resend(material)}>
                        <Mail aria-hidden="true" /> {sendingId === material.id ? 'Enviando…' : material.lastSentAt ? 'Reenviar' : 'Enviar por correo'}
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar ${material.title}`} onClick={() => void remove(material)}><Trash2 aria-hidden="true" /></Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
