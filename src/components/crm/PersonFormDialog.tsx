'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { textareaClass } from '@/components/ui/field-classes';
import { ContactSearchSelect, type ContactOption } from '@/components/shared/ContactSearchSelect';
import { createPersonAction, updatePersonAction } from '@/modules/crm/actions/crm.actions';
import { TagInput } from './TagInput';

export interface PersonFormValues {
  id?: string;
  fullName: string;
  jobTitle: string;
  contact: ContactOption | null;
  organizationName: string;
  email: string;
  phone: string;
  instagram: string;
  linkedinUrl: string;
  isDecisionMaker: boolean;
  tags: string[];
  notes: string;
}

export const EMPTY_PERSON: PersonFormValues = {
  fullName: '',
  jobTitle: '',
  contact: null,
  organizationName: '',
  email: '',
  phone: '',
  instagram: '',
  linkedinUrl: '',
  isDecisionMaker: false,
  tags: [],
  notes: '',
};

export function PersonFormDialog({
  open,
  onOpenChange,
  initial,
  tagSuggestions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PersonFormValues;
  tagSuggestions: string[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial.id);
  const set = <K extends keyof PersonFormValues>(key: K, value: PersonFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        fullName: values.fullName,
        jobTitle: values.jobTitle,
        contactId: values.contact?.id ?? '',
        organizationName: values.contact ? '' : values.organizationName,
        email: values.email,
        phone: values.phone,
        instagram: values.instagram,
        linkedinUrl: values.linkedinUrl,
        isDecisionMaker: values.isDecisionMaker,
        tags: values.tags,
        notes: values.notes,
      };
      const result = editing ? await updatePersonAction(initial.id as string, payload) : await createPersonAction(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar contacto' : 'Nuevo contacto comercial'}</DialogTitle>
          <DialogDescription>La persona con la que conversas: gerente de marketing de una marca, agencia de medios, productor de un evento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="person-name">Nombre completo</Label>
              <Input id="person-name" value={values.fullName} onChange={(e) => set('fullName', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="person-title">Cargo</Label>
              <Input id="person-title" value={values.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Gerente de marketing" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="person-contact">Empresa con ficha</Label>
              <ContactSearchSelect id="person-contact" value={values.contact} onChange={(c) => set('contact', c)} />
            </div>
            {!values.contact && (
              <div>
                <Label htmlFor="person-org">O nombre de la empresa</Label>
                <Input id="person-org" value={values.organizationName} onChange={(e) => set('organizationName', e.target.value)} placeholder="Marca o agencia" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="person-email">Correo</Label>
              <Input id="person-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="person-phone">Teléfono / WhatsApp</Label>
              <Input id="person-phone" value={values.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+56 9 …" />
            </div>
            <div>
              <Label htmlFor="person-ig">Instagram</Label>
              <Input id="person-ig" value={values.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@usuario" />
            </div>
            <div>
              <Label htmlFor="person-li">LinkedIn</Label>
              <Input id="person-li" value={values.linkedinUrl} onChange={(e) => set('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/…" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Toma la decisión</p>
              <p className="text-xs text-muted-foreground">Quien aprueba el presupuesto (no solo quien conversa).</p>
            </div>
            <Switch checked={values.isDecisionMaker} onCheckedChange={(v) => set('isDecisionMaker', v)} label="Toma la decisión" />
          </div>
          <div>
            <Label htmlFor="person-tags">Etiquetas</Label>
            <TagInput id="person-tags" value={values.tags} onChange={(tags) => set('tags', tags)} suggestions={tagSuggestions} />
          </div>
          <div>
            <Label htmlFor="person-notes">Notas</Label>
            <textarea id="person-notes" className={textareaClass} value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Intereses, cumpleaños, cómo prefiere que lo contacten…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear contacto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
