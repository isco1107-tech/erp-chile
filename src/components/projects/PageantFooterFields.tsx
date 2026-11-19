'use client';

import { ListEditor } from '@/components/web-sites/ListEditor';
import { SwitchRow, TextField } from '@/components/web-sites/fields';
import type { PageantFooter } from '@/lib/events/pageant-site-design';
import { MAX_FOOTER_LINKS } from '@/lib/web-sites/site';
import { safeHref } from '@/lib/web-sites/urls';

interface Props {
  value: PageantFooter;
  disabled: boolean;
  onChange: (footer: PageantFooter) => void;
}

export function PageantFooterFields({ value, disabled, onChange }: Props) {
  const set = (patch: Partial<PageantFooter>) => onChange({ ...value, ...patch });

  return (
    <section className="@container space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="pageant-footer-title">
      <h2 id="pageant-footer-title" className="text-base font-semibold">Pie de página</h2>
      <TextField label="Título del pie" value={value.title} max={120} disabled={disabled} onChange={(title) => set({ title })} placeholder="Nombre del certamen" />
      <TextField label="Descripción del pie" value={value.description} max={300} disabled={disabled} onChange={(description) => set({ description })} multiline />
      <TextField label="Texto de derechos" value={value.copyright} max={200} disabled={disabled} onChange={(copyright) => set({ copyright })} placeholder="© Año y nombre del certamen" />
      <SwitchRow label="Mostrar enlaces a las secciones" checked={value.showMenu} disabled={disabled} onChange={(showMenu) => set({ showMenu })} />
      <SwitchRow label="Mostrar contacto y redes sociales" checked={value.showContact} disabled={disabled} onChange={(showContact) => set({ showContact })} />
      <ListEditor
        idPrefix="pageant-footer-link"
        noun="enlace"
        items={value.links}
        max={MAX_FOOTER_LINKS}
        disabled={disabled}
        addLabel="Agregar enlace al pie"
        createItem={() => ({ id: crypto.randomUUID(), label: '', href: '', newTab: false })}
        cloneItem={(link) => ({ ...link, id: crypto.randomUUID() })}
        onChange={(links) => set({ links })}
        summary={(link) => link.label}
        renderItem={(link, update) => (
          <div className="space-y-3">
            <div className="grid gap-3 @md:grid-cols-2">
              <TextField label="Texto del enlace" value={link.label} max={40} disabled={disabled} onChange={(label) => update({ label })} />
              <TextField label="Dirección del enlace" value={link.href} max={500} disabled={disabled} onChange={(href) => update({ href })} placeholder="https://ejemplo.cl" error={link.href.trim() && !safeHref(link.href) ? 'Escribe una dirección válida.' : undefined} />
            </div>
            <SwitchRow label="Abrir en otra pestaña" checked={link.newTab} disabled={disabled} onChange={(newTab) => update({ newTab })} />
          </div>
        )}
      />
    </section>
  );
}
