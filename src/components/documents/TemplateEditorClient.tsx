'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { DocumentTemplateType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTemplateAction, upsertTemplateAction } from '@/modules/documents/actions/document-template.actions';

interface Props {
  type: DocumentTemplateType;
  defaultName: string;
  variables: string[];
  previewHref?: string;
  /** Texto sugerido para precargar el editor cuando la empresa todavía no tiene una plantilla guardada — no se persiste solo, requiere que la directora revise y guarde. */
  suggestedBodyText?: string;
}

export default function TemplateEditorClient({ type, defaultName, variables, previewHref, suggestedBodyText }: Props) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(defaultName);
  const [bodyText, setBodyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);

  useEffect(() => {
    getTemplateAction(type).then((result) => {
      if (result.success && result.data) {
        setName(result.data.name);
        setBodyText(result.data.bodyText);
        setHasTemplate(true);
      } else if (suggestedBodyText) {
        setBodyText(suggestedBodyText);
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function handleSave() {
    if (!bodyText.trim()) {
      toast.error('Escribe el contenido de la plantilla');
      return;
    }
    setSaving(true);
    try {
      const result = await upsertTemplateAction({ type, name, bodyText });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setHasTemplate(true);
      toast.success('Plantilla guardada');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      {!hasTemplate && suggestedBodyText && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          Precargamos un borrador sugerido con los campos entre corchetes [ ] sin completar. Revísalo, complétalo y hazlo revisar por un abogado antes de
          guardarlo — no se usa hasta que le des a "Guardar plantilla".
        </div>
      )}
      <div>
        <Label htmlFor="template-name">Nombre de la plantilla</Label>
        <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="template-body">Contenido</Label>
        <textarea
          id="template-body"
          className="min-h-[280px] w-full rounded-xl border border-input bg-muted px-3 py-2 font-mono text-xs text-foreground sm:min-h-[500px]"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Escribe el texto del documento. Usa las variables de abajo entre llaves dobles, ej: {{sponsorName}}"
        />
      </div>
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-semibold">Variables disponibles:</p>
        <p className="font-mono">{variables.map((v) => `{{${v}}}`).join('  ')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar plantilla'}
        </Button>
        {hasTemplate && previewHref && (
          <a href={previewHref} className="text-sm text-primary hover:underline" target="_blank" rel="noreferrer">
            Vista previa (con el primer registro disponible)
          </a>
        )}
      </div>
    </div>
  );
}
