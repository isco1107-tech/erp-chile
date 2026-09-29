'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { BadgeDollarSign, BriefcaseBusiness, CircleHelp, FilePlus, Heart, Images, Mail, Users, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PAGE_TEMPLATES, type PageTemplate } from '@/lib/web-sites/page-templates';
import { MAX_PAGES, type SiteDocument } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';
import { TextField } from './fields';
import { addPageFromTemplate, type AddedPage } from './pages-logic';

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  blank: FilePlus,
  about: Heart,
  services: BriefcaseBusiness,
  pricing: BadgeDollarSign,
  portfolio: Images,
  team: Users,
  faq: CircleHelp,
  contact: Mail,
};

interface AddPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: SiteDocument;
  onDocumentChange: (updater: (previous: SiteDocument) => SiteDocument) => void;
  /** Se agregó la página: quien abre el diálogo decide qué hacer (seleccionarla, ir a Contenido…). */
  onAdded: (pageId: string) => void;
}

function AddPageForm({ document, onDocumentChange, onAdded, onClose }: Omit<AddPageDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const nameId = useId();
  const [templateId, setTemplateId] = useState<string>(PAGE_TEMPLATES[0]?.id ?? 'blank');
  const [name, setName] = useState(PAGE_TEMPLATES[0]?.title ?? 'Página nueva');
  const nameTouched = useRef(false);
  const atMax = document.pages.length >= MAX_PAGES;
  const template: PageTemplate = PAGE_TEMPLATES.find((item) => item.id === templateId) ?? PAGE_TEMPLATES[0]!;

  function pick(next: PageTemplate) {
    setTemplateId(next.id);
    // Mientras el nombre sea el de la plantilla anterior, sigue a la que elijas.
    if (!nameTouched.current) setName(next.title);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (atMax) return;
    const title = name.trim();
    if (!title) {
      toast.error('Ponle un nombre a la página, por ejemplo «Servicios».');
      return;
    }
    // El editor aplica el cambio de inmediato sobre lo último que hay: aquí solo se recoge lo que salió.
    const out: { added: AddedPage | null } = { added: null };
    onDocumentChange((previous) => {
      const added = addPageFromTemplate(previous, template, title);
      if (!added) return previous;
      out.added = added;
      return added.doc;
    });
    const added = out.added;
    if (!added) {
      toast.error(`Un sitio puede tener hasta ${MAX_PAGES} páginas. Elimina alguna que no uses para agregar otra.`);
      return;
    }
    const notes: string[] = [];
    if (added.linkedButtons > 0) notes.push(`Sus botones ya llevan a ${added.target.startsWith('page:') ? 'tu sección de contacto' : 'tu WhatsApp'}. Puedes cambiarlos cuando quieras.`);
    if (added.unlinkedButtons > 0) notes.push(`${added.unlinkedButtons === 1 ? 'Un botón quedó' : `${added.unlinkedButtons} botones quedaron`} sin enlace: tu sitio aún no tiene sección de contacto ni WhatsApp. Elige a dónde llevan en cada sección.`);
    toast.success(`Página «${added.page.title}» agregada`, notes.length > 0 ? { description: notes.join(' '), duration: 7000 } : undefined);
    onAdded(added.page.id);
    onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader className="mb-0">
        <DialogTitle>Agregar una página</DialogTitle>
        <DialogDescription>Elige un punto de partida. Trae textos de ejemplo que dicen qué escribir, y puedes cambiar todo después. La página aparecerá en tu menú automáticamente.</DialogDescription>
      </DialogHeader>

      {atMax ? (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Tu sitio ya tiene {MAX_PAGES} páginas, que es el máximo. Elimina alguna que no uses para poder agregar otra.
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Qué tipo de página quieres?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAGE_TEMPLATES.map((item) => {
            const Icon = TEMPLATE_ICONS[item.id] ?? FilePlus;
            const selected = item.id === templateId;
            return (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  selected ? 'border-ring bg-accent' : 'border-border hover:bg-muted'
                )}
              >
                <input type="radio" className="sr-only" name={`${nameId}-template`} value={item.id} checked={selected} onChange={() => pick(item)} />
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', selected ? 'bg-card text-foreground' : 'bg-muted text-muted-foreground')} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <TextField
        label="Nombre de la página"
        value={name}
        max={60}
        placeholder="Ej.: Servicios"
        hint="Es lo que se ve en el menú y en la pestaña del navegador."
        onChange={(value) => {
          nameTouched.current = true;
          setName(value);
        }}
      />

      <DialogFooter className="mt-0 flex-wrap">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={atMax}>
          Agregar página
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Diálogo para agregar una página desde una plantilla. Su estado se reinicia cada vez que se abre. */
export function AddPageDialog({ open, onOpenChange, document, onDocumentChange, onAdded }: AddPageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <AddPageForm document={document} onDocumentChange={onDocumentChange} onAdded={onAdded} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
