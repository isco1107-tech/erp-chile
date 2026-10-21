'use client';

import { ArrowRight, ClipboardList, Inbox, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DESTINATION_INFO, FORM_DESTINATIONS, formProblems, PURPOSE_LABELS, ROLE_INFO, type DataRole, type FormDestinationAccess } from '@/lib/web-sites/forms';
import { siteForms } from '@/lib/web-sites/site-forms';
import type { SiteDocument } from '@/lib/web-sites/site';

/**
 * «Formularios» del editor: todos los formularios del sitio en un solo lugar,
 * con la categoría del ERP a la que tributa cada uno, la ruta exacta donde
 * quedan sus datos y lo que le falta. Desde acá se salta a editarlo o a ver
 * sus envíos.
 */

interface SiteFormsPanelProps {
  document: SiteDocument;
  access: FormDestinationAccess;
  readOnly: boolean;
  onEdit: (pageId: string, blockId: string) => void;
  onSeeMessages: (blockId: string) => void;
  onAdd: () => void;
}

export function SiteFormsPanel({ document, access, readOnly, onEdit, onSeeMessages, onAdd }: SiteFormsPanelProps) {
  const forms = siteForms(document);
  const features = Object.fromEntries(FORM_DESTINATIONS.flatMap((key) => (DESTINATION_INFO[key].feature ? [[DESTINATION_INFO[key].feature, access[key].enabled]] : [])));
  const byArea = new Map<string, number>();
  for (const form of forms.filter((entry) => !entry.hidden)) {
    const area = access[form.destination].enabled ? DESTINATION_INFO[form.destination].area : DESTINATION_INFO.inbox.area;
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }

  return (
    <section className="space-y-4" aria-label="Formularios del sitio">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" /> Formularios del sitio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Cada formulario dice a qué parte del ERP tributa y dónde quedan sus datos. Todo envío queda además en «Mensajes».</p>
          {byArea.size > 0 ? (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {[...byArea.entries()].map(([area, count]) => (
                <StatusBadge key={area} tone="info">
                  {area}: {count}
                </StatusBadge>
              ))}
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <Button type="button" onClick={onAdd}>
            <Plus aria-hidden="true" /> Agregar formulario
          </Button>
        ) : null}
      </div>

      {forms.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title="Este sitio todavía no tiene formularios"
          description="Agrega uno para recibir contactos, cotizaciones, inscripciones o reservas, y elige a qué parte del ERP llega cada envío: CRM, academia o tareas del equipo."
          actionLabel={readOnly ? undefined : 'Agregar formulario'}
          onAction={readOnly ? undefined : onAdd}
        />
      ) : (
        <ul className="grid gap-3">
          {forms.map((form) => {
            const info = DESTINATION_INFO[form.destination];
            const enabled = access[form.destination].enabled;
            const problems = formProblems(form, features);
            const blocking = problems.filter((problem) => problem.blocking);
            const mapped = form.fields.filter((field) => field.role);
            return (
              <li key={form.blockId} className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">{form.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Página «{form.pageTitle}»</span>
                      <span aria-hidden="true">·</span>
                      <span>{form.source === 'contact' ? 'Formulario de «Contacto»' : 'Sección «Formulario»'}</span>
                      <StatusBadge tone="neutral">{PURPOSE_LABELS[form.purpose]}</StatusBadge>
                      {form.tag ? <StatusBadge tone="accent">{form.tag}</StatusBadge> : null}
                      {form.hidden ? <StatusBadge tone="warning">Oculto: no se publica</StatusBadge> : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(form.pageId, form.blockId)}>
                      <Pencil aria-hidden="true" /> Editar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => onSeeMessages(form.blockId)}>
                      <Inbox aria-hidden="true" /> Ver envíos
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Tributa a</p>
                    <p className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={form.destination === 'inbox' ? 'neutral' : 'info'}>{info.area}</StatusBadge>
                      <span className="font-medium">{info.label}</span>
                    </p>
                    {!enabled ? <p className="mt-1 text-xs text-warning">Tu plan no incluye {info.area}: por ahora queda solo en la bandeja.</p> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Dónde quedan los datos</p>
                    <p className="flex items-start gap-1.5">
                      <Inbox className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> {DESTINATION_INFO.inbox.where}
                    </p>
                    {form.destination !== 'inbox' && enabled ? (
                      <p className="flex items-start gap-1.5">
                        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" /> {info.where}
                      </p>
                    ) : null}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {form.fields.length} pregunta{form.fields.length === 1 ? '' : 's'}
                  {mapped.length > 0 ? ` · guarda ${mapped.map((field) => ROLE_INFO[field.role as DataRole].label.toLowerCase()).join(', ')}` : ''}
                </p>

                {problems.length > 0 ? (
                  <ul className="space-y-1">
                    {problems.map((problem) => (
                      <li key={problem.message} className={problem.blocking ? 'text-xs text-danger' : 'text-xs text-warning'}>
                        • El formulario {problem.message}.
                      </li>
                    ))}
                  </ul>
                ) : null}
                {blocking.length === 0 && !form.hidden ? <p className="text-xs text-success">Listo para publicar.</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
