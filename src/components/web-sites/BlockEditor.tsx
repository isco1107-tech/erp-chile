'use client';

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
import type { SiteDocument } from '@/lib/web-sites/site';
import { safeHref, whatsappHref } from '@/lib/web-sites/urls';
import { VariantSketch } from './block-sketches';
import {
  CatalogFields,
  CountdownFields,
  LogosFields,
  MapFields,
  PricelistFields,
  PricingFields,
  QuoteFields,
  ScheduleFields,
  StatsFields,
  StepsFields,
  TeamFields,
  VideoFields,
} from './BlockEditorMore';
import { ButtonFields, Notice, Optional, PHOTO_TIP, Tip, type FieldsProps } from './block-fields-shared';
import { ChoiceGroup, SwitchRow, TextField } from './fields';
import { IconPicker } from './IconPicker';
import { ImagePicker } from './ImagePicker';
import { LinkField } from './LinkField';
import { ListEditor } from './ListEditor';
import { RichTextField } from './RichTextField';
import { StarRating } from './StarRating';

interface BlockFieldsProps {
  block: WebSiteBlock;
  disabled: boolean;
  onChange: (block: WebSiteBlock) => void;
  /** Sitio completo y página actual: los campos de enlace ofrecen páginas y secciones. */
  document: SiteDocument;
  pageId: string;
}

/** Formulario de una sección: los campos dependen del tipo. */
export function BlockFields({ block, disabled, onChange, document, pageId }: BlockFieldsProps) {
  const common = { disabled, onChange, document, pageId };
  switch (block.type) {
    case 'hero':
      return <HeroFields block={block} {...common} />;
    case 'text':
      return <TextFields block={block} {...common} />;
    case 'split':
      return <SplitFields block={block} {...common} />;
    case 'image':
      return <ImageFields block={block} {...common} />;
    case 'gallery':
      return <GalleryFields block={block} {...common} />;
    case 'features':
      return <FeaturesFields block={block} {...common} />;
    case 'stats':
      return <StatsFields block={block} {...common} />;
    case 'steps':
      return <StepsFields block={block} {...common} />;
    case 'pricing':
      return <PricingFields block={block} {...common} />;
    case 'team':
      return <TeamFields block={block} {...common} />;
    case 'testimonials':
      return <TestimonialsFields block={block} {...common} />;
    case 'quote':
      return <QuoteFields block={block} {...common} />;
    case 'logos':
      return <LogosFields block={block} {...common} />;
    case 'pricelist':
      return <PricelistFields block={block} {...common} />;
    case 'catalog':
      return <CatalogFields block={block} {...common} />;
    case 'schedule':
      return <ScheduleFields block={block} {...common} />;
    case 'faq':
      return <FaqFields block={block} {...common} />;
    case 'cta':
      return <CtaFields block={block} {...common} />;
    case 'video':
      return <VideoFields block={block} {...common} />;
    case 'map':
      return <MapFields block={block} {...common} />;
    case 'countdown':
      return <CountdownFields block={block} {...common} />;
    case 'contact':
      return <ContactFields block={block} {...common} />;
    case 'divider':
      return <DividerFields block={block} {...common} />;
  }
}

const COLUMN_OPTIONS = [
  { value: '2' as const, label: '2 columnas', description: 'Tarjetas grandes.', preview: <VariantSketch id="cols:2" /> },
  { value: '3' as const, label: '3 columnas', description: 'El equilibrio ideal.', preview: <VariantSketch id="cols:3" /> },
  { value: '4' as const, label: '4 columnas', description: 'Muchas a la vista.', preview: <VariantSketch id="cols:4" /> },
];

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

function HeroFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'hero'>>) {
  const set = (patch: Partial<BlockOf<'hero'>>) => onChange({ ...block, ...patch });
  const usesImage = block.variant !== 'minimal';
  return (
    <div className="space-y-5">
      <ChoiceGroup
        label="Diseño de la portada"
        value={block.variant}
        onChange={(variant) => set({ variant })}
        disabled={disabled}
        columns={4}
        hint="“Dividida” va muy bien para servicios y profesionales. “Pantalla completa”, con una foto propia bonita, funciona de maravilla en restaurantes, turismo y belleza."
        options={[
          { value: 'center', label: 'Centrada', description: 'Título al centro sobre color o foto.', preview: <VariantSketch id="hero:center" /> },
          { value: 'split', label: 'Dividida', description: 'Texto a un lado y foto al otro.', preview: <VariantSketch id="hero:split" /> },
          { value: 'full', label: 'Pantalla completa', description: 'Foto grande que ocupa todo.', preview: <VariantSketch id="hero:full" /> },
          { value: 'minimal', label: 'Mínima', description: 'Solo texto, sin franja de color.', preview: <VariantSketch id="hero:minimal" /> },
        ]}
      />
      <TextField label="Texto pequeño sobre el título (opcional)" value={block.eyebrow} onChange={(eyebrow) => set({ eyebrow })} max={60} disabled={disabled} placeholder="Ej.: Desde 1998 en Concepción" />
      <TextField label="Título principal" value={block.title} onChange={(title) => set({ title })} max={120} disabled={disabled} placeholder="Ej.: Instalamos paneles solares en todo el Biobío" hint="Di en una frase qué haces y para quién." />
      <TextField label="Frase de apoyo" value={block.subtitle} onChange={(subtitle) => set({ subtitle })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Ahorra hasta un 70 % en tu cuenta de luz, con instalación y garantía incluidas." />
      {usesImage ? (
        <div className="space-y-2">
          <ImagePicker label={block.variant === 'split' ? 'Foto al costado' : 'Foto de fondo'} value={block.imageUrl} onChange={(imageUrl) => set({ imageUrl })} hint={`Horizontal y luminosa se ve mejor. ${PHOTO_TIP}`} />
          {!block.imageUrl && (block.variant === 'split' || block.variant === 'full') ? <Notice>Esta portada se ve mucho mejor con una foto. Sin ella queda vacía.</Notice> : null}
        </div>
      ) : (
        <Tip>La portada mínima no lleva foto. Si quieres una imagen, elige otro diseño arriba.</Tip>
      )}
      <ButtonFields
        legend="Botón principal"
        label={block.ctaLabel}
        href={block.ctaHref}
        onLabel={(ctaLabel) => set({ ctaLabel })}
        onHref={(ctaHref) => set({ ctaHref })}
        document={document}
        pageId={pageId}
        disabled={disabled}
        labelPlaceholder="Ej.: Cotizar gratis"
        linkHint="Lo ideal: que lleve a la acción más importante (escribirte, cotizar, comprar)."
      />
      <Optional title="Segundo botón (opcional)" filled={Boolean(block.secondaryLabel.trim() || block.secondaryHref.trim())}>
        <ButtonFields
          legend="Segundo botón"
          label={block.secondaryLabel}
          href={block.secondaryHref}
          onLabel={(secondaryLabel) => set({ secondaryLabel })}
          onHref={(secondaryHref) => set({ secondaryHref })}
          document={document}
          pageId={pageId}
          disabled={disabled}
          labelPlaceholder="Ej.: Ver trabajos"
          labelHint="Una opción más suave que el botón principal, por ejemplo “Ver trabajos”."
        />
      </Optional>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Texto, imagen y texto, imagen, galería
// ---------------------------------------------------------------------------

function TextFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'text'>>) {
  const set = (patch: Partial<BlockOf<'text'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Quiénes somos" hint="Este título también aparece en el menú del sitio." />
      <RichTextField
        label="Texto"
        value={block.body}
        onChange={(body) => set({ body })}
        max={4000}
        rows={8}
        disabled={disabled}
        document={document}
        pageId={pageId}
        placeholder="Ej.: Somos una pyme familiar de Valdivia. Desde 2010 fabricamos muebles a medida con maderas nativas certificadas."
        hint="Párrafos cortos (3–4 líneas) se leen mejor en el celular. Separa los párrafos con una línea en blanco."
      />
    </div>
  );
}

function SplitFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'split'>>) {
  const set = (patch: Partial<BlockOf<'split'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Texto pequeño sobre el título (opcional)" value={block.eyebrow} onChange={(eyebrow) => set({ eyebrow })} max={60} disabled={disabled} placeholder="Ej.: Nuestro taller" />
      <TextField label="Título" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Hecho a mano, a tu medida" hint="También aparece en el menú del sitio." />
      <RichTextField label="Texto" value={block.body} onChange={(body) => set({ body })} max={3000} rows={6} disabled={disabled} document={document} pageId={pageId} placeholder="Ej.: Cada mueble se diseña contigo y se fabrica en nuestro taller de Valdivia en 3 semanas." />
      <ImagePicker label="Foto" value={block.imageUrl} onChange={(imageUrl, asset) => set({ imageUrl, ...(asset && !block.alt.trim() ? { alt: asset.alt } : {}) })} hint={PHOTO_TIP} />
      <TextField label="Descripción de la foto" value={block.alt} onChange={(alt) => set({ alt })} max={160} disabled={disabled} placeholder="Ej.: Carpintero lijando una mesa de roble" hint="Describe lo que se ve: la leen los lectores de pantalla y ayuda a que te encuentren en Google." warning={block.imageUrl && !block.alt.trim() ? 'Falta la descripción de la foto.' : null} />
      <ChoiceGroup
        label="¿De qué lado va la foto?"
        value={block.imageSide}
        onChange={(imageSide) => set({ imageSide })}
        disabled={disabled}
        columns={2}
        hint="Alterna el lado entre secciones seguidas para que la página respire."
        options={[
          { value: 'left', label: 'A la izquierda', preview: <VariantSketch id="side:left" /> },
          { value: 'right', label: 'A la derecha', preview: <VariantSketch id="side:right" /> },
        ]}
      />
      <Optional title="Botón (opcional)" filled={Boolean(block.buttonLabel.trim() || block.buttonHref.trim())}>
        <ButtonFields legend="Botón" label={block.buttonLabel} href={block.buttonHref} onLabel={(buttonLabel) => set({ buttonLabel })} onHref={(buttonHref) => set({ buttonHref })} document={document} pageId={pageId} disabled={disabled} labelPlaceholder="Ej.: Ver más trabajos" />
      </Optional>
    </div>
  );
}

function ImageFields({ block, disabled, onChange }: FieldsProps<BlockOf<'image'>>) {
  const set = (patch: Partial<BlockOf<'image'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <ImagePicker label="Imagen" value={block.imageUrl} onChange={(imageUrl, asset) => set({ imageUrl, ...(asset && !block.alt.trim() ? { alt: asset.alt } : {}) })} hint={PHOTO_TIP} />
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
      <ChoiceGroup
        label="Tamaño de la imagen"
        value={block.size}
        onChange={(size) => set({ size })}
        disabled={disabled}
        options={[
          { value: 'normal', label: 'Normal', description: 'Del ancho del texto.', preview: <VariantSketch id="image:normal" /> },
          { value: 'wide', label: 'Ancha', description: 'Un poco más grande que el texto.', preview: <VariantSketch id="image:wide" /> },
          { value: 'full', label: 'Completa', description: 'De borde a borde de la pantalla.', preview: <VariantSketch id="image:full" /> },
        ]}
      />
    </div>
  );
}

function GalleryFields({ block, disabled, onChange }: FieldsProps<BlockOf<'gallery'>>) {
  const set = (patch: Partial<BlockOf<'gallery'>>) => onChange({ ...block, ...patch });
  const withPhoto = block.images.filter((image) => image.url).length;
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Nuestros trabajos" hint="También aparece en el menú del sitio." />
      <ChoiceGroup
        label="Cómo se muestran las fotos"
        value={block.variant}
        onChange={(variant) => set({ variant })}
        disabled={disabled}
        options={[
          { value: 'grid', label: 'Cuadrícula', description: 'Todas del mismo tamaño, ordenadas.', preview: <VariantSketch id="gallery:grid" /> },
          { value: 'masonry', label: 'Mosaico', description: 'Alturas distintas; más informal.', preview: <VariantSketch id="gallery:masonry" /> },
          { value: 'carousel', label: 'Carrusel', description: 'Se desliza de a una; ocupa poco.', preview: <VariantSketch id="gallery:carousel" /> },
        ]}
      />
      {block.variant !== 'carousel' ? <ChoiceGroup label="Fotos por fila" value={block.columns} onChange={(columns) => set({ columns })} disabled={disabled} options={COLUMN_OPTIONS} hint="En el celular se ven de a una o dos, sin importar lo que elijas." /> : null}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Fotos ({block.images.length}/{MAX_GALLERY_IMAGES})
        </p>
        <Tip>Entre 3 y 9 fotos se ven mejor. Muestra trabajos terminados, productos o momentos del evento. {PHOTO_TIP}</Tip>
        {withPhoto > 0 && withPhoto < 3 ? <Notice>Con 3 o más fotos la galería luce mucho mejor.</Notice> : null}
        <ListEditor
          idPrefix={`${block.id}-image`}
          noun="foto"
          items={block.images}
          max={MAX_GALLERY_IMAGES}
          disabled={disabled}
          addLabel="Agregar foto"
          createItem={() => galleryImageSchema.parse({})}
          onChange={(images) => set({ images })}
          summary={(image) => image.alt || image.caption}
          renderItem={(image, update) => (
            <>
              <ImagePicker label="Foto" value={image.url} onChange={(url, asset) => update({ url, ...(asset && !image.alt.trim() ? { alt: asset.alt } : {}) })} />
              <TextField label="Descripción de la foto" value={image.alt} onChange={(alt) => update({ alt })} max={160} disabled={disabled} placeholder="Ej.: Baño con tinas de cerámica" warning={image.url && !image.alt.trim() ? 'Falta la descripción de la foto.' : null} />
              <TextField label="Texto bajo la foto (opcional)" value={image.caption} onChange={(caption) => update({ caption })} max={120} disabled={disabled} placeholder="Ej.: Providencia, 2025" />
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Servicios, llamado a la acción, preguntas, testimonios
// ---------------------------------------------------------------------------

function FeaturesFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'features'>>) {
  const set = (patch: Partial<BlockOf<'features'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Nuestros servicios" hint="También aparece en el menú del sitio." />
      <TextField label="Introducción (opcional)" value={block.intro} onChange={(intro) => set({ intro })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Todo lo que necesitas para tu hogar, en un solo lugar." />
      <ChoiceGroup
        label="Cómo se ven"
        value={block.variant}
        onChange={(variant) => set({ variant })}
        disabled={disabled}
        options={[
          { value: 'cards', label: 'Tarjetas', description: 'Cada una en su cajita, con foto o ícono.', preview: <VariantSketch id="features:cards" /> },
          { value: 'icons', label: 'Íconos', description: 'Ícono grande y texto, sin caja.', preview: <VariantSketch id="features:icons" /> },
          { value: 'list', label: 'Lista', description: 'Una debajo de otra; ideal para textos largos.', preview: <VariantSketch id="features:list" /> },
        ]}
      />
      {block.variant !== 'list' ? <ChoiceGroup label="Tarjetas por fila" value={block.columns} onChange={(columns) => set({ columns })} disabled={disabled} options={COLUMN_OPTIONS} hint="Tres a seis tarjetas en total es lo ideal." /> : null}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Tarjetas ({block.items.length}/{MAX_LIST_ITEMS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="tarjeta"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar tarjeta"
          createItem={() => featureItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => item.title}
          renderItem={(item, update) => (
            <>
              <TextField label="Título" value={item.title} onChange={(title) => update({ title })} max={80} disabled={disabled} placeholder="Ej.: Instalación en 48 horas" hint="Responde “¿qué gano yo?”." />
              <TextField label="Descripción" value={item.text} onChange={(text) => update({ text })} max={400} disabled={disabled} multiline rows={3} placeholder="Ej.: Coordinamos la visita y dejamos todo funcionando en dos días." />
              <IconPicker label="Ícono (opcional)" value={item.icon} onChange={(icon) => update({ icon })} disabled={disabled} />
              <ImagePicker label="Imagen (opcional)" value={item.imageUrl} onChange={(imageUrl) => update({ imageUrl })} hint={PHOTO_TIP} />
              <Optional title="Que la tarjeta lleve a otra parte (opcional)" filled={Boolean(item.href.trim())}>
                <LinkField label="Al tocar la tarjeta lleva a…" value={item.href} onChange={(href) => update({ href })} document={document} pageId={pageId} disabled={disabled} />
              </Optional>
            </>
          )}
        />
      </div>
    </div>
  );
}

function CtaFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'cta'>>) {
  const set = (patch: Partial<BlockOf<'cta'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <ChoiceGroup
        label="Diseño"
        value={block.variant}
        onChange={(variant) => set({ variant })}
        disabled={disabled}
        columns={2}
        options={[
          { value: 'card', label: 'Tarjeta', description: 'Una caja destacada dentro de la página.', preview: <VariantSketch id="cta:card" /> },
          { value: 'band', label: 'Franja', description: 'Una banda de borde a borde.', preview: <VariantSketch id="cta:band" /> },
        ]}
      />
      <TextField label="Mensaje principal" value={block.title} onChange={(title) => set({ title })} max={120} disabled={disabled} placeholder="Ej.: ¿Listo para renovar tu cocina?" />
      <TextField label="Texto de apoyo (opcional)" value={block.text} onChange={(text) => set({ text })} max={300} disabled={disabled} multiline rows={2} placeholder="Ej.: Cuéntanos tu proyecto y te respondemos en el día." />
      <ButtonFields legend="Botón principal" label={block.buttonLabel} href={block.buttonHref} onLabel={(buttonLabel) => set({ buttonLabel })} onHref={(buttonHref) => set({ buttonHref })} document={document} pageId={pageId} disabled={disabled} labelPlaceholder="Ej.: Escribir por WhatsApp" />
      <Optional title="Segundo botón (opcional)" filled={Boolean(block.secondaryLabel.trim() || block.secondaryHref.trim())}>
        <ButtonFields legend="Segundo botón" label={block.secondaryLabel} href={block.secondaryHref} onLabel={(secondaryLabel) => set({ secondaryLabel })} onHref={(secondaryHref) => set({ secondaryHref })} document={document} pageId={pageId} disabled={disabled} labelPlaceholder="Ej.: Ver precios" />
      </Optional>
    </div>
  );
}

function FaqFields({ block, disabled, onChange, document, pageId }: FieldsProps<BlockOf<'faq'>>) {
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} placeholder="Ej.: Preguntas frecuentes" hint="También aparece en el menú del sitio." />
      <Tip>Anota lo que más te preguntan por WhatsApp: precios, plazos, formas de pago, cobertura. Cada respuesta en pocas líneas.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Preguntas ({block.items.length}/{MAX_LIST_ITEMS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="pregunta"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar pregunta"
          createItem={() => faqItemSchema.parse({})}
          onChange={(items) => onChange({ ...block, items })}
          summary={(item) => item.question}
          renderItem={(item, update) => (
            <>
              <TextField label="Pregunta" value={item.question} onChange={(question) => update({ question })} max={200} disabled={disabled} placeholder="Ej.: ¿Hacen despacho a regiones?" />
              <RichTextField label="Respuesta" value={item.answer} onChange={(answer) => update({ answer })} max={1000} rows={4} disabled={disabled} document={document} pageId={pageId} placeholder="Ej.: Sí, despachamos a todo Chile por Starken. El plazo es de 2 a 5 días hábiles." />
            </>
          )}
        />
      </div>
    </div>
  );
}

function TestimonialsFields({ block, disabled, onChange }: FieldsProps<BlockOf<'testimonials'>>) {
  const set = (patch: Partial<BlockOf<'testimonials'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Lo que dicen nuestros clientes" hint="También aparece en el menú del sitio." />
      <ChoiceGroup
        label="Cómo se ven"
        value={block.variant}
        onChange={(variant) => set({ variant })}
        disabled={disabled}
        columns={2}
        options={[
          { value: 'cards', label: 'Tarjetas', description: 'Varias opiniones lado a lado.', preview: <VariantSketch id="testimonials:cards" /> },
          { value: 'quotes', label: 'Citas', description: 'Una opinión grande a la vez.', preview: <VariantSketch id="testimonials:quotes" /> },
        ]}
      />
      <Tip>Con nombre y, si puedes, cargo o empresa. Pide autorización antes de publicar la opinión de alguien.</Tip>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Testimonios ({block.items.length}/{MAX_LIST_ITEMS})
        </p>
        <ListEditor
          idPrefix={`${block.id}-item`}
          noun="testimonio"
          items={block.items}
          max={MAX_LIST_ITEMS}
          disabled={disabled}
          addLabel="Agregar testimonio"
          createItem={() => testimonialItemSchema.parse({})}
          onChange={(items) => set({ items })}
          summary={(item) => item.author || item.quote}
          renderItem={(item, update) => (
            <>
              <TextField label="Lo que dijo" value={item.quote} onChange={(quote) => update({ quote })} max={500} disabled={disabled} multiline rows={3} placeholder="Ej.: Quedamos felices con el resultado, cumplieron los plazos y el precio acordado." />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nombre" value={item.author} onChange={(author) => update({ author })} max={80} disabled={disabled} placeholder="Ej.: María González" />
                <TextField label="Cargo o empresa (opcional)" value={item.role} onChange={(role) => update({ role })} max={80} disabled={disabled} placeholder="Ej.: Gerenta, Panadería Sol" />
              </div>
              <StarRating value={item.rating} onChange={(rating) => update({ rating })} disabled={disabled} label={`Estrellas de ${item.author.trim() || 'este testimonio'}`} />
              <ImagePicker label="Foto de la persona (opcional)" value={item.photoUrl} onChange={(photoUrl) => update({ photoUrl })} hint="Pídele permiso; sin foto se muestra solo el nombre." />
            </>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contacto y separador
// ---------------------------------------------------------------------------

function ContactFields({ block, disabled, onChange }: FieldsProps<BlockOf<'contact'>>) {
  const set = (patch: Partial<BlockOf<'contact'>>) => onChange({ ...block, ...patch });
  const hasWay = Boolean(block.email.trim() || block.phone.trim() || block.whatsapp.trim() || block.showForm);
  return (
    <div className="space-y-4">
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => set({ heading })} max={120} disabled={disabled} placeholder="Ej.: Contacto" hint="Aparece en el menú del sitio y sirve para que los botones lleven hasta aquí." />
      <TextField label="Texto de apoyo (opcional)" value={block.text} onChange={(text) => set({ text })} max={400} disabled={disabled} multiline rows={2} placeholder="Ej.: Escríbenos y te respondemos en menos de 24 horas." />
      {!hasWay ? <Notice>Pon al menos una forma de contacto (correo, teléfono, WhatsApp o el formulario): sin ella nadie puede escribirte.</Notice> : null}
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
        <TextField label="Dirección (opcional)" value={block.address} onChange={(address) => set({ address })} max={200} disabled={disabled} placeholder="Ej.: Av. Providencia 1234, Providencia, Santiago" />
      </div>
      <TextField label="Horario de atención (opcional)" value={block.hours} onChange={(hours) => set({ hours })} max={300} disabled={disabled} multiline rows={3} placeholder={'Lunes a viernes: 9:00 a 18:00\nSábado: 10:00 a 14:00'} hint="Una línea por día o rango de días. Si cierras a la hora de almuerzo, dilo aquí." />
      <SwitchRow label="Mostrar mapa con la dirección" description={block.address.trim() ? 'Se muestra un mapa de Google con la dirección que escribiste.' : 'Escribe una dirección arriba para que el mapa funcione.'} checked={block.showMap} onChange={(showMap) => set({ showMap })} disabled={disabled} />
      {block.showMap && !block.address.trim() ? <Notice>Activaste el mapa, pero falta la dirección.</Notice> : null}
      <SwitchRow label="Mostrar formulario de mensajes" description="Lo que escriban las visitas llega a la pestaña Mensajes de este sitio y te avisamos en el panel." checked={block.showForm} onChange={(showForm) => set({ showForm })} disabled={disabled} />
    </div>
  );
}

function DividerFields({ block, disabled, onChange }: FieldsProps<BlockOf<'divider'>>) {
  const set = (patch: Partial<BlockOf<'divider'>>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <ChoiceGroup
        label="Tipo de separador"
        value={block.variant}
        onChange={(variant) => set({ variant })}
        disabled={disabled}
        options={[
          { value: 'line', label: 'Línea', description: 'Una raya fina.', preview: <VariantSketch id="divider:line" /> },
          { value: 'dots', label: 'Puntos', description: 'Tres puntos, más suave.', preview: <VariantSketch id="divider:dots" /> },
          { value: 'space', label: 'Espacio', description: 'Solo aire, sin dibujo.', preview: <VariantSketch id="divider:space" /> },
        ]}
      />
      <ChoiceGroup
        label="Tamaño"
        value={block.size}
        onChange={(size) => set({ size })}
        disabled={disabled}
        options={[
          { value: 'sm', label: 'Chico', preview: <VariantSketch id="divider-size:sm" /> },
          { value: 'md', label: 'Mediano', preview: <VariantSketch id="divider-size:md" /> },
          { value: 'lg', label: 'Grande', preview: <VariantSketch id="divider-size:lg" /> },
        ]}
      />
      <Tip>Úsalo con moderación: para separar dos secciones con el mismo fondo o para dar aire antes de un cierre.</Tip>
    </div>
  );
}
