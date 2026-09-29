'use client';

import { useId } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { siteSlugProblem, slugify, SITE_SLUG_MAX } from '@/lib/web-sites/urls';
import { ImagePicker } from './ImagePicker';
import { SwitchRow, TextField } from './fields';
import type { SettingsDraft } from './editor-shared';

interface SettingsPanelProps {
  settings: SettingsDraft;
  onChange: (patch: Partial<SettingsDraft>) => void;
  disabled: boolean;
  /** Dirección pública guardada (para avisar si se cambia en un sitio publicado). */
  savedSlug: string;
  isPublished: boolean;
  /** `https://dominio/web/` — lo que va antes de la dirección. */
  publicBase: string;
  contacts: { id: string; label: string }[] | null;
  /** Nombre del cliente asociado, para mostrarlo si el usuario no puede ver la lista de clientes. */
  contactName: string | null;
  companyLogoUrl: string | null;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Normalización suave mientras se escribe: no borra guiones del final para poder seguir escribiendo. */
function typingSlug(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').slice(0, SITE_SLUG_MAX);
}

export function SettingsPanel({ settings, onChange, disabled, savedSlug, isPublished, publicBase, contacts, contactName, companyLogoUrl, saving, dirty, onSave }: SettingsPanelProps) {
  const contactId = useId();
  const slug = slugify(settings.slug);
  const slugProblem = siteSlugProblem(slug);
  const nameProblem = settings.name.trim().length < 2 ? 'Ponle un nombre al sitio (mínimo 2 caracteres).' : null;
  const previewTitle = settings.seoTitle.trim() || settings.name.trim() || 'Título de tu sitio';
  const previewDescription = settings.seoDescription.trim();
  const slugChangedWhilePublished = isPublished && slug !== savedSlug && !slugProblem;
  const canSave = !disabled && dirty && !saving && !slugProblem && !nameProblem;

  return (
    <div className="space-y-6">
      <section aria-label="Datos del sitio" className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Datos del sitio</h2>
        <TextField label="Nombre interno" value={settings.name} onChange={(name) => onChange({ name })} max={80} disabled={disabled} error={nameProblem} hint="Solo lo ves tú en el panel; las visitas no lo ven." />

        <div className="space-y-1.5">
          <TextField
            label="Dirección pública"
            value={settings.slug}
            onChange={(value) => onChange({ slug: typingSlug(value) })}
            onBlur={() => onChange({ slug })}
            max={SITE_SLUG_MAX}
            disabled={disabled}
            error={slugProblem}
            hint={
              <>
                Tu sitio se verá en{' '}
                <span className="font-mono text-foreground">
                  {publicBase}
                  {slug || 'tu-direccion'}
                </span>
                . Usa letras minúsculas, números y guiones.
              </>
            }
          />
          {slugChangedWhilePublished ? (
            <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>Este sitio ya está publicado: si cambias la dirección, los enlaces que ya compartiste (WhatsApp, redes, tarjetas) dejarán de funcionar.</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          {contacts ? <Label htmlFor={contactId}>Cliente asociado (opcional)</Label> : <p className="text-sm leading-none font-medium">Cliente asociado</p>}
          {contacts ? (
            <select id={contactId} className={nativeSelectClass} value={settings.contactId ?? ''} disabled={disabled} onChange={(event) => onChange({ contactId: event.target.value || null })}>
              <option value="">Sin cliente (sitio propio)</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.label}
                </option>
              ))}
            </select>
          ) : (
            <p id={contactId} className="text-sm text-muted-foreground">
              {contactName ?? 'Sin cliente asociado'} <span className="text-xs">(no tienes permiso para ver la lista de clientes)</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">Úsalo si este sitio lo armas como servicio para un cliente: te ayuda a encontrarlo en la lista.</p>
        </div>
      </section>

      <section aria-label="Buscadores" className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Cómo aparece en Google</h2>
        <TextField label="Título para buscadores" value={settings.seoTitle} onChange={(seoTitle) => onChange({ seoTitle })} max={70} ideal={[10, 65]} disabled={disabled} placeholder="Ej.: Diseño de interiores en Santiago | Estudio Sol" hint="Es el título de la pestaña del navegador y el enlace azul en Google." />
        <TextField label="Descripción para buscadores" value={settings.seoDescription} onChange={(seoDescription) => onChange({ seoDescription })} max={200} ideal={[50, 160]} multiline rows={3} disabled={disabled} placeholder="Ej.: Proyectos de interiorismo a medida para casas y oficinas. Cotiza sin costo." hint="Una o dos frases que inviten a entrar." />

        <div className="rounded-lg border border-border bg-background p-3" aria-label="Vista previa en Google" role="group">
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Así se vería en Google</p>
          <p className="truncate text-xs text-success">
            {publicBase}
            {slug || 'tu-direccion'}
          </p>
          <p className="mt-0.5 text-lg leading-snug text-info">{truncate(previewTitle, 60)}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{previewDescription ? truncate(previewDescription, 160) : 'Sin descripción: Google mostrará un fragmento cualquiera de tu página.'}</p>
        </div>

        <SwitchRow
          label="Permitir que aparezca en buscadores"
          description="Si lo apagas, Google no mostrará este sitio. Útil mientras lo estás armando o si solo lo compartes por enlace."
          checked={settings.indexable}
          onChange={(indexable) => onChange({ indexable })}
          disabled={disabled}
        />
      </section>

      <section aria-label="Imágenes de marca" className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Logo e imagen para redes</h2>
        <ImagePicker
          label="Logo"
          value={settings.logoUrl}
          onChange={(logoUrl) => onChange({ logoUrl })}
          hint="Aparece en la barra superior del sitio. Mejor con fondo transparente (PNG)."
          suggestion={companyLogoUrl ? { url: companyLogoUrl, label: 'Usar el logo de la empresa' } : null}
        />
        <ImagePicker label="Imagen para redes" value={settings.ogImageUrl} onChange={(ogImageUrl) => onChange({ ogImageUrl })} hint="Se ve cuando compartes el enlace por WhatsApp, Facebook o LinkedIn. Ideal: horizontal, 1200 × 630 px." />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty ? (
          <span className="text-xs text-warning" aria-live="polite">
            Hay ajustes sin guardar
          </span>
        ) : null}
        <Button type="button" onClick={onSave} disabled={!canSave}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Guardar ajustes
        </Button>
      </div>
    </div>
  );
}
