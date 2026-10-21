'use client';

import { useId, useState } from 'react';
import { ExternalLink, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  catalogItemSchema,
  logoItemSchema,
  MAX_CATALOG_ITEMS,
  MAX_LIST_ITEMS,
  MAX_LOGOS,
  MAX_PLANS,
  MAX_PRICE_CATEGORIES,
  MAX_PRICE_ITEMS,
  MAX_SCHEDULE_ROWS,
  MAX_STATS,
  MAX_STEPS,
  planItemSchema,
  priceCategorySchema,
  priceItemSchema,
  scheduleRowSchema,
  statItemSchema,
  stepItemSchema,
  teamMemberSchema,
  type BlockOf,
} from '@/lib/web-sites/blocks';
import { mapLinkUrl, videoEmbed, whatsappHref } from '@/lib/web-sites/urls';
import { ImagePicker } from './ImagePicker';
import { LinkField } from './LinkField';
import { ListEditor } from './ListEditor';
import { ProductImportDialog } from './ProductImportDialog';
import { SwitchRow, TextField, ChoiceGroup } from './fields';
import { VariantSketch } from './block-sketches';
import { ButtonFields, countLines, Notice, Optional, PHOTO_TIP, Tip, type FieldsProps } from './block-fields-shared';

const COLUMN_OPTIONS = [
  { value: '2' as const, label: '2 columnas', description: 'Fichas grandes.', preview: <VariantSketch id="cols:2" /> },
  { value: '3' as const, label: '3 columnas', description: 'El equilibrio ideal.', preview: <VariantSketch id="cols:3" /> },
  { value: '4' as const, label: '4 columnas', description: 'Muchas fichas a la vista.', preview: <VariantSketch id="cols:4" /> },
];

function HeadingIntro({ block, disabled, onChange, headingPlaceholder, introPlaceholder }: { block: { heading: string; intro: string }; disabled: boolean; onChange: (patch: { heading?: string; intro?: string }) => void; headingPlaceholder: string; introPlaceholder: string }) {
  return (
    <>
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ heading })} max={120} disabled={disabled} placeholder={headingPlaceholder} hint="También aparece en el menú del sitio." />
      <TextField label="Introducción (opcional)" value={block.intro} onChange={(intro) => onChange({ intro })} max={300} disabled={disabled} multiline rows={2} placeholder={introPlaceholder} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Cifras, pasos, planes, equipo, frase, logos
// ---------------------------------------------------------------------------

export function StatsFields({ block, disabled, onChange }: FieldsProps<BlockOf<'stats'>>) {
  return (
    <div className="space-y-4">
      <HeadingIntro block={block} disabled={disabled} onChange={(patch) => onChange({ ...block, ...patch })} headingPlaceholder="Ej.: Nuestra trayectoria en números" introPlaceholder="Ej.: Más de una década trabajando con familias y empresas del Biobío." />
      <Tip>Usa cifras reales y fáciles de creer: años de experiencia, clientes atendidos, proyectos entregados. Un número concreto convence más que un adjetivo.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Cifras ({block.items.length}/{MAX_STATS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="cifra"
          items={block.items}
          max={MAX_STATS}
          disabled={disabled}
          addLabel="Agregar cifra"
          createItem={() => statItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          summary={(item) => [item.value, item.label].filter(Boolean).join(' · ')}
          renderItem={(item, update) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <TextField label="Número" value={item.value} onChange={(value) => update({ value })} max={20} disabled={disabled} placeholder="Ej.: +500" hint="Puede llevar signos: +500, 12 años, 98 %." />
              <TextField label="Qué significa" value={item.label} onChange={(label) => update({ label })} max={80} disabled={disabled} placeholder="Ej.: Clientes atendidos" />
            </div>
          )}
        />
      </div>
    </div>
  );
}

export function StepsFields({ block, disabled, onChange }: FieldsProps<BlockOf<'steps'>>) {
  return (
    <div className="space-y-4">
      <HeadingIntro block={block} disabled={disabled} onChange={(patch) => onChange({ ...block, ...patch })} headingPlaceholder="Ej.: Cómo trabajamos" introPlaceholder="Ej.: Tres pasos simples, sin letra chica." />
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Pasos ({block.items.length}/{MAX_STEPS})
        </p>
        <p className="text-xs text-muted-foreground">Los números (1, 2, 3…) se ponen solos según el orden. Entre 3 y 5 pasos es lo ideal.</p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="paso"
          items={block.items}
          max={MAX_STEPS}
          disabled={disabled}
          addLabel="Agregar paso"
          createItem={() => stepItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          summary={(item) => item.title}
          renderItem={(item, update) => (
            <>
              <TextField label="Título del paso" value={item.title} onChange={(title) => update({ title })} max={80} disabled={disabled} placeholder="Ej.: Nos cuentas tu proyecto" />
              <TextField label="Explicación" value={item.text} onChange={(text) => update({ text })} max={400} disabled={disabled} multiline rows={2} placeholder="Ej.: Coordinamos una visita gratis y medimos el espacio." />
            </>
          )}
        />
      </div>
    </div>
  );
}

export function PricingFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'pricing'>>) {
  const highlighted = block.items.filter((item) => item.highlighted).length;
  return (
    <div className="space-y-4">
      <HeadingIntro block={block} disabled={disabled} onChange={(patch) => onChange({ ...block, ...patch })} headingPlaceholder="Ej.: Elige tu plan" introPlaceholder="Ej.: Sin contratos ni costos ocultos. Cambia de plan cuando quieras." />
      <Tip>Dos o tres planes se comparan mejor que seis. Escribe precios claros: “a consultar” espanta clientes.</Tip>
      {highlighted > 1 ? <Notice>Tienes {highlighted} planes destacados. Destacar uno solo (el que más te conviene vender) le da más fuerza.</Notice> : null}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Planes ({block.items.length}/{MAX_PLANS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="plan"
          items={block.items}
          max={MAX_PLANS}
          disabled={disabled}
          addLabel="Agregar plan"
          createItem={() => planItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          summary={(item) => [item.name, item.price].filter(Boolean).join(' · ')}
          renderItem={(item, update) => {
            const benefits = countLines(item.features);
            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField label="Nombre del plan" value={item.name} onChange={(name) => update({ name })} max={60} disabled={disabled} placeholder="Ej.: Básico" />
                  <TextField label="Precio" value={item.price} onChange={(price) => update({ price })} max={30} disabled={disabled} placeholder="Ej.: $29.990" warning={/consultar/i.test(item.price) ? '“A consultar” espanta clientes: si puedes, escribe un precio o un “desde $…”.' : null} />
                  <TextField label="Cada cuánto (opcional)" value={item.period} onChange={(period) => update({ period })} max={30} disabled={disabled} placeholder="Ej.: al mes" />
                </div>
                <TextField label="Descripción corta (opcional)" value={item.description} onChange={(description) => update({ description })} max={200} disabled={disabled} placeholder="Ej.: Ideal para partir." />
                <TextField
                  label="Lo que incluye"
                  value={item.features}
                  onChange={(features) => update({ features })}
                  max={1500}
                  disabled={disabled}
                  multiline
                  rows={4}
                  placeholder={'Visita técnica incluida\nGarantía de 6 meses\nSoporte por WhatsApp'}
                  hint={`Un beneficio por línea. ${benefits === 0 ? 'Todavía no hay ninguno.' : `Llevas ${benefits} ${benefits === 1 ? 'beneficio' : 'beneficios'}.`}`}
                />
                <ButtonFields
                  legend="Botón del plan"
                  label={item.buttonLabel}
                  href={item.buttonHref}
                  onLabel={(buttonLabel) => update({ buttonLabel })}
                  onHref={(buttonHref) => update({ buttonHref })}
                  document={document}
                  pageId={pageId}
                  disabled={disabled}
                  labelPlaceholder="Ej.: Contratar"
                />
                <SwitchRow label="Plan destacado" description="Se resalta con un borde y una etiqueta para guiar la decisión. Destaca solo el que más quieres vender." checked={item.highlighted} onChange={(highlighted) => update({ highlighted, ...(highlighted && !item.badge.trim() ? { badge: 'Recomendado' } : {}) })} disabled={disabled} />
                {item.highlighted ? <TextField label="Etiqueta del plan destacado" value={item.badge} onChange={(badge) => update({ badge })} max={30} disabled={disabled} placeholder="Ej.: Recomendado" hint="Otras ideas: “El más elegido”, “Mejor precio”." /> : null}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}

export function TeamFields({ block, disabled, onChange }: FieldsProps<BlockOf<'team'>>) {
  return (
    <div className="space-y-4">
      <HeadingIntro block={block} disabled={disabled} onChange={(patch) => onChange({ ...block, ...patch })} headingPlaceholder="Ej.: Quiénes somos" introPlaceholder="Ej.: Un equipo pequeño, con muchas ganas de ayudarte." />
      <Tip>Poner cara genera confianza. Usa fotos parecidas entre sí (mismo encuadre y fondo) y una línea sobre cada persona. {PHOTO_TIP}</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Personas ({block.items.length}/{MAX_LIST_ITEMS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="persona"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar persona"
          createItem={() => teamMemberSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          summary={(item) => [item.name, item.role].filter(Boolean).join(' · ')}
          renderItem={(item, update) => (
            <>
              <ImagePicker label="Foto" value={item.photoUrl} onChange={(photoUrl) => update({ photoUrl })} hint="Cuadrada o vertical, con la cara bien visible." />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Nombre" value={item.name} onChange={(name) => update({ name })} max={80} disabled={disabled} placeholder="Ej.: Camila Rojas" />
                <TextField label="Cargo" value={item.role} onChange={(role) => update({ role })} max={80} disabled={disabled} placeholder="Ej.: Arquitecta y fundadora" />
              </div>
              <TextField label="Una línea sobre la persona (opcional)" value={item.bio} onChange={(bio) => update({ bio })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: 12 años diseñando casas en el sur de Chile." />
            </>
          )}
        />
      </div>
    </div>
  );
}

export function QuoteFields({ block, disabled, onChange }: FieldsProps<BlockOf<'quote'>>) {
  const set = (patch: Partial<BlockOf<'quote'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Frase" value={block.quote} onChange={(quote) => set({ quote })} max={400} disabled={disabled} multiline rows={3} placeholder="Ej.: Cocinamos como si cada mesa fuera la de nuestra familia." hint="Una sola frase potente: tu lema, una promesa o la cita de un cliente." />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Quién lo dice (opcional)" value={block.author} onChange={(author) => set({ author })} max={80} disabled={disabled} placeholder="Ej.: Pedro Muñoz" />
        <TextField label="Cargo o descripción (opcional)" value={block.role} onChange={(role) => set({ role })} max={80} disabled={disabled} placeholder="Ej.: Chef y dueño" />
      </div>
      {block.variant === 'photo' ? <ImagePicker label="Foto de quien lo dice" value={block.photoUrl} onChange={(photoUrl) => set({ photoUrl })} hint={`Cuadrada y con la cara centrada se ve mejor. ${PHOTO_TIP}`} /> : null}
    </div>
  );
}

export function LogosFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'logos'>>) {
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección (opcional)" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Han confiado en nosotros" />
      <Tip>Muestra con quién has trabajado o qué te respalda. Usa logos con fondo transparente (PNG) y pide permiso a las marcas.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Logos ({block.items.length}/{MAX_LOGOS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="logo"
          items={block.items}
          max={MAX_LOGOS}
          disabled={disabled}
          addLabel="Agregar logo"
          createItem={() => logoItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          summary={(item) => item.alt}
          renderItem={(item, update) => (
            <>
              <ImagePicker label="Logo" value={item.imageUrl} onChange={(imageUrl, asset) => update({ imageUrl, ...(asset && !item.alt.trim() ? { alt: asset.alt } : {}) })} />
              <TextField label="Nombre de la marca" value={item.alt} onChange={(alt) => update({ alt })} max={160} disabled={disabled} placeholder="Ej.: Panadería Sol" warning={item.imageUrl && !item.alt.trim() ? 'Falta el nombre: lo leen los lectores de pantalla.' : null} />
              <Optional title="Enlace del logo (opcional)" filled={Boolean(item.href.trim())}>
                <LinkField label="Al tocar el logo lleva a…" value={item.href} onChange={(href) => update({ href })} document={document} pageId={pageId} disabled={disabled} />
              </Optional>
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista de precios, catálogo y horario
// ---------------------------------------------------------------------------

export function PricelistFields({ block, disabled, onChange }: FieldsProps<BlockOf<'pricelist'>>) {
  const total = block.categories.reduce((sum, category) => sum + category.items.length, 0);
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Nuestros precios" hint="También aparece en el menú del sitio." />
      <TextField label="Introducción (opcional)" value={block.intro} onChange={(intro) => onChange({ ...block, intro })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Valores vigentes de lunes a sábado." />
      <Tip>Escribe la carta o las tarifas aquí, no como foto ni PDF: en el celular no se leen y Google no las encuentra. Precios claros venden más: “a consultar” espanta clientes.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Categorías ({block.categories.length}/{MAX_PRICE_CATEGORIES}) · {total} {total === 1 ? 'precio' : 'precios'}
        </p>
        <ListEditor
          idPrefix={`${block.id}-cat`}
          noun="categoría"
          items={block.categories}
          max={MAX_PRICE_CATEGORIES}
          disabled={disabled}
          addLabel="Agregar categoría"
          createItem={() => priceCategorySchema.parse({ items: [{}, {}] })}
          onChange={(categories) => onChange({ ...block, categories })}
          summary={(category) => category.title}
          renderItem={(category, updateCategory, categoryIndex) => (
            <>
              <TextField label="Nombre de la categoría" value={category.title} onChange={(title) => updateCategory({ title })} max={60} disabled={disabled} placeholder="Ej.: Cortes de pelo" hint="Agrupa lo parecido: Cortes, Entradas, Mantenciones…" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Precios de esta categoría ({category.items.length}/{MAX_PRICE_ITEMS})
                </p>
                <ListEditor
                  idPrefix={`${block.id}-cat${categoryIndex}-item`}
                  noun="precio"
                  variant="rows"
                  items={category.items}
                  max={MAX_PRICE_ITEMS}
                  disabled={disabled}
                  addLabel="Agregar precio"
                  createItem={() => priceItemSchema.parse({})}
                  onChange={(items) => updateCategory({ items })}
                  renderItem={(item, update) => (
                    <div className="space-y-2 rounded-lg border border-border bg-card p-2">
                      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                        <TextField label="Nombre" value={item.name} onChange={(name) => update({ name })} max={80} disabled={disabled} placeholder="Ej.: Corte + barba" />
                        <TextField label="Precio" value={item.price} onChange={(price) => update({ price })} max={30} disabled={disabled} placeholder="Ej.: $15.000" warning={/consultar/i.test(item.price) ? '“A consultar” espanta clientes: mejor un “desde $…”.' : null} />
                        <TextField label="Etiqueta (opcional)" value={item.tag} onChange={(tag) => update({ tag })} max={24} disabled={disabled} placeholder="Ej.: Nuevo" />
                      </div>
                      <TextField label="Detalle (opcional)" value={item.description} onChange={(description) => update({ description })} max={200} disabled={disabled} placeholder="Ej.: Incluye lavado y peinado." />
                      {block.variant === 'photos' ? <ImagePicker label="Foto (opcional)" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint="Cuadrada y con el producto al centro." /> : null}
                    </div>
                  )}
                />
              </div>
            </>
          )}
        />
      </div>
      <TextField label="Aclaración final (opcional)" value={block.note} onChange={(note) => onChange({ ...block, note })} max={200} disabled={disabled} placeholder="Ej.: Precios con IVA incluido" hint="Dice si incluyen IVA, hasta cuándo valen o si hay recargos." />
    </div>
  );
}

export function CatalogFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'catalog'>>) {
  const set = (patch: Partial<BlockOf<'catalog'>>) => onChange({ ...block, ...patch });
  const ownNumber = whatsappHref(block.whatsapp);
  const siteNumber = whatsappHref(document.whatsapp.number);
  const sample = block.items.find((item) => item.title.trim());
  const example = `Hola, me interesa: ${sample?.title.trim() || 'Sofá Oslo 3 cuerpos'}${sample ? (sample.code.trim() ? ` (código ${sample.code.trim()})` : '') : ' (código SF-102)'}`;
  const missing = !ownNumber && !siteNumber;
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Nuestros productos" hint="También aparece en el menú del sitio." />
      <TextField label="Introducción (opcional)" value={block.intro} onChange={(intro) => set({ intro })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Despachamos a todo Chile. Pregunta por stock." />
      {block.variant === 'grid' || block.variant === 'minimal' ? <ChoiceGroup label="Fichas por fila" value={block.columns} onChange={(columns) => set({ columns })} disabled={disabled} options={COLUMN_OPTIONS} hint="En el celular siempre se ven de a una o dos." /> : null}

      <fieldset className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
        <legend className="px-1 text-sm font-semibold">Botón “Pedir por WhatsApp”</legend>
        <TextField label="Texto del botón" value={block.buttonLabel} onChange={(buttonLabel) => set({ buttonLabel })} max={30} disabled={disabled} placeholder="Pedir por WhatsApp" hint="Si lo dejas vacío se usa “Pedir por WhatsApp”." />
        <TextField
          label="WhatsApp para recibir los pedidos (opcional)"
          type="tel"
          value={block.whatsapp}
          onChange={(whatsapp) => set({ whatsapp })}
          max={40}
          disabled={disabled}
          placeholder="+56 9 1234 5678"
          hint="Si lo dejas vacío, se usa el número del botón flotante de WhatsApp de tu sitio."
          warning={block.whatsapp.trim() && !ownNumber ? 'El número no parece válido: inclúyelo completo, por ejemplo +56 9 1234 5678.' : null}
        />
        {missing ? <Notice>Falta un número de WhatsApp: ni esta sección ni el botón flotante del sitio tienen uno válido, así que los botones no van a funcionar. Escríbelo arriba o actívalo en la pestaña de diseño del sitio.</Notice> : null}
        <p className="text-xs text-muted-foreground">
          Al tocar el botón se abre WhatsApp con el mensaje ya escrito, por ejemplo: <span className="font-medium text-foreground">«{example}»</span>. Así sabes al tiro qué te consultan.
        </p>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Fichas ({block.items.length}/{MAX_CATALOG_ITEMS})
        </p>
        <Tip>Cada ficha con foto propia, nombre, precio y 2–4 datos clave. Usa fotos del mismo tamaño y fondo. {PHOTO_TIP}</Tip>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Button type="button" size="sm" variant="outline" disabled={disabled || block.items.length >= MAX_CATALOG_ITEMS} onClick={() => setImporting(true)}>
            <PackageSearch aria-hidden="true" /> Traer productos del inventario
          </Button>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">Se copian foto, nombre, precio con IVA y código; si cambias el precio en el inventario, vuelve a traerlo.</p>
        </div>
        <ProductImportDialog
          open={importing}
          onOpenChange={setImporting}
          current={block.items.length}
          onImport={(imported) => {
            // Los productos entran al final; si la lista solo tenía las fichas vacías del inicio, se reemplazan.
            const kept = block.items.filter((item) => item.title.trim() || item.imageUrl);
            set({ items: [...kept, ...imported].slice(0, MAX_CATALOG_ITEMS) });
            setImporting(false);
          }}
        />
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="ficha"
          items={block.items}
          max={MAX_CATALOG_ITEMS}
          disabled={disabled}
          addLabel="Agregar ficha"
          createItem={() => catalogItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => [item.title, item.price].filter(Boolean).join(' · ')}
          renderItem={(item, update) => (
            <>
              <ImagePicker label="Foto" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint="Horizontal o cuadrada, con buena luz." />
              {item.title.trim() && !item.imageUrl ? <Notice>Las fichas con foto se venden mucho más. Agrega una si puedes.</Notice> : null}
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <TextField label="Nombre" value={item.title} onChange={(title) => update({ title })} max={80} disabled={disabled} placeholder="Ej.: Sofá Oslo 3 cuerpos" />
                <TextField label="Precio" value={item.price} onChange={(price) => update({ price })} max={30} disabled={disabled} placeholder="Ej.: $289.990" warning={/consultar/i.test(item.price) ? '“A consultar” espanta clientes: mejor un “desde $…”.' : null} />
              </div>
              <TextField label="Datos clave (opcional)" value={item.details} onChange={(details) => update({ details })} max={200} disabled={disabled} placeholder="Ej.: 3 dormitorios · 2 baños · 80 m²" hint="Separa los datos con un punto medio (·)." />
              <TextField label="Descripción (opcional)" value={item.description} onChange={(description) => update({ description })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Tapiz antimanchas, patas de madera de roble." />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Código (opcional)" value={item.code} onChange={(code) => update({ code })} max={30} disabled={disabled} placeholder="Ej.: SF-102" hint="Viaja en el mensaje de WhatsApp." />
                <TextField label="Etiqueta (opcional)" value={item.badge} onChange={(badge) => update({ badge })} max={24} disabled={disabled} placeholder="Ej.: Nuevo" />
              </div>
            </>
          )}
        />
      </div>
      <span className="sr-only">{pageId}</span>
    </div>
  );
}

const DAYS_LIST = 'Lunes,Martes,Miércoles,Jueves,Viernes,Sábado,Domingo,Lunes a viernes,Todos los días'.split(',');

function Cell({ label, value, onChange, max, placeholder, disabled, list }: { label: string; value: string; onChange: (value: string) => void; max: number; placeholder: string; disabled: boolean; list?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground md:sr-only">
        {label}
      </Label>
      <Input id={id} value={value} maxLength={max} placeholder={placeholder} disabled={disabled} list={list} className="h-9" onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function ScheduleFields({ block, disabled, onChange }: FieldsProps<BlockOf<'schedule'>>) {
  const listId = useId();
  const grid = 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)]';
  return (
    <div className="space-y-4">
      <HeadingIntro block={block} disabled={disabled} onChange={(patch) => onChange({ ...block, ...patch })} headingPlaceholder="Ej.: Horario de clases" introPlaceholder="Ej.: Cupos limitados: reserva por WhatsApp." />
      <Tip>Escribe el horario aquí y no como foto: en el celular una imagen no se puede leer. Filas seguidas con el mismo día se agrupan solas bajo ese día.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Filas ({block.rows.length}/{MAX_SCHEDULE_ROWS})
        </p>
        <datalist id={listId}>
          {DAYS_LIST.map((day) => (
            <option key={day} value={day} />
          ))}
        </datalist>
        <div aria-hidden="true" className={`hidden gap-2 px-0 text-xs font-medium text-muted-foreground md:grid md:pr-[7.9rem] ${grid}`}>
          <span>Día</span>
          <span>Hora</span>
          <span>Actividad</span>
          <span>Detalle</span>
        </div>
        <ListEditor
          idPrefix={`${block.id}-row`}
          noun="fila"
          variant="rows"
          items={block.rows}
          max={MAX_SCHEDULE_ROWS}
          disabled={disabled}
          addLabel="Agregar fila"
          duplicateLabel="Duplicar fila"
          createItem={() => scheduleRowSchema.parse({})}
          onChange={(rows) => onChange({ ...block, rows })}
          renderItem={(row, update) => (
            <div className={`grid gap-2 ${grid}`}>
              <Cell label="Día" value={row.day} onChange={(day) => update({ day })} max={40} placeholder="Ej.: Lunes" disabled={disabled} list={listId} />
              <Cell label="Hora" value={row.time} onChange={(time) => update({ time })} max={40} placeholder="Ej.: 19:00 a 20:00" disabled={disabled} />
              <Cell label="Actividad" value={row.title} onChange={(title) => update({ title })} max={80} placeholder="Ej.: Yoga suave" disabled={disabled} />
              <Cell label="Detalle" value={row.detail} onChange={(detail) => update({ detail })} max={160} placeholder="Ej.: Sala 2 · Profe Carla" disabled={disabled} />
            </div>
          )}
        />
        <p className="text-xs text-muted-foreground">Para cargar rápido: escribe una fila y usa “Duplicar fila”; después solo cambias la hora o la actividad.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video, mapa y cuenta regresiva
// ---------------------------------------------------------------------------

export function VideoFields({ block, disabled, onChange }: FieldsProps<BlockOf<'video'>>) {
  const set = (patch: Partial<BlockOf<'video'>>) => onChange({ ...block, ...patch });
  const embed = videoEmbed(block.url);
  const typed = block.url.trim().length > 0;
  return (
    <div className="space-y-4">
      <HeadingIntro block={{ heading: block.heading, intro: block.intro }} disabled={disabled} onChange={(patch) => set(patch)} headingPlaceholder="Ej.: Conócenos en 1 minuto" introPlaceholder="Ej.: Mira cómo trabajamos por dentro." />
      <div className="space-y-1.5">
        <TextField
          label="Enlace del video"
          type="url"
          value={block.url}
          onChange={(url) => set({ url })}
          max={300}
          disabled={disabled}
          placeholder="Ej.: https://www.youtube.com/watch?v=abc123XYZ90"
          hint="Pega el enlace de YouTube o Vimeo tal como lo copias desde el navegador. Los videos cortos (menos de 2 minutos) se ven completos."
          error={typed && !embed ? 'Pega el enlace de YouTube o Vimeo.' : null}
        />
        {embed ? (
          <p role="status" className="flex flex-wrap items-center gap-2 text-xs font-medium text-success">
            <span>Video de {embed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} reconocido ✓</span>
            <a href={embed.watchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-normal text-info underline underline-offset-2">
              Abrirlo para comprobar <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </p>
        ) : !typed ? (
          <p className="text-xs text-muted-foreground">Todavía no pegaste el enlace.</p>
        ) : null}
      </div>
      <TextField label="Texto bajo el video (opcional)" value={block.caption} onChange={(caption) => set({ caption })} max={200} disabled={disabled} placeholder="Ej.: Recorrido por nuestro taller en Temuco." />
    </div>
  );
}

export function MapFields({ block, disabled, onChange }: FieldsProps<BlockOf<'map'>>) {
  const set = (patch: Partial<BlockOf<'map'>>) => onChange({ ...block, ...patch });
  const test = mapLinkUrl(block.address);
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Dónde estamos" hint="También aparece en el menú del sitio." />
      <TextField label="Texto de apoyo (opcional)" value={block.text} onChange={(text) => set({ text })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: A media cuadra del metro Los Leones. Hay estacionamiento." />
      <div className="space-y-1.5">
        <TextField label="Dirección" value={block.address} onChange={(address) => set({ address })} max={200} disabled={disabled} placeholder="Ej.: Av. Providencia 1234, Providencia, Santiago" hint="Escríbela completa, con comuna y ciudad, como la buscarías en Google Maps." />
        {test ? (
          <a href={test} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-info underline underline-offset-2">
            Probar en Google Maps <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">Escribe la dirección para poder probarla en Google Maps.</p>
        )}
      </div>
      <ChoiceGroup
        label="Alto del mapa"
        value={block.height}
        onChange={(height) => set({ height })}
        disabled={disabled}
        options={[
          { value: 'sm', label: 'Bajo', description: 'Ocupa poco espacio.', preview: <VariantSketch id="map:sm" /> },
          { value: 'md', label: 'Medio', description: 'El más usado.', preview: <VariantSketch id="map:md" /> },
          { value: 'lg', label: 'Alto', description: 'Protagonista de la página.', preview: <VariantSketch id="map:lg" /> },
        ]}
      />
    </div>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CountdownFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'countdown'>>) {
  const set = (patch: Partial<BlockOf<'countdown'>>) => onChange({ ...block, ...patch });
  const id = useId();
  const [now] = useState(() => Date.now());
  const target = block.target ? new Date(block.target) : null;
  const valid = target !== null && !Number.isNaN(target.getTime());
  const past = valid && target.getTime() <= now;
  return (
    <div className="space-y-4">
      <TextField label="Título" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Gran inauguración" hint="También aparece en el menú del sitio." />
      <TextField label="Texto de apoyo (opcional)" value={block.text} onChange={(text) => set({ text })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Sábado 12 con música en vivo, sorteos y descuentos." />
      <div className="space-y-1.5">
        <Label htmlFor={id}>Fecha y hora de término</Label>
        <Input
          id={id}
          type="datetime-local"
          disabled={disabled}
          value={toLocalInput(block.target)}
          aria-describedby={`${id}-info`}
          onChange={(event) => {
            const parsed = event.target.value ? new Date(event.target.value) : null;
            set({ target: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '' });
          }}
        />
        <p id={`${id}-info`} className="text-xs text-muted-foreground">
          {valid ? `Termina el ${target.toLocaleString('es-CL', { dateStyle: 'full', timeStyle: 'short' })} (hora de tu computador). ` : 'Elige cuándo termina la cuenta regresiva. '}
          Se guarda con tu zona horaria, así que todas las visitas ven el mismo momento de término.
        </p>
        {past ? <Notice>Esa fecha ya pasó: la cuenta regresiva mostrará directamente el mensaje final. Elige una fecha futura.</Notice> : null}
      </div>
      <TextField label="Mensaje cuando termine" value={block.endedText} onChange={(endedText) => set({ endedText })} max={120} disabled={disabled} placeholder="Ej.: ¡Ya comenzó! Te esperamos." />
      <ButtonFields
        legend="Botón (opcional)"
        label={block.buttonLabel}
        href={block.buttonHref}
        onLabel={(buttonLabel) => set({ buttonLabel })}
        onHref={(buttonHref) => set({ buttonHref })}
        document={document}
        pageId={pageId}
        disabled={disabled}
        labelPlaceholder="Ej.: Reservar mi lugar"
      />
    </div>
  );
}
