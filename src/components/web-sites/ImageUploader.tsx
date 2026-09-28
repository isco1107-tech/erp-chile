'use client';

import { useId, useState, type DragEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextField } from './fields';
import { ACCEPTED_IMAGE_ACCEPT, formatBytes, MAX_UPLOAD_BYTES, uploadWebSiteImage, type EditorAsset } from './editor-shared';

interface ImageUploaderProps {
  siteId: string;
  disabled?: boolean;
  /** Varias imágenes a la vez (biblioteca) o una sola (selector de un bloque). */
  multiple?: boolean;
  /** Pide una descripción antes de subir (solo tiene sentido con una imagen). */
  askAlt?: boolean;
  /** Se llama por cada imagen que quedó en la biblioteca. */
  onUploaded: (asset: EditorAsset) => void;
  /** Se llama al terminar el lote con las imágenes subidas (puede ir vacío). */
  onFinished?: (assets: EditorAsset[]) => void;
}

/** Zona de arrastrar-soltar y botón de archivos. Sube de a una, con progreso simple. */
export function ImageUploader({ siteId, disabled, multiple = true, askAlt = false, onUploaded, onFinished }: ImageUploaderProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [alt, setAlt] = useState('');
  const busy = progress !== null;

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0 || busy || disabled) return;
    const problems: string[] = [];
    const valid: File[] = [];
    for (const file of multiple ? files : files.slice(0, 1)) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) problems.push(`${file.name}: solo se aceptan imágenes JPG, PNG o WEBP.`);
      else if (file.size > MAX_UPLOAD_BYTES) problems.push(`${file.name}: pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(MAX_UPLOAD_BYTES)}. Reduce su tamaño e inténtalo de nuevo.`);
      else valid.push(file);
    }
    setErrors(problems);
    if (valid.length === 0) return;

    const uploaded: EditorAsset[] = [];
    setProgress({ done: 0, total: valid.length });
    for (const [index, file] of valid.entries()) {
      const outcome = await uploadWebSiteImage(siteId, file, askAlt ? alt : undefined);
      if (outcome.ok) {
        uploaded.push(outcome.asset);
        onUploaded(outcome.asset);
      } else {
        problems.push(outcome.error);
        setErrors([...problems]);
      }
      setProgress({ done: index + 1, total: valid.length });
    }
    setProgress(null);
    if (uploaded.length > 0) setAlt('');
    onFinished?.(uploaded);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      {askAlt ? (
        <TextField
          label="Descripción de la imagen"
          value={alt}
          onChange={setAlt}
          max={160}
          disabled={disabled || busy}
          placeholder="Ej.: Cocina blanca con isla de madera"
          hint="Describe lo que se ve. La leen los lectores de pantalla y ayuda a que te encuentren en Google. Puedes cambiarla después en la pestaña Imágenes."
        />
      ) : null}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted px-4 py-6 text-center text-sm transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
          dragging && 'border-ring bg-accent',
          (disabled || busy) && 'pointer-events-none opacity-60'
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" /> : <Upload className="size-5 text-muted-foreground" aria-hidden="true" />}
        <span className="font-medium text-foreground">{multiple ? 'Arrastra tus imágenes aquí o haz clic para elegirlas' : 'Arrastra una imagen aquí o haz clic para elegirla'}</span>
        <span className="text-xs text-muted-foreground">JPG, PNG o WEBP, hasta {formatBytes(MAX_UPLOAD_BYTES)} cada una.</span>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={ACCEPTED_IMAGE_ACCEPT}
          multiple={multiple}
          disabled={disabled || busy}
          onChange={(event) => {
            const picked = event.target.files;
            if (picked) void handleFiles(picked);
            event.target.value = '';
          }}
        />
      </label>
      {progress ? (
        <div role="status" className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Subiendo {Math.min(progress.done + 1, progress.total)} de {progress.total}…
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
