'use client';

import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowRight, CircleAlert, Database, Inbox, Loader2, Lock, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { MAX_FORM_HIGHLIGHTS, type BlockOf } from '@/lib/web-sites/blocks';
import {
  createField,
  DESTINATION_INFO,
  FIELD_KIND_INFO,
  FORM_DESTINATIONS,
  FORM_FIELD_KINDS,
  FORM_PRESETS,
  FORM_PURPOSES,
  formProblems,
  MAX_FIELD_OPTIONS,
  MAX_FORM_FIELDS,
  needsConsentCheckbox,
  newFieldId,
  presetFields,
  PURPOSE_DEFAULTS,
  PURPOSE_LABELS,
  ROLE_INFO,
  rolesForKind,
  CONTACT_FORM_FIELDS,
  type DataRole,
  type FormDestination,
  type FormDestinationAccess,
  type FormField,
  type FormPreset,
} from '@/lib/web-sites/forms';
import { DEAL_TYPE_LABELS, DEAL_TYPES } from '@/modules/crm/schema';
import { listAcademyGroupNamesAction } from '@/modules/web-sites/actions/web-sites.actions';
import { Notice, PHOTO_TIP, Tip, type FieldsProps } from './block-fields-shared';
import { ChoiceGroup, SwitchRow, TextField } from './fields';
import { ImagePicker } from './ImagePicker';
import { ListEditor } from './ListEditor';

/**
 * Editor de formularios: preguntas, a qué parte del ERP tributa cada envío
 * (destino) y dónde quedan los datos. Lo usan la sección «Formulario» (todo
 * configurable) y el bloque «Contacto» (preguntas fijas, solo el destino).
 */

// ---------------------------------------------------------------------------
// Qué destinos puede usar esta empresa y este usuario
// ---------------------------------------------------------------------------

const ALL_OPEN: FormDestinationAccess = { inbox: { enabled: true, allowed: true }, crm: { enabled: true, allowed: true }, academy: { enabled: true, allowed: true }, tasks: { enabled: true, allowed: true } };

export const FormDestinationsContext = createContext<{ access: FormDestinationAccess; canReadAcademy: boolean }>({ access: ALL_OPEN, canReadAcademy: false });

function useDestinations() {
  return useContext(FormDestinationsContext);
}

// ---------------------------------------------------------------------------
// Destino y "dónde quedan los datos"
// ---------------------------------------------------------------------------

interface DestinationPickerProps {
  value: FormDestination;
  onChange: (destination: FormDestination) => void;
  disabled: boolean;
  /** Destinos que este formulario no puede usar (el de contacto no pide RUT: no va a la academia). */
  exclude?: FormDestination[];
}

function DestinationPicker({ value, onChange, disabled, exclude = [] }: DestinationPickerProps) {
  const { access } = useDestinations();
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">¿A qué parte del ERP tributa cada envío?</legend>
      <p className="text-xs text-muted-foreground">Todo envío queda siempre en la bandeja «Mensajes» del sitio. Además, puedes registrarlo en otro módulo para trabajarlo ahí.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {FORM_DESTINATIONS.filter((destination) => !exclude.includes(destination)).map((destination) => {
          const info = DESTINATION_INFO[destination];
          const state = access[destination];
          const selected = destination === value;
          const blocked = !state.enabled;
          return (
            <label
              key={destination}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                selected ? 'border-ring bg-accent' : 'border-border hover:bg-muted',
                (disabled || blocked) && 'cursor-not-allowed opacity-60'
              )}
            >
              <input type="radio" className="sr-only" name={name} value={destination} checked={selected} disabled={disabled || (blocked && !selected)} onChange={() => onChange(destination)} />
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={destination === 'inbox' ? 'neutral' : 'info'}>{info.area}</StatusBadge>
                {blocked ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" /> No incluido en tu plan
                  </span>
                ) : !state.allowed ? (
                  <span className="text-xs text-warning">Publica alguien con permiso</span>
                ) : null}
              </span>
              <span className="text-sm font-medium">{info.label}</span>
              <span className="text-xs text-muted-foreground">{info.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Recuadro "Dónde quedan los datos": la ruta exacta en el panel y qué dato llena cada pregunta. */
function WhereDataGoes({ destination, fields, consent }: { destination: FormDestination; fields: FormField[]; consent: 'notice' | 'checkbox' }) {
  const { access } = useDestinations();
  const info = DESTINATION_INFO[destination];
  const features = Object.fromEntries(FORM_DESTINATIONS.map((key) => [DESTINATION_INFO[key].feature ?? 'none', access[key].enabled]));
  const problems = formProblems({ fields, destination, consent }, features);
  const mapped = fields.filter((field) => field.role);
  const answersOnly = fields.filter((field) => !field.role);
  return (
    <section aria-label="Dónde quedan los datos" className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Database className="size-4 text-accent-foreground" aria-hidden="true" /> Dónde quedan los datos
      </p>
      <ol className="space-y-1.5 text-sm">
        <li className="flex items-start gap-2">
          <Inbox className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-medium">Siempre:</span> {DESTINATION_INFO.inbox.where}, con todas las respuestas.
          </span>
        </li>
        {destination !== 'inbox' && (
          <li className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
            <span>
              <span className="font-medium">Además:</span> {info.where}.{' '}
              {!access[destination].enabled ? <span className="text-warning">Tu plan no incluye este módulo: por ahora quedará solo en la bandeja.</span> : null}
            </span>
          </li>
        )}
      </ol>
      {mapped.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Cada pregunta se guarda como:</p>
          <ul className="flex flex-wrap gap-1.5">
            {mapped.map((field) => (
              <li key={field.id} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs">
                <span className="font-medium">{field.label || FIELD_KIND_INFO[field.kind].label}</span> → {ROLE_INFO[field.role as DataRole].label}
              </li>
            ))}
          </ul>
          {answersOnly.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">Las demás preguntas ({answersOnly.length}) van en las notas del registro y en la bandeja.</p>}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="space-y-1">
          {problems.map((problem) => (
            <li key={problem.message} className={cn('flex items-start gap-2 text-xs', problem.blocking ? 'text-danger' : 'text-warning')}>
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                El formulario {problem.message}.{problem.blocking ? ' Hay que resolverlo para publicar.' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DealTypeField({ value, onChange, disabled }: { value: (typeof DEAL_TYPES)[number]; onChange: (value: (typeof DEAL_TYPES)[number]) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Tipo de negocio en el CRM
      </label>
      <select id={id} className={nativeSelectClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as (typeof DEAL_TYPES)[number])}>
        {DEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {DEAL_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

function DestinationExtras({ destination, dealType, inboxTag, onDealType, onTag, disabled }: { destination: FormDestination; dealType: (typeof DEAL_TYPES)[number]; inboxTag: string; onDealType: (value: (typeof DEAL_TYPES)[number]) => void; onTag: (value: string) => void; disabled: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Etiqueta para ordenar (opcional)"
        value={inboxTag}
        onChange={onTag}
        max={30}
        disabled={disabled}
        placeholder="Ej.: Inscripciones 2027"
        hint={destination === 'crm' ? 'Filtra la bandeja y también queda como etiqueta de la oportunidad.' : 'Sirve para filtrar la bandeja. La visita no la ve.'}
      />
      {destination === 'crm' ? <DealTypeField value={dealType} onChange={onDealType} disabled={disabled} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloque «Contacto»: solo el destino de su formulario
// ---------------------------------------------------------------------------

export function ContactFormDestination({ block, disabled, onChange }: FieldsProps<BlockOf<'contact'>>) {
  const set = (patch: Partial<BlockOf<'contact'>>) => onChange({ ...block, ...patch });
  if (!block.showForm) return null;
  return (
    <div className="space-y-4 rounded-lg border border-border p-3">
      <DestinationPicker value={block.destination === 'academy' ? 'inbox' : block.destination} onChange={(destination) => set({ destination })} disabled={disabled} exclude={['academy']} />
      <DestinationExtras destination={block.destination} dealType={block.dealType} inboxTag={block.inboxTag} onDealType={(dealType) => set({ dealType })} onTag={(inboxTag) => set({ inboxTag })} disabled={disabled} />
      <WhereDataGoes destination={block.destination === 'academy' ? 'inbox' : block.destination} fields={CONTACT_FORM_FIELDS} consent="notice" />
      <Tip>¿Necesitas inscripciones, cotizaciones o reservas con preguntas propias? Agrega una sección «Formulario».</Tip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Una pregunta
// ---------------------------------------------------------------------------

function QuestionFields({ field, update, disabled, destination }: { field: FormField; update: (patch: Partial<FormField>) => void; disabled: boolean; destination: FormDestination }) {
  const kindId = useId();
  const roleId = useId();
  const { canReadAcademy } = useDestinations();
  const [loadingGroups, setLoadingGroups] = useState(false);
  const roles = rolesForKind(field.kind);
  const hasOptions = field.kind === 'select' || field.kind === 'choice';

  function changeKind(kind: FormField['kind']) {
    // El rol se conserva solo si sigue siendo compatible con el nuevo tipo.
    const role = field.role && ROLE_INFO[field.role].kinds.includes(kind) ? field.role : '';
    update({ kind, role, ...(kind === 'select' || kind === 'choice' ? (field.options.length ? {} : { options: ['Opción 1', 'Opción 2'] }) : { options: [] }) });
  }

  async function loadGroups() {
    setLoadingGroups(true);
    try {
      const result = await listAcademyGroupNamesAction();
      if (!result.success) return void toast.error(result.error);
      if (result.data.length === 0) return void toast.info('La academia no tiene grupos activos todavía. Créalos en Academia → Grupos.');
      update({ options: ['Aún no lo sé', ...result.data].slice(0, MAX_FIELD_OPTIONS) });
      toast.success(`Se cargaron ${result.data.length} grupo(s) de la academia.`);
    } catch {
      toast.error('No se pudieron cargar los grupos. Revisa tu conexión.');
    } finally {
      setLoadingGroups(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={kindId} className="text-sm font-medium">
            Tipo de respuesta
          </label>
          <select id={kindId} className={nativeSelectClass} value={field.kind} disabled={disabled} onChange={(event) => changeKind(event.target.value as FormField['kind'])}>
            {FORM_FIELD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FIELD_KIND_INFO[kind].label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{FIELD_KIND_INFO[field.kind].hint}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={roleId} className="text-sm font-medium">
            Se guarda en el ERP como
          </label>
          <select id={roleId} className={nativeSelectClass} value={field.role} disabled={disabled || roles.length === 0} onChange={(event) => update({ role: event.target.value as FormField['role'] })}>
            <option value="">Solo como respuesta</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_INFO[role].label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Llena ese dato en el registro del destino (nombre del prospecto, RUT de la alumna…).</p>
        </div>
      </div>
      <TextField label="Pregunta" value={field.label} onChange={(label) => update({ label })} max={100} disabled={disabled} placeholder="Ej.: ¿Qué servicio necesitas?" error={!field.label.trim() ? 'Escribe la pregunta.' : null} />
      <TextField label="Aclaración (opcional)" value={field.help} onChange={(help) => update({ help })} max={160} disabled={disabled} placeholder="Ej.: Solo si es menor de edad" />
      {hasOptions ? (
        <div className="space-y-2">
          <TextField
            label="Opciones"
            value={field.options.join('\n')}
            onChange={(value) => update({ options: value.split('\n').map((line) => line.slice(0, 80)).slice(0, MAX_FIELD_OPTIONS) })}
            disabled={disabled}
            multiline
            rows={4}
            hint={`Una por línea, hasta ${MAX_FIELD_OPTIONS}.`}
            error={field.options.filter((option) => option.trim()).length < 2 ? 'Escribe al menos dos opciones.' : null}
          />
          {destination === 'academy' && field.role === 'group' && canReadAcademy ? (
            <Button type="button" variant="outline" size="sm" onClick={loadGroups} disabled={disabled || loadingGroups}>
              {loadingGroups ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Cargar los grupos de la academia
            </Button>
          ) : null}
        </div>
      ) : null}
      <SwitchRow label="Obligatoria" description="No se puede enviar el formulario sin responderla." checked={field.required} onChange={(required) => update({ required })} disabled={disabled} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sección «Formulario»
// ---------------------------------------------------------------------------

function PresetPicker({ onPick, disabled }: { onPick: (preset: FormPreset) => void; disabled: boolean }) {
  const { access } = useDestinations();
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {FORM_PRESETS.map((preset) => {
        const info = DESTINATION_INFO[preset.destination];
        const enabled = access[preset.destination].enabled;
        return (
          <li key={preset.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(preset)}
              className="flex h-full w-full flex-col gap-1 rounded-lg border border-border bg-card p-2.5 text-left outline-none transition-colors hover:border-ring hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-sm font-medium">{preset.label}</span>
              <span className="text-xs text-muted-foreground">{preset.description}</span>
              <span className="text-xs font-medium text-accent-foreground">→ {enabled ? info.area : `${DESTINATION_INFO.inbox.area} (sin ${info.area} en tu plan)`}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FormFields({ block, disabled, onChange }: FieldsProps<BlockOf<'form'>>) {
  const confirm = useConfirm();
  const { access } = useDestinations();
  const purposeId = useId();
  const set = (patch: Partial<BlockOf<'form'>>) => onChange({ ...block, ...patch });
  const defaults = PURPOSE_DEFAULTS[block.purpose];
  const consentForced = DESTINATION_INFO[block.destination].forcesConsent;
  const [showPresets, setShowPresets] = useState(block.fields.length === 0);

  async function applyPreset(preset: FormPreset) {
    if (block.fields.length > 0) {
      const ok = await confirm({
        title: `¿Usar la plantilla «${preset.label}»?`,
        description: 'Se reemplazan las preguntas, el título, los textos y el destino del formulario. El diseño de la sección se mantiene.',
        confirmLabel: 'Usar plantilla',
      });
      if (!ok) return;
    }
    // Sin el módulo del destino, la plantilla queda en la bandeja (se puede cambiar luego).
    const destination = access[preset.destination].enabled ? preset.destination : 'inbox';
    set({
      purpose: preset.purpose,
      destination,
      heading: preset.heading,
      intro: preset.intro,
      submitLabel: preset.submitLabel,
      successTitle: preset.successTitle,
      successText: preset.successText,
      fields: presetFields(preset),
      consent: DESTINATION_INFO[destination].forcesConsent ? 'checkbox' : block.consent,
    });
    setShowPresets(false);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Wand2 className="size-4 text-accent-foreground" aria-hidden="true" /> Empezar desde una plantilla
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowPresets((open) => !open)} aria-expanded={showPresets}>
            {showPresets ? 'Ocultar' : 'Ver plantillas'}
          </Button>
        </div>
        {showPresets ? <PresetPicker onPick={(preset) => void applyPreset(preset)} disabled={disabled} /> : <p className="text-xs text-muted-foreground">Contacto, cotización, inscripción, reserva, postulación, suscripción o reclamos: con las preguntas y el destino listos.</p>}
      </div>

      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Pide tu cotización" hint="También aparece en el menú y es el nombre del formulario en la bandeja." />
      <TextField label="Texto de apoyo (opcional)" value={block.intro} onChange={(intro) => set({ intro })} max={400} disabled={disabled} multiline rows={2} placeholder="Ej.: Te respondemos el mismo día hábil, sin compromiso." />
      <div className="space-y-1.5">
        <label htmlFor={purposeId} className="text-sm font-medium">
          ¿Para qué es este formulario?
        </label>
        <select id={purposeId} className={nativeSelectClass} value={block.purpose} disabled={disabled} onChange={(event) => set({ purpose: event.target.value as BlockOf<'form'>['purpose'] })}>
          {FORM_PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>
              {PURPOSE_LABELS[purpose]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Ordena la bandeja por tipo (todas las cotizaciones, todas las inscripciones…).</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Preguntas</p>
        <ListEditor
          idPrefix={`form-${block.id}`}
          noun="pregunta"
          items={block.fields}
          max={MAX_FORM_FIELDS}
          disabled={disabled}
          addLabel="Agregar pregunta"
          createItem={() => createField('text', { label: '' })}
          cloneItem={(field) => ({ ...structuredClone(field), id: newFieldId(), role: '' as const })}
          onChange={(fields) => set({ fields })}
          summary={(field) => `${field.label || 'Sin texto'} · ${FIELD_KIND_INFO[field.kind].label}${field.required ? ' · obligatoria' : ''}${field.role ? ` · ${ROLE_INFO[field.role].label}` : ''}`}
          emptyText="Agrega preguntas o elige una plantilla."
          renderItem={(field, update) => <QuestionFields field={field} update={update} disabled={disabled} destination={block.destination} />}
        />
        <Tip>Pide solo lo necesario: cada pregunta de más hace que menos gente termine. Marca como obligatorio solo lo imprescindible.</Tip>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-3">
        <DestinationPicker
          value={block.destination}
          onChange={(destination) => set({ destination, ...(DESTINATION_INFO[destination].forcesConsent ? { consent: 'checkbox' } : {}) })}
          disabled={disabled}
        />
        <DestinationExtras destination={block.destination} dealType={block.dealType} inboxTag={block.inboxTag} onDealType={(dealType) => set({ dealType })} onTag={(inboxTag) => set({ inboxTag })} disabled={disabled} />
        <WhereDataGoes destination={block.destination} fields={block.fields} consent={block.consent} />
      </div>

      <ChoiceGroup
        label="Aviso de privacidad"
        value={needsConsentCheckbox(block) ? 'checkbox' : 'notice'}
        onChange={(consent) => set({ consent })}
        disabled={disabled || consentForced}
        columns={2}
        hint={consentForced ? 'La academia guarda datos personales (RUT, fecha de nacimiento): la casilla es obligatoria.' : 'Con datos sensibles (RUT, salud, menores de edad) conviene pedir la casilla.'}
        options={[
          { value: 'notice', label: 'Aviso con enlace', description: '“Usaremos tus datos solo para responderte, según el aviso de privacidad.”' },
          { value: 'checkbox', label: 'Casilla obligatoria', description: '“Leí y acepto el aviso de privacidad.” No se envía sin marcarla.' },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Texto del botón" value={block.submitLabel} onChange={(submitLabel) => set({ submitLabel })} max={40} disabled={disabled} placeholder={defaults.submitLabel} hint="Vacío = el de la plantilla." />
        <TextField label="Mensaje al enviar" value={block.successTitle} onChange={(successTitle) => set({ successTitle })} max={120} disabled={disabled} placeholder={defaults.successTitle} />
      </div>
      <TextField label="Detalle del mensaje al enviar (opcional)" value={block.successText} onChange={(successText) => set({ successText })} max={300} disabled={disabled} multiline rows={2} placeholder={defaults.successText} hint="Di qué pasa ahora y cuándo: “Te respondemos dentro de 24 horas hábiles”." />

      <TextField
        label="Frases a favor (opcional)"
        value={block.highlights.join('\n')}
        onChange={(value) => set({ highlights: value.split('\n').map((line) => line.slice(0, 120)).slice(0, MAX_FORM_HIGHLIGHTS) })}
        disabled={disabled}
        multiline
        rows={3}
        placeholder={'Respuesta en menos de 24 horas\nSin compromiso\nAtendemos todo Chile'}
        hint={`Una por línea, hasta ${MAX_FORM_HIGHLIGHTS}. Se muestran junto al formulario y ayudan a que más gente lo complete.`}
      />
      {block.variant === 'photo' ? <ImagePicker label="Foto junto al formulario" value={block.imageUrl} onChange={(imageUrl) => set({ imageUrl })} hint={PHOTO_TIP} /> : null}
      {block.variant === 'steps' && block.fields.length <= 4 ? <Notice>El diseño «Por pasos» luce con formularios largos (5 preguntas o más). Con pocas preguntas, «Tarjeta» es más directo.</Notice> : null}
    </div>
  );
}

export function FormFieldsProvider({ access, canReadAcademy, children }: { access: FormDestinationAccess; canReadAcademy: boolean; children: ReactNode }) {
  return <FormDestinationsContext.Provider value={{ access, canReadAcademy }}>{children}</FormDestinationsContext.Provider>;
}
