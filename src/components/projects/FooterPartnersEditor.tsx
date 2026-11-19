'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_FOOTER_PARTNERS_TITLE, MAX_FOOTER_PARTNERS, normalizePartnerLink, partnerLinkLabel } from '@/lib/events/pageant-partners';

/** Lo que edita el formulario: el enlace queda como lo escribió la persona y se normaliza al guardar. */
export interface FooterPartnerDraft {
  id: string;
  name: string;
  logoUrl: string;
  href: string;
}

export interface FooterPartnersDraft {
  title: string;
  items: FooterPartnerDraft[];
}

/**
 * Logos del pie de página del micrositio (organizadores e instituciones que
 * apoyan, como una municipalidad), cada uno con un enlace opcional que se abre
 * al tocar el logo. Las imágenes se suben a `pageant-partners/{companyId}/`.
 */
export function FooterPartnersEditor({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  value: FooterPartnersDraft;
  onChange: (next: FooterPartnersDraft) => void;
  disabled: boolean;
}) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string | null>(null);

  const update = (id: string, patch: Partial<FooterPartnerDraft>) => onChange({ ...value, items: value.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const remove = (id: string) => onChange({ ...value, items: value.items.filter((item) => item.id !== id) });
  const move = (index: number, delta: -1 | 1) => {
    const items = [...value.items];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    onChange({ ...value, items });
  };

  function pickFile(id: string | null) {
    targetRef.current = id;
    fileRef.current?.click();
  }

  async function upload(file: File) {
    const id = targetRef.current;
    setUploadingId(id ?? 'new');
    try {
      const form = new FormData();
      form.append('projectId', projectId);
      form.append('purpose', 'partner');
      form.append('file', file);
      const res = await fetch('/api/projects/cover-upload', { method: 'POST', body: form });
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'No se pudo subir el logo');
        return;
      }
      if (id) update(id, { logoUrl: json.data.url });
      else onChange({ ...value, items: [...value.items, { id: crypto.randomUUID().slice(0, 12), name: '', logoUrl: json.data.url, href: '' }] });
      toast.success('Logo cargado: escribe el nombre y guarda para publicarlo');
    } finally {
      setUploadingId(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const full = value.items.length >= MAX_FOOTER_PARTNERS;

  return (
    <section className="@container space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
      <div>
        <h2 className="text-base font-semibold">Logos en el pie de página</h2>
        <p className="text-xs text-muted-foreground">
          Organizadores e instituciones que apoyan, como la municipalidad. Al tocar un logo se abre su enlace (Instagram o sitio web). Hasta {MAX_FOOTER_PARTNERS} logos; sin logos, la franja no aparece.
        </p>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />

      <div>
        <Label htmlFor="partners-title">Título sobre los logos</Label>
        <Input id="partners-title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder={DEFAULT_FOOTER_PARTNERS_TITLE} maxLength={60} disabled={disabled} />
        <p className="mt-1 text-xs text-muted-foreground">Vacío = «{DEFAULT_FOOTER_PARTNERS_TITLE}». Por ejemplo: «Organizan», «Patrocina».</p>
      </div>

      {value.items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {value.items.map((item, index) => {
            const link = normalizePartnerLink(item.href);
            return (
              <li key={item.id} className="grid grid-cols-1 gap-3 p-3 @lg:grid-cols-[8rem_minmax(0,1fr)_auto] @lg:items-start">
                <div className="flex h-16 w-32 items-center justify-center rounded-md border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.logoUrl} alt={item.name || 'Logo'} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-2 @2xl:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor={`partner-name-${item.id}`}>Nombre</Label>
                    <Input id={`partner-name-${item.id}`} value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} placeholder="Municipalidad de Temuco" maxLength={80} disabled={disabled} />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor={`partner-href-${item.id}`}>Enlace al tocar el logo</Label>
                    <Input id={`partner-href-${item.id}`} value={item.href} onChange={(e) => update(item.id, { href: e.target.value })} placeholder="@cuenta o www.sitio.cl" maxLength={300} disabled={disabled} />
                    <p className={`mt-1 text-xs ${link === undefined ? 'text-danger' : 'text-muted-foreground'}`}>
                      {link === undefined ? 'Escribe una cuenta de Instagram (@cuenta) o una dirección web.' : link ? `Abre ${partnerLinkLabel(link)}` : 'Sin enlace: el logo no se puede tocar.'}
                    </p>
                  </div>
                </div>
                {!disabled && (
                  <div className="flex flex-wrap gap-1 @lg:flex-col">
                    <Button type="button" size="sm" variant="outline" disabled={uploadingId !== null} onClick={() => pickFile(item.id)}>
                      <ImagePlus aria-hidden="true" />
                      {uploadingId === item.id ? 'Subiendo…' : 'Cambiar logo'}
                    </Button>
                    <div className="flex gap-1">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Bajar" disabled={index === value.items.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${item.name || 'logo'}`} onClick={() => remove(item.id)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={full || uploadingId !== null} onClick={() => pickFile(null)}>
            <Plus aria-hidden="true" />
            {uploadingId === 'new' ? 'Subiendo…' : 'Agregar logo'}
          </Button>
          <p className="text-xs text-muted-foreground">{full ? `Llegaste al máximo de ${MAX_FOOTER_PARTNERS} logos.` : 'PNG con fondo transparente, de al menos 300 px de ancho. Se muestra sobre una tarjeta clara.'}</p>
        </div>
      )}
    </section>
  );
}
