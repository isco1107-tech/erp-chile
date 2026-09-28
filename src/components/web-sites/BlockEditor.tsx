'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  faqItemSchema,
  featureItemSchema,
  galleryImageSchema,
  MAX_GALLERY_IMAGES,
  MAX_LIST_ITEMS,
  testimonialItemSchema,
  type BlockOf,
  type WebSiteBlock,
} from '@/lib/web-sites/blocks';
import { safeHref, whatsappHref } from '@/lib/web-sites/urls';
import { ImagePicker } from './ImagePicker';
import { SwitchRow, TextField } from './fields';

// ---------------------------------------------------------------------------
// Lista de ítems con agregar / quitar / reordenar
// ---------------------------------------------------------------------------

interface ListEditorProps<T extends object> {
  idPrefix: string;
  /** "tarjeta", "pregunta"…: se usa en los títulos y en los textos de los botones. */
  noun: string;
  items: T[];
  max: number;
  disabled?: boolean;
  addLabel: string;
  createItem: () => T;
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
}

function ListEditor<T extends object>({ idPrefix, noun, items, max, disabled, addLabel, createItem, onChange, renderItem }: ListEditorProps<T>) {
  const confirm = useConfirm();
  const focusRequest = useRef<{ index: number; dir: -1 | 1 } | null>(null);

  // Tras reordenar, el foco vuelve al botón del ítem que se movió (o a su par si ya no puede seguir).
  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    const up = document.getElementById(`${idPrefix}-${request.index}-up`) as HTMLButtonElement | null;
    const down = document.getElementById(`${idPrefix}-${request.index}-down`) as HTMLButtonElement | null;
    const first = request.dir === -1 ? up : down;
    const second = request.dir === -1 ? down : up;
    (first && !first.disabled ? first : second)?.focus();
  }, [items, idPrefix]);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    focusRequest.current = { index: target, dir };
    onChange(next);
  }

  async function remove(index: number) {
    const item = items[index];
    const hasContent = item ? Object.values(item).some((value) => typeof value === 'string' && value.trim() !== '') : false;
    if (hasContent && !(await confirm({ title: `¿Quitar la ${noun} ${index + 1}?`, description: 'Se perderá lo que escribiste en ella.', confirmLabel: 'Quitar' }))) return;
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">Todavía no hay ninguna {noun}. Agrega la primera.</p> : null}
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={index} className="rounded-lg border border-border bg-muted/40">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {noun} {index + 1}
              </p>
              <div className="flex items-center gap-0.5">
                <Button id={`${idPrefix}-${index}-up`} type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`Subir ${noun} ${index + 1}`} onClick={() => move(index, -1)}>
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button id={`${idPrefix}-${index}-down`} type="button" variant="ghost" size="icon-sm" disabled={disabled || index === items.length - 1} aria-label={`Bajar ${noun} ${index + 1}`} onClick={() => move(index, 1)}>
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Quitar ${noun} ${index + 1}`} onClick={() => void remove(index)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="space-y-3 p-3">{renderItem(item, (patch) => onChange(items.map((current, i) => (i === index ? { ...current, ...patch } : current))), index)}</div>
          </li>
        ))}
      </ol>
      <Button type="button" size="sm" variant="outline" disabled={disabled || items.length >= max} onClick={() => onChange([...items, createItem()])}>
        <Plus aria-hidden="true" /> {addLabel}
      </Button>
      {items.length >= max ? <p className="text-xs text-muted-foreground">Llegaste al máximo de {max}.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campos por tipo de sección
// ---------------------------------------------------------------------------

const LINK_HINT = 'Puede ser una página (https://…), un correo, un teléfono o #contacto para bajar a esa sección.';
const LINK_ERROR = 'Este enlace no parece válido. Usa https://…, un correo, un teléfono o #contacto.';

interface BlockFieldsProps {
  block: WebSiteBlock;
  disabled: boolean;
  onChange: (block: WebSiteBlock) => void;
}

/** Formulario de una sección: los campos dependen del tipo. */
export function BlockFields({ block, disabled, onChange }: BlockFieldsProps) {
  switch (block.type) {
    case 'hero':
      return <HeroFields block={block} disabled={disabled} onChange={onChange} />;
    case 'text':
      return <TextFields block={block} disabled={disabled} onChange={onChange} />;
    case 'image':
      return <ImageFields block={block} disabled={disabled} onChange={onChange} />;
    case 'gallery':
      return <GalleryFields block={block} disabled={disabled} onChange={onChange} />;
    case 'features':
      return <FeaturesFields block={block} disabled={disabled} onChange={onChange} />;
    case 'cta':
      return <CtaFields block={block} disabled={disabled} onChange={onChange} />;
    case 'faq':
      return <FaqFields block={block} disabled={disabled} onChange={onChange} />;
    case 'testimonials':
      return <TestimonialsFields block={block} disabled={disabled} onChange={onChange} />;
    case 'contact':
      return <ContactFields block={block} disabled={disabled} onChange={onChange} />;
  }
}

interface FieldsProps<T extends WebSiteBlock> {
  block: T;
  disabled: boolean;
  onChange: (block: WebSiteBlock) => void;
}

function HeroFields({ block, disabled, onChange }: FieldsProps<BlockOf<'hero'>>) {
  const set = (patch: Partial<BlockOf<'hero'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Título principal" value={block.title} onChange={(title) => set({ title })} max={120} disabled={disabled} placeholder="Ej.: Diseño de interiores para tu hogar" hint="Di en una frase qué haces y para quién." />
      <TextField label="Frase de apoyo" value={block.subtitle} onChange={(subtitle) => set({ subtitle })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Proyectos a medida, desde la idea hasta la instalación." />
      <ImagePicker label="Imagen de fondo" value={block.imageUrl} onChange={(imageUrl) => set({ imageUrl })} hint="Opcional. Una foto horizontal y luminosa se ve mejor." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Texto del botón"
          value={block.ctaLabel}
          onChange={(ctaLabel) => set({ ctaLabel })}
          max={40}
          disabled={disabled}
          placeholder="Ej.: Cotizar"
          error={block.ctaHref.trim() && !block.ctaLabel.trim() ? 'Escribe el texto del botón; sin texto no se puede publicar.' : null}
        />
        <TextField
          label="Enlace del botón"
          value={block.ctaHref}
          onChange={(ctaHref) => set({ ctaHref })}
          max={500}
          disabled={disabled}
          placeholder="Ej.: https://wa.me/56912345678"
          hint={LINK_HINT}
          error={block.ctaHref.trim() && !safeHref(block.ctaHref) ? LINK_ERROR : null}
        />
      </div>
    </div>
  );
}

function TextFields({ block, disabled, onChange }: FieldsProps<BlockOf<'text'>>) {
  const set = (patch: Partial<BlockOf<'text'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Quiénes somos" hint="Este título también aparece en el menú de arriba del sitio." />
      <TextField label="Texto" value={block.body} onChange={(body) => set({ body })} max={4000} disabled={disabled} multiline rows={7} placeholder="Cuenta tu historia en pocas líneas…" hint="Separa los párrafos con una línea en blanco." />
    </div>
  );
}

function ImageFields({ block, disabled, onChange }: FieldsProps<BlockOf<'image'>>) {
  const set = (patch: Partial<BlockOf<'image'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <ImagePicker label="Imagen" value={block.imageUrl} onChange={(imageUrl, asset) => set({ imageUrl, ...(asset && !block.alt.trim() ? { alt: asset.alt } : {}) })} />
      <TextField
        label="Descripción de la imagen"
        value={block.alt}
        onChange={(alt) => set({ alt })}
        max={160}
        disabled={disabled}
        placeholder="Ej.: Cocina blanca con isla de madera"
        hint="Describe lo que se ve: la leen los lectores de pantalla y ayuda a que te encuentren en Google."
        warning={block.imageUrl && !block.alt.trim() ? 'Falta la descripción de la imagen.' : null}
      />
      <TextField label="Pie de foto (opcional)" value={block.caption} onChange={(caption) => set({ caption })} max={200} disabled={disabled} placeholder="Ej.: Proyecto terminado en Providencia, 2025" />
    </div>
  );
}

function GalleryFields({ block, disabled, onChange }: FieldsProps<BlockOf<'gallery'>>) {
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Nuestros trabajos" />
      <div className="space-y-2">
        <p className="text-sm font-medium">Fotos ({block.images.length}/{MAX_GALLERY_IMAGES})</p>
        <ListEditor
          idPrefix={`${block.id}-image`}
          noun="foto"
          items={block.images}
          max={MAX_GALLERY_IMAGES}
          disabled={disabled}
          addLabel="Agregar foto"
          createItem={() => galleryImageSchema.parse({})}
          onChange={(images) => onChange({ ...block, images })}
          renderItem={(image, update) => (
            <>
              <ImagePicker label="Foto" value={image.url} onChange={(url, asset) => update({ url, ...(asset && !image.alt.trim() ? { alt: asset.alt } : {}) })} />
              <TextField
                label="Descripción de la foto"
                value={image.alt}
                onChange={(alt) => update({ alt })}
                max={160}
                disabled={disabled}
                placeholder="Ej.: Baño con tinas de cerámica"
                warning={image.url && !image.alt.trim() ? 'Falta la descripción de la foto.' : null}
              />
            </>
          )}
        />
      </div>
    </div>
  );
}

function FeaturesFields({ block, disabled, onChange }: FieldsProps<BlockOf<'features'>>) {
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Nuestros servicios" />
      <TextField label="Introducción (opcional)" value={block.intro} onChange={(intro) => onChange({ ...block, intro })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Todo lo que necesitas en un solo lugar." />
      <div className="space-y-2">
        <p className="text-sm font-medium">Tarjetas ({block.items.length}/{MAX_LIST_ITEMS})</p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="tarjeta"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar tarjeta"
          createItem={() => featureItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <>
              <TextField label="Título" value={item.title} onChange={(title) => update({ title })} max={80} disabled={disabled} placeholder="Ej.: Instalación en 48 horas" />
              <TextField label="Descripción" value={item.text} onChange={(text) => update({ text })} max={400} disabled={disabled} multiline rows={3} placeholder="Ej.: Coordinamos la visita y dejamos todo funcionando." />
              <ImagePicker label="Imagen (opcional)" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} />
            </>
          )}
        />
      </div>
    </div>
  );
}

function CtaFields({ block, disabled, onChange }: FieldsProps<BlockOf<'cta'>>) {
  const set = (patch: Partial<BlockOf<'cta'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Mensaje principal" value={block.title} onChange={(title) => set({ title })} max={120} disabled={disabled} placeholder="Ej.: ¿Listo para empezar?" />
      <TextField label="Texto de apoyo (opcional)" value={block.text} onChange={(text) => set({ text })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Cuéntanos tu proyecto y te respondemos en el día." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Texto del botón"
          value={block.buttonLabel}
          onChange={(buttonLabel) => set({ buttonLabel })}
          max={40}
          disabled={disabled}
          placeholder="Ej.: Escribir por WhatsApp"
          error={block.buttonHref.trim() && !block.buttonLabel.trim() ? 'Escribe el texto del botón; sin texto no se puede publicar.' : null}
        />
        <TextField
          label="Enlace del botón"
          value={block.buttonHref}
          onChange={(buttonHref) => set({ buttonHref })}
          max={500}
          disabled={disabled}
          placeholder="Ej.: https://wa.me/56912345678"
          hint={LINK_HINT}
          error={block.buttonHref.trim() && !safeHref(block.buttonHref) ? LINK_ERROR : null}
        />
      </div>
    </div>
  );
}

function FaqFields({ block, disabled, onChange }: FieldsProps<BlockOf<'faq'>>) {
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Preguntas frecuentes" />
      <div className="space-y-2">
        <p className="text-sm font-medium">Preguntas ({block.items.length}/{MAX_LIST_ITEMS})</p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="pregunta"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar pregunta"
          createItem={() => faqItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <>
              <TextField label="Pregunta" value={item.question} onChange={(question) => update({ question })} max={200} disabled={disabled} placeholder="Ej.: ¿Hacen despacho a regiones?" />
              <TextField label="Respuesta" value={item.answer} onChange={(answer) => update({ answer })} max={1000} disabled={disabled} multiline rows={3} placeholder="Ej.: Sí, despachamos a todo Chile por Starken. El plazo es de 2 a 5 días hábiles." />
            </>
          )}
        />
      </div>
    </div>
  );
}

function TestimonialsFields({ block, disabled, onChange }: FieldsProps<BlockOf<'testimonials'>>) {
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Lo que dicen nuestros clientes" />
      <div className="space-y-2">
        <p className="text-sm font-medium">Testimonios ({block.items.length}/{MAX_LIST_ITEMS})</p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="testimonio"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar testimonio"
          createItem={() => testimonialItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <>
              <TextField label="Lo que dijo" value={item.quote} onChange={(quote) => update({ quote })} max={500} disabled={disabled} multiline rows={3} placeholder="Ej.: Quedamos felices con el resultado, cumplieron los plazos." />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nombre" value={item.author} onChange={(author) => update({ author })} max={80} disabled={disabled} placeholder="Ej.: María González" />
                <TextField label="Cargo o empresa (opcional)" value={item.role} onChange={(role) => update({ role })} max={80} disabled={disabled} placeholder="Ej.: Gerenta, Panadería Sol" />
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}

function ContactFields({ block, disabled, onChange }: FieldsProps<BlockOf<'contact'>>) {
  const set = (patch: Partial<BlockOf<'contact'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Contacto" hint="Se llama “Contacto” para que los botones con enlace #contacto bajen hasta aquí." />
      <TextField label="Texto de apoyo (opcional)" value={block.text} onChange={(text) => set({ text })} max={400} disabled={disabled} multiline rows={2} placeholder="Ej.: Escríbenos y te respondemos en menos de 24 horas." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Correo"
          type="email"
          value={block.email}
          onChange={(email) => set({ email })}
          max={120}
          disabled={disabled}
          placeholder="hola@tudominio.cl"
          error={block.email.trim() && !safeHref(`mailto:${block.email.trim()}`) ? 'Este correo no parece válido.' : null}
        />
        <TextField label="Teléfono" type="tel" value={block.phone} onChange={(phone) => set({ phone })} max={40} disabled={disabled} placeholder="+56 2 2345 6789" />
        <TextField
          label="WhatsApp"
          type="tel"
          value={block.whatsapp}
          onChange={(whatsapp) => set({ whatsapp })}
          max={40}
          disabled={disabled}
          placeholder="+56 9 1234 5678"
          hint="Con código de país, para que el botón abra la conversación."
          warning={block.whatsapp.trim() && !whatsappHref(block.whatsapp) ? 'El número no parece válido: inclúyelo completo, por ejemplo +56 9 1234 5678.' : null}
        />
        <TextField label="Dirección (opcional)" value={block.address} onChange={(address) => set({ address })} max={200} disabled={disabled} placeholder="Ej.: Av. Providencia 1234, Santiago" />
      </div>
      <SwitchRow label="Mostrar formulario de mensajes" description="Lo que escriban las visitas llega a la pestaña Mensajes de este sitio y te avisamos en el panel." checked={block.showForm} onChange={(showForm) => set({ showForm })} disabled={disabled} />
    </div>
  );
}
