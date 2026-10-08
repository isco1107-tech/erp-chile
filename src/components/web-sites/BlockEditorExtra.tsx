'use client';

import { useId } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  beforeAfterItemSchema,
  comparisonMark,
  comparisonRowSchema,
  linkItemSchema,
  MAX_AREAS,
  MAX_BEFORE_AFTER,
  MAX_COMPARISON_COLUMNS,
  MAX_COMPARISON_ROWS,
  MAX_LINKS,
  MAX_MARQUEE_ITEMS,
  MAX_POSTS,
  MAX_TABS,
  MAX_TIMELINE_ITEMS,
  postItemSchema,
  tabItemSchema,
  timelineItemSchema,
  type BlockOf,
  type HoursDay,
} from '@/lib/web-sites/blocks';
import { DAY_NAMES, dayHoursText } from '@/lib/web-sites/hours';
import { embedFrom, EMBED_PROVIDER_LABELS } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { VariantSketch } from './block-sketches';
import { ButtonFields, Notice, PHOTO_TIP, Tip, type FieldsProps } from './block-fields-shared';
import { ChoiceGroup, SwitchRow, TextField } from './fields';
import { IconPicker } from './IconPicker';
import { ImagePicker } from './ImagePicker';
import { LinkField } from './LinkField';
import { ListEditor } from './ListEditor';
import { RichTextField } from './RichTextField';

const COLUMN_OPTIONS = [
  { value: '2' as const, label: '2 columnas', description: 'Tarjetas grandes.', preview: <VariantSketch id="cols:2" /> },
  { value: '3' as const, label: '3 columnas', description: 'El equilibrio ideal.', preview: <VariantSketch id="cols:3" /> },
  { value: '4' as const, label: '4 columnas', description: 'Muchas a la vista.', preview: <VariantSketch id="cols:4" /> },
];

function HeadingIntro({ heading, intro, disabled, onChange, headingPlaceholder, introPlaceholder }: { heading: string; intro: string; disabled: boolean; onChange: (patch: { heading?: string; intro?: string }) => void; headingPlaceholder: string; introPlaceholder: string }) {
  return (
    <>
      <TextField label="Título de la sección" value={heading} onChange={(value) => onChange({ heading: value })} max={120} disabled={disabled} placeholder={headingPlaceholder} hint="También aparece en el menú del sitio." />
      <TextField label="Introducción (opcional)" value={intro} onChange={(value) => onChange({ intro: value })} max={300} disabled={disabled} multiline rows={2} placeholder={introPlaceholder} />
    </>
  );
}

/** Lista de textos cortos escrita como "uno por línea" (zonas, frases): se guarda como lista sin perder la línea que se está escribiendo. */
function LinesField({ label, values, max, maxLength, disabled, placeholder, hint, onChange }: { label: string; values: string[]; max: number; maxLength: number; disabled: boolean; placeholder: string; hint: string; onChange: (values: string[]) => void }) {
  const filled = values.filter((value) => value.trim()).length;
  return (
    <TextField
      label={`${label} (${filled}/${max})`}
      value={values.join('\n')}
      onChange={(text) => onChange(text.split('\n').slice(0, max).map((line) => line.slice(0, maxLength)))}
      disabled={disabled}
      multiline
      rows={Math.min(10, Math.max(4, values.length + 1))}
      placeholder={placeholder}
      hint={hint}
    />
  );
}

// ---------------------------------------------------------------------------
// Línea de tiempo
// ---------------------------------------------------------------------------

export function TimelineFields({ block, disabled, onChange }: FieldsProps<BlockOf<'timeline'>>) {
  const set = (patch: Partial<BlockOf<'timeline'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: Nuestra historia" introPlaceholder="Ej.: Más de veinte años creciendo junto a nuestros clientes." />
      <Tip>Entre 4 y 8 hitos, en orden. La fecha puede ser un año (“1998”), un mes (“Marzo 2024”) o “Hoy”.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Hitos ({block.items.length}/{MAX_TIMELINE_ITEMS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="hito"
          items={block.items}
          max={MAX_TIMELINE_ITEMS}
          disabled={disabled}
          addLabel="Agregar hito"
          createItem={() => timelineItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => [item.date, item.title].filter(Boolean).join(' · ')}
          renderItem={(item, update) => (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <TextField label="Fecha o año" value={item.date} onChange={(date) => update({ date })} max={40} disabled={disabled} placeholder="Ej.: 2015" />
                <TextField label="Qué pasó" value={item.title} onChange={(title) => update({ title })} max={80} disabled={disabled} placeholder="Ej.: Abrimos nuestro primer local" />
              </div>
              <TextField label="Detalle (opcional)" value={item.text} onChange={(text) => update({ text })} max={400} disabled={disabled} multiline rows={2} placeholder="Ej.: Partimos con tres personas en un local de 40 m² en el centro de Talca." />
              <ImagePicker label="Foto (opcional)" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint={PHOTO_TIP} />
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabla comparativa
// ---------------------------------------------------------------------------

export function ComparisonFields({ block, disabled, onChange }: FieldsProps<BlockOf<'comparison'>>) {
  const set = (patch: Partial<BlockOf<'comparison'>>) => onChange({ ...block, ...patch });
  const count = Math.max(2, Math.min(MAX_COMPARISON_COLUMNS, block.columns.length || 2));
  const columns = Array.from({ length: count }, (_, index) => block.columns[index] ?? { title: '' });
  const setCount = (next: number) => {
    set({
      columns: Array.from({ length: next }, (_, index) => block.columns[index] ?? { title: '' }),
      rows: block.rows.map((row) => ({ ...row, values: Array.from({ length: next }, (_, index) => row.values[index] ?? '') })),
      highlight: block.highlight >= next ? -1 : block.highlight,
    });
  };
  const columnName = (index: number) => columns[index]?.title.trim() || `Columna ${index + 1}`;
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: ¿Por qué elegirnos?" introPlaceholder="Ej.: Compara lo que incluye cada opción antes de decidir." />
      <ChoiceGroup
        label="Cantidad de columnas"
        value={String(count) as '2' | '3' | '4'}
        onChange={(value) => setCount(Number(value))}
        disabled={disabled}
        options={[
          { value: '2', label: '2 columnas', description: 'Nosotros vs. otros.' },
          { value: '3', label: '3 columnas', description: 'Tres planes u opciones.' },
          { value: '4', label: '4 columnas', description: 'Cuatro opciones.' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {columns.map((column, index) => (
          <TextField
            key={index}
            label={`Nombre de la columna ${index + 1}`}
            value={column.title}
            onChange={(title) => set({ columns: columns.map((entry, i) => (i === index ? { title } : entry)), rows: block.rows.map((row) => ({ ...row, values: Array.from({ length: count }, (_, i) => row.values[i] ?? '') })) })}
            max={40}
            disabled={disabled}
            placeholder={index === 0 ? 'Ej.: Nosotros' : 'Ej.: Otros'}
          />
        ))}
      </div>
      <ChoiceGroup
        label="Columna destacada"
        value={String(block.highlight)}
        onChange={(value) => set({ highlight: Number(value) })}
        disabled={disabled}
        columns={count + 1 > 3 ? 3 : 2}
        options={[{ value: '-1', label: 'Ninguna' }, ...columns.map((_, index) => ({ value: String(index), label: columnName(index) }))]}
      />
      <Tip>Escribe “Sí” o “No” para que aparezca un visto o una cruz. Cualquier otro texto (“24 horas”, “$9.990”) se muestra tal cual.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Filas ({block.rows.length}/{MAX_COMPARISON_ROWS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-row`}
          noun="fila"
          items={block.rows}
          max={MAX_COMPARISON_ROWS}
          disabled={disabled}
          addLabel="Agregar fila"
          createItem={() => comparisonRowSchema.parse({ values: Array.from({ length: count }, () => '') })}
          onChange={(rows) => set({ rows })}
          summary={(row) => row.label}
          renderItem={(row, update) => (
            <>
              <TextField label="Característica" value={row.label} onChange={(label) => update({ label })} max={100} disabled={disabled} placeholder="Ej.: Garantía de 12 meses" />
              <div className={cn('grid gap-3', count >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                {columns.map((_, index) => {
                  const value = row.values[index] ?? '';
                  const mark = comparisonMark(value);
                  return (
                    <TextField
                      key={index}
                      label={columnName(index)}
                      value={value}
                      onChange={(next) => update({ values: Array.from({ length: count }, (_, i) => (i === index ? next : (row.values[i] ?? ''))) })}
                      max={60}
                      disabled={disabled}
                      placeholder="Sí, No o un texto"
                      hint={mark === 'yes' ? 'Se verá un visto ✓' : mark === 'no' ? 'Se verá una cruz ✗' : undefined}
                    />
                  );
                })}
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Antes y después
// ---------------------------------------------------------------------------

export function BeforeAfterFields({ block, disabled, onChange }: FieldsProps<BlockOf<'beforeafter'>>) {
  const set = (patch: Partial<BlockOf<'beforeafter'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: Nuestros resultados" introPlaceholder="Ej.: Desliza para ver cómo quedaron los trabajos." />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Etiqueta de la primera foto" value={block.beforeLabel} onChange={(beforeLabel) => set({ beforeLabel })} max={20} disabled={disabled} placeholder="Antes" hint="Vacío = “Antes”." />
        <TextField label="Etiqueta de la segunda foto" value={block.afterLabel} onChange={(afterLabel) => set({ afterLabel })} max={20} disabled={disabled} placeholder="Después" hint="Vacío = “Después”." />
      </div>
      <Tip>Usa dos fotos tomadas desde el mismo ángulo, con la misma luz y del mismo tamaño: así el cambio se nota de verdad. {PHOTO_TIP}</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Pares de fotos ({block.items.length}/{MAX_BEFORE_AFTER})
        </p>
        <ListEditor
          idPrefix={`${block.id}-pair`}
          noun="par"
          items={block.items}
          max={MAX_BEFORE_AFTER}
          disabled={disabled}
          addLabel="Agregar par de fotos"
          createItem={() => beforeAfterItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(pair) => pair.caption || pair.alt}
          renderItem={(pair, update) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <ImagePicker label={block.beforeLabel || 'Antes'} value={pair.beforeUrl} onChange={(beforeUrl) => update({ beforeUrl })} />
                <ImagePicker label={block.afterLabel || 'Después'} value={pair.afterUrl} onChange={(afterUrl) => update({ afterUrl })} />
              </div>
              {Boolean(pair.beforeUrl) !== Boolean(pair.afterUrl) ? <Notice>Sube las dos fotos: con una sola el par no se muestra.</Notice> : null}
              <TextField label="Qué muestran las fotos" value={pair.alt} onChange={(alt) => update({ alt })} max={160} disabled={disabled} placeholder="Ej.: Cocina remodelada en Ñuñoa" warning={(pair.beforeUrl || pair.afterUrl) && !pair.alt.trim() ? 'Falta la descripción de las fotos.' : null} />
              <TextField label="Texto bajo las fotos (opcional)" value={pair.caption} onChange={(caption) => update({ caption })} max={160} disabled={disabled} placeholder="Ej.: Remodelación completa en 10 días." />
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enlaces (link en bio)
// ---------------------------------------------------------------------------

export function LinksFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'links'>>) {
  const set = (patch: Partial<BlockOf<'links'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <ImagePicker label="Foto o logo (opcional)" value={block.imageUrl} onChange={(imageUrl) => set({ imageUrl })} hint="Cuadrada: se muestra en un círculo. Sin foto se ven tus iniciales." />
      <TextField label="Nombre" value={block.title} onChange={(title) => set({ title })} max={80} disabled={disabled} placeholder="Ej.: Pastelería Dulce Hogar" />
      <TextField label="Frase (opcional)" value={block.text} onChange={(text) => set({ text })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Tortas a pedido en Valdivia. Despacho gratis sobre $30.000." />
      <SwitchRow label="Mostrar mis redes sociales" description="Usa las redes que escribiste en “Encabezado y pie”." checked={block.showSocial} onChange={(showSocial) => set({ showSocial })} disabled={disabled} />
      <Tip>Pon esta página como enlace de tu Instagram o TikTok. El enlace más importante va primero.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Enlaces ({block.items.length}/{MAX_LINKS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-link`}
          noun="enlace"
          items={block.items}
          max={MAX_LINKS}
          disabled={disabled}
          addLabel="Agregar enlace"
          createItem={() => linkItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => item.label}
          renderItem={(item, update) => (
            <>
              <TextField
                label="Texto del botón"
                value={item.label}
                onChange={(label) => update({ label })}
                max={60}
                disabled={disabled}
                placeholder="Ej.: Haz tu pedido por WhatsApp"
                error={item.href.trim() && !item.label.trim() ? 'Escribe el texto del botón.' : null}
                warning={item.label.trim() && !item.href.trim() ? 'Este botón todavía no lleva a ningún lado.' : null}
              />
              <LinkField label="¿A dónde lleva?" value={item.href} onChange={(href) => update({ href })} document={document} pageId={pageId} disabled={disabled} />
              <IconPicker label="Ícono (opcional)" value={item.icon} onChange={(icon) => update({ icon })} disabled={disabled} />
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cinta de frases
// ---------------------------------------------------------------------------

export function MarqueeFields({ block, disabled, onChange }: FieldsProps<BlockOf<'marquee'>>) {
  const set = (patch: Partial<BlockOf<'marquee'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <LinesField
        label="Frases"
        values={block.items.map((item) => item.text)}
        max={MAX_MARQUEE_ITEMS}
        maxLength={60}
        disabled={disabled}
        placeholder={'Envíos a todo Chile\nHecho a mano\n10 años de experiencia'}
        hint="Una frase por línea, de 1 a 4 palabras. Entre frases se pone una estrella ✦."
        onChange={(values) => set({ items: values.map((text) => ({ text })) })}
      />
      {block.variant !== 'static' ? (
        <ChoiceGroup
          label="Velocidad"
          value={block.speed}
          onChange={(speed) => set({ speed })}
          disabled={disabled}
          options={[
            { value: 'slow', label: 'Lenta', description: 'Tranquila; se lee fácil.' },
            { value: 'normal', label: 'Normal', description: 'El punto medio.' },
            { value: 'fast', label: 'Rápida', description: 'Con energía.' },
          ]}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

export function TabsFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'tabs'>>) {
  const set = (patch: Partial<BlockOf<'tabs'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: Nuestros servicios" introPlaceholder="Ej.: Elige una categoría para ver el detalle." />
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Pestañas ({block.items.length}/{MAX_TABS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-tab`}
          noun="pestaña"
          items={block.items}
          max={MAX_TABS}
          disabled={disabled}
          addLabel="Agregar pestaña"
          createItem={() => tabItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => item.label || item.title}
          renderItem={(item, update) => (
            <>
              <TextField label="Nombre de la pestaña" value={item.label} onChange={(label) => update({ label })} max={40} disabled={disabled} placeholder="Ej.: Coloración" hint="Una o dos palabras." />
              <TextField label="Título (opcional)" value={item.title} onChange={(title) => update({ title })} max={120} disabled={disabled} placeholder="Ej.: Color, mechas y balayage" />
              <RichTextField label="Contenido" value={item.body} onChange={(body) => update({ body })} max={2000} rows={5} disabled={disabled} document={document} pageId={pageId} placeholder="Ej.: Trabajamos con tinturas sin amoníaco. Incluye diagnóstico y lavado." />
              <ImagePicker label="Foto (opcional)" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint={PHOTO_TIP} />
              <ButtonFields legend="Botón (opcional)" label={item.buttonLabel} href={item.buttonHref} onLabel={(buttonLabel) => update({ buttonLabel })} onHref={(buttonHref) => update({ buttonHref })} document={document} pageId={pageId} disabled={disabled} labelPlaceholder="Ej.: Reservar hora" />
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horario de atención
// ---------------------------------------------------------------------------

function TimeInput({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} type="time" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function HoursFields({ block, disabled, onChange }: FieldsProps<BlockOf<'hours'>>) {
  const set = (patch: Partial<BlockOf<'hours'>>) => onChange({ ...block, ...patch });
  const updateDay = (index: number, patch: Partial<HoursDay>) => set({ week: block.week.map((day, i) => (i === index ? { ...day, ...patch } : day)) });
  const copyMonday = () => {
    const monday = block.week[0];
    if (monday) set({ week: block.week.map((day, index) => (index > 0 && index < 5 ? { ...monday } : day)) });
  };
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: Horario de atención" introPlaceholder="Ej.: Atendemos con y sin hora agendada." />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Horario por día</p>
        <Button type="button" size="sm" variant="outline" onClick={copyMonday} disabled={disabled}>
          <Copy aria-hidden="true" /> Copiar el lunes a martes–viernes
        </Button>
      </div>
      <Tip>Si cierras a mediodía, usa el segundo tramo (por ejemplo, 09:00–13:00 y 15:00–19:00). Un cierre después de medianoche (bar hasta las 02:00) también funciona.</Tip>
      <ul className="space-y-2">
        {block.week.map((day, index) => (
          <li key={index} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{DAY_NAMES[index]}</p>
              <span className="text-xs text-muted-foreground">{dayHoursText(day) || 'Sin definir (no se muestra)'}</span>
            </div>
            <SwitchRow label="Cerrado este día" checked={day.closed} onChange={(closed) => updateDay(index, { closed })} disabled={disabled} />
            {!day.closed ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <TimeInput label="Abre" value={day.open} disabled={disabled} onChange={(open) => updateDay(index, { open })} />
                <TimeInput label="Cierra" value={day.close} disabled={disabled} onChange={(close) => updateDay(index, { close })} />
                <TimeInput label="Abre de nuevo (opcional)" value={day.open2} disabled={disabled} onChange={(open2) => updateDay(index, { open2 })} />
                <TimeInput label="Cierra (opcional)" value={day.close2} disabled={disabled} onChange={(close2) => updateDay(index, { close2 })} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <TextField label="Aclaración (opcional)" value={block.note} onChange={(note) => set({ note })} max={200} disabled={disabled} placeholder="Ej.: Feriados cerrado. Atención con hora previa los sábados." />
      <SwitchRow label="Mostrar “Abierto ahora” o “Cerrado”" description="Se calcula con la hora de Chile al momento de la visita." checked={block.showStatus} onChange={(showStatus) => set({ showStatus })} disabled={disabled} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zonas de cobertura
// ---------------------------------------------------------------------------

export function AreasFields({ block, disabled, onChange }: FieldsProps<BlockOf<'areas'>>) {
  const set = (patch: Partial<BlockOf<'areas'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: Dónde atendemos" introPlaceholder="Ej.: Visitas a domicilio en estas comunas de Santiago." />
      <LinesField
        label="Comunas o ciudades"
        values={block.items.map((item) => item.name)}
        max={MAX_AREAS}
        maxLength={60}
        disabled={disabled}
        placeholder={'Providencia\nÑuñoa\nLas Condes'}
        hint="Una por línea."
        onChange={(values) => set({ items: values.map((name) => ({ name })) })}
      />
      <TextField label="Aclaración (opcional)" value={block.note} onChange={(note) => set({ note })} max={200} disabled={disabled} placeholder="Ej.: Otras comunas con recargo; consúltanos." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incrustar
// ---------------------------------------------------------------------------

export function EmbedFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'embed'>>) {
  const set = (patch: Partial<BlockOf<'embed'>>) => onChange({ ...block, ...patch });
  const embed = embedFrom(block.url);
  const services = Object.values(EMBED_PROVIDER_LABELS).join(', ');
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Agenda tu hora" hint="También aparece en el menú del sitio." />
      <RichTextField label="Texto (opcional)" value={block.text} onChange={(text) => set({ text })} max={1000} rows={4} disabled={disabled} document={document} pageId={pageId} placeholder="Ej.: Elige el día y la hora que te acomoden. Te llegará la confirmación por correo." />
      <TextField
        label="Enlace a incrustar"
        value={block.url}
        onChange={(url) => set({ url })}
        max={500}
        disabled={disabled}
        placeholder="https://calendly.com/tu-usuario/30min"
        hint={embed ? `Reconocido: ${embed.label}.` : `Sirven enlaces de ${services}.`}
        error={block.url.trim() && !embed ? `No reconocemos este enlace. Copia el enlace para compartir de ${services}.` : null}
      />
      {embed && embed.fixedHeight === null ? (
        <ChoiceGroup
          label="Alto"
          value={block.height}
          onChange={(height) => set({ height })}
          disabled={disabled}
          options={[
            { value: 'sm', label: 'Bajo', description: 'Formularios cortos.' },
            { value: 'md', label: 'Medio', description: 'Lo más común.' },
            { value: 'lg', label: 'Alto', description: 'Calendarios y agendas.' },
          ]}
        />
      ) : null}
      <TextField label="Texto bajo el contenido (opcional)" value={block.caption} onChange={(caption) => set({ caption })} max={200} disabled={disabled} placeholder="Ej.: Si no ves el calendario, escríbenos por WhatsApp." />
      <Tip>El contenido incrustado se carga desde el servicio (Calendly, Google, Spotify…): lo que se agende o responda queda en tu cuenta de ese servicio, no en la plataforma.</Tip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

export function PostsFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'posts'>>) {
  const set = (patch: Partial<BlockOf<'posts'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <HeadingIntro heading={block.heading} intro={block.intro} disabled={disabled} onChange={set} headingPlaceholder="Ej.: Novedades" introPlaceholder="Ej.: Lo último de nuestro taller." />
      {block.variant === 'grid' ? <ChoiceGroup label="Novedades por fila" value={block.columns} onChange={(columns) => set({ columns })} disabled={disabled} options={COLUMN_OPTIONS} /> : null}
      <Tip>Pon primero la más reciente. Mantenlas al día: noticias de hace un año dan sensación de abandono.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Novedades ({block.items.length}/{MAX_POSTS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-post`}
          noun="novedad"
          items={block.items}
          max={MAX_POSTS}
          disabled={disabled}
          addLabel="Agregar novedad"
          createItem={() => postItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => item.title}
          renderItem={(item, update) => (
            <>
              <TextField label="Título" value={item.title} onChange={(title) => update({ title })} max={120} disabled={disabled} placeholder="Ej.: Abrimos nuestra segunda sucursal" />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Fecha (opcional)" value={item.date} onChange={(date) => update({ date })} max={40} disabled={disabled} placeholder="Ej.: 12 de marzo de 2026" />
                <TextField label="Etiqueta (opcional)" value={item.tag} onChange={(tag) => update({ tag })} max={30} disabled={disabled} placeholder="Ej.: Noticia" />
              </div>
              <TextField label="Resumen" value={item.excerpt} onChange={(excerpt) => update({ excerpt })} max={300} disabled={disabled} multiline rows={3} placeholder="Ej.: Desde abril atendemos también en Mall Plaza Oeste, de lunes a domingo." />
              <ImagePicker label="Foto (opcional)" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint={PHOTO_TIP} />
              <LinkField label="Enlace para leer más (opcional)" value={item.href} onChange={(href) => update({ href })} document={document} pageId={pageId} disabled={disabled} hint="Una página de tu sitio, una nota de prensa o una publicación." />
            </>
          )}
        />
      </div>
    </div>
  );
}
