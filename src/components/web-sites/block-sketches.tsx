import type { ReactNode } from 'react';
import { MapPin, Play, Quote } from 'lucide-react';
import type { BlockType } from '@/lib/web-sites/blocks';
import { cn } from '@/lib/utils';

/**
 * Dibujos esquemáticos (solo divs/spans con clases del panel, sin imágenes) que
 * muestran de un vistazo cómo se ve cada sección y cada variante. Sirven para
 * que quien no sabe qué es un "carrusel" o una "portada dividida" lo entienda
 * mirando. Son decorativos: van dentro de un contenedor con `aria-hidden` o
 * llevan el suyo, y el texto de la opción es lo que lee un lector de pantalla.
 *
 * Todo son `span` (no `div`) porque viven dentro de `label` y `button`, que
 * solo admiten contenido en línea.
 */

type Tone = 'soft' | 'mid' | 'strong' | 'light';
const TONES: Record<Tone, string> = {
  soft: 'bg-foreground/12',
  mid: 'bg-foreground/30',
  strong: 'bg-foreground/65',
  light: 'bg-background/80',
};

/** Línea de texto. */
function Ln({ w = 'w-full', tone = 'soft', className }: { w?: string; tone?: Tone; className?: string }) {
  return <span className={cn('block h-[3px] shrink-0 rounded-full', TONES[tone], w, className)} />;
}

/** Foto. */
function Pic({ className }: { className?: string }) {
  return <span className={cn('block rounded-[3px] bg-foreground/15', className)} />;
}

/** Botón. */
function Btn({ light, className }: { light?: boolean; className?: string }) {
  return <span className={cn('block h-1.5 w-7 shrink-0 rounded-full', light ? 'bg-background/90' : 'bg-accent-foreground/75', className)} />;
}

/** Círculo (ícono, avatar, punto). */
function Dot({ className }: { className?: string }) {
  return <span className={cn('block size-2.5 shrink-0 rounded-full bg-accent-foreground/35', className)} />;
}

function Col({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cn('flex min-w-0 flex-col', className)}>{children}</span>;
}

function Row({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cn('flex min-w-0', className)}>{children}</span>;
}

function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cn('flex min-w-0 flex-col rounded-[3px] border border-border bg-background p-1', className)}>{children}</span>;
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex h-14 w-full overflow-hidden rounded-md border border-border bg-card p-1.5', className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Un dibujo por tipo de sección
// ---------------------------------------------------------------------------

const BLOCK_SKETCHES: Record<BlockType, () => ReactNode> = {
  hero: () => (
    <Frame>
      <Col className="flex-1 items-center justify-center gap-1 rounded-[3px] bg-foreground/80">
        <Ln w="w-2/3" tone="light" />
        <Ln w="w-1/2" tone="light" className="opacity-60" />
        <Btn />
      </Col>
    </Frame>
  ),
  text: () => (
    <Frame>
      <Col className="flex-1 justify-center gap-1">
        <Ln w="w-1/3" tone="strong" />
        <Ln />
        <Ln />
        <Ln w="w-4/5" />
        <Ln w="w-2/3" />
      </Col>
    </Frame>
  ),
  split: () => (
    <Frame>
      <Row className="flex-1 gap-1.5">
        <Pic className="flex-1" />
        <Col className="flex-1 justify-center gap-1">
          <Ln w="w-3/4" tone="strong" />
          <Ln />
          <Ln w="w-4/5" />
          <Btn />
        </Col>
      </Row>
    </Frame>
  ),
  image: () => (
    <Frame>
      <Col className="flex-1 gap-1">
        <Pic className="w-full flex-1" />
        <Ln w="w-1/3" tone="mid" className="self-center" />
      </Col>
    </Frame>
  ),
  gallery: () => (
    <Frame>
      <span className="grid flex-1 grid-cols-3 grid-rows-2 gap-1">
        {Array.from({ length: 6 }, (_, index) => (
          <Pic key={index} />
        ))}
      </span>
    </Frame>
  ),
  features: () => (
    <Frame>
      <Row className="flex-1 gap-1">
        {[0, 1, 2].map((index) => (
          <Card key={index} className="flex-1 gap-0.5">
            <Dot />
            <Ln tone="mid" />
            <Ln w="w-2/3" />
          </Card>
        ))}
      </Row>
    </Frame>
  ),
  stats: () => (
    <Frame>
      <Row className="flex-1 items-center gap-2">
        {[0, 1, 2].map((index) => (
          <Col key={index} className="flex-1 items-center gap-1">
            <span className="block h-3 w-4/5 rounded-[2px] bg-foreground/60" />
            <Ln w="w-3/5" />
          </Col>
        ))}
      </Row>
    </Frame>
  ),
  steps: () => (
    <Frame>
      <Row className="flex-1 items-center gap-2">
        {[0, 1, 2].map((index) => (
          <Col key={index} className="flex-1 items-center gap-1">
            <span className="block size-3.5 rounded-full bg-foreground/60" />
            <Ln w="w-3/4" tone="mid" />
            <Ln w="w-1/2" />
          </Col>
        ))}
      </Row>
    </Frame>
  ),
  pricing: () => (
    <Frame>
      <Row className="flex-1 items-stretch gap-1">
        {[0, 1, 2].map((index) => (
          <Card key={index} className={cn('flex-1 items-center gap-1', index === 1 && 'border-ring bg-accent')}>
            <Ln w="w-1/2" tone="mid" />
            <span className="block h-2 w-3/5 rounded-[2px] bg-foreground/55" />
            <Ln w="w-3/4" />
            <Btn className="mt-auto" />
          </Card>
        ))}
      </Row>
    </Frame>
  ),
  team: () => (
    <Frame>
      <Row className="flex-1 items-center gap-2">
        {[0, 1, 2].map((index) => (
          <Col key={index} className="flex-1 items-center gap-1">
            <span className="block size-5 rounded-full bg-foreground/20" />
            <Ln w="w-3/4" tone="mid" />
            <Ln w="w-1/2" />
          </Col>
        ))}
      </Row>
    </Frame>
  ),
  testimonials: () => (
    <Frame>
      <Row className="flex-1 gap-1">
        {[0, 1].map((index) => (
          <Card key={index} className="flex-1 gap-1">
            <Row className="gap-0.5">
              {[0, 1, 2, 3, 4].map((star) => (
                <span key={star} className="block size-1.5 rounded-[1px] bg-accent-foreground/60" />
              ))}
            </Row>
            <Ln />
            <Ln w="w-4/5" />
            <Ln w="w-1/3" tone="mid" className="mt-auto" />
          </Card>
        ))}
      </Row>
    </Frame>
  ),
  quote: () => (
    <Frame>
      <Col className="flex-1 items-center justify-center gap-1">
        <Quote className="size-3.5 text-accent-foreground/60" />
        <Ln w="w-4/5" tone="strong" />
        <Ln w="w-3/5" tone="strong" />
        <Ln w="w-1/4" tone="mid" />
      </Col>
    </Frame>
  ),
  logos: () => (
    <Frame>
      <Row className="flex-1 items-center justify-around">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="block h-3 w-5 rounded-[2px] bg-foreground/22" />
        ))}
      </Row>
    </Frame>
  ),
  pricelist: () => (
    <Frame>
      <Col className="flex-1 justify-center gap-1.5">
        <Ln w="w-1/3" tone="strong" />
        {[0, 1, 2].map((index) => (
          <Row key={index} className="items-center gap-1">
            <Ln w="w-1/3" tone="mid" />
            <span className="block h-px flex-1 border-t border-dotted border-foreground/35" />
            <Ln w="w-4" tone="strong" />
          </Row>
        ))}
      </Col>
    </Frame>
  ),
  catalog: () => (
    <Frame>
      <Row className="flex-1 gap-1">
        {[0, 1, 2].map((index) => (
          <Card key={index} className="flex-1 gap-0.5">
            <Pic className="h-4 w-full" />
            <Ln w="w-3/4" tone="mid" />
            <Ln w="w-1/3" tone="strong" />
            <Btn className="w-full" />
          </Card>
        ))}
      </Row>
    </Frame>
  ),
  schedule: () => (
    <Frame>
      <Col className="flex-1 justify-center gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <Row key={index} className="items-center gap-1.5">
            <Ln w="w-1/6" tone="strong" />
            <Ln w="w-1/5" tone="mid" />
            <Ln w="flex-1" />
          </Row>
        ))}
      </Col>
    </Frame>
  ),
  faq: () => (
    <Frame>
      <Col className="flex-1 justify-center gap-1">
        {[0, 1, 2].map((index) => (
          <span key={index} className="flex items-center justify-between rounded-[3px] border border-border px-1 py-1">
            <Ln w="w-3/5" tone="mid" />
            <span className="block size-1.5 rotate-45 border-r border-b border-foreground/40" />
          </span>
        ))}
      </Col>
    </Frame>
  ),
  cta: () => (
    <Frame>
      <Col className="flex-1 items-center justify-center gap-1 rounded-[3px] bg-accent">
        <Ln w="w-1/2" tone="strong" />
        <Ln w="w-1/3" tone="mid" />
        <Btn />
      </Col>
    </Frame>
  ),
  video: () => (
    <Frame>
      <span className="grid flex-1 place-items-center rounded-[3px] bg-foreground/75">
        <Play className="size-4 fill-background/90 text-background/90" />
      </span>
    </Frame>
  ),
  map: () => (
    <Frame>
      <span className="relative grid flex-1 place-items-center overflow-hidden rounded-[3px] bg-muted">
        <span className="absolute inset-x-0 top-1/3 h-px bg-foreground/15" />
        <span className="absolute inset-x-0 top-2/3 h-px bg-foreground/15" />
        <span className="absolute inset-y-0 left-1/3 w-px bg-foreground/15" />
        <span className="absolute inset-y-0 left-2/3 w-px bg-foreground/15" />
        <MapPin className="relative size-4 text-accent-foreground" />
      </span>
    </Frame>
  ),
  countdown: () => (
    <Frame>
      <Row className="flex-1 items-center gap-1">
        {[0, 1, 2, 3].map((index) => (
          <Col key={index} className="flex-1 items-center gap-1">
            <span className="block h-5 w-full rounded-[3px] bg-foreground/70" />
            <Ln w="w-2/3" />
          </Col>
        ))}
      </Row>
    </Frame>
  ),
  contact: () => (
    <Frame>
      <Row className="flex-1 gap-2">
        <Col className="flex-1 justify-center gap-1">
          <Ln w="w-2/3" tone="strong" />
          <Ln />
          <Ln w="w-4/5" />
          <Ln w="w-3/5" />
        </Col>
        <Col className="flex-1 justify-center gap-1">
          <span className="block h-2 rounded-[2px] border border-border" />
          <span className="block h-2 rounded-[2px] border border-border" />
          <span className="block h-3 rounded-[2px] border border-border" />
          <Btn />
        </Col>
      </Row>
    </Frame>
  ),
  divider: () => (
    <Frame>
      <Col className="flex-1 justify-center gap-2">
        <Ln w="w-1/2" className="self-center opacity-60" />
        <span className="block h-px w-full bg-foreground/35" />
        <Ln w="w-1/2" className="self-center opacity-60" />
      </Col>
    </Frame>
  ),
};

/** Dibujo del tipo de sección. */
export function BlockSketch({ type }: { type: BlockType }) {
  return <>{BLOCK_SKETCHES[type]()}</>;
}

// ---------------------------------------------------------------------------
// Dibujos de variantes (para las tarjetas de elección de cada sección)
// ---------------------------------------------------------------------------

export type VariantSketchId =
  | 'hero:center'
  | 'hero:split'
  | 'hero:full'
  | 'hero:minimal'
  | 'features:cards'
  | 'features:icons'
  | 'features:list'
  | 'cols:2'
  | 'cols:3'
  | 'cols:4'
  | 'gallery:grid'
  | 'gallery:masonry'
  | 'gallery:carousel'
  | 'testimonials:cards'
  | 'testimonials:quotes'
  | 'cta:card'
  | 'cta:band'
  | 'image:normal'
  | 'image:wide'
  | 'image:full'
  | 'divider:line'
  | 'divider:dots'
  | 'divider:space'
  | 'divider-size:sm'
  | 'divider-size:md'
  | 'divider-size:lg'
  | 'map:sm'
  | 'map:md'
  | 'map:lg'
  | 'side:left'
  | 'side:right';

function Columns({ count }: { count: number }) {
  return (
    <Frame>
      <Row className="flex-1 gap-1">
        {Array.from({ length: count }, (_, index) => (
          <Card key={index} className="flex-1 gap-0.5">
            <Pic className="h-3 w-full" />
            <Ln tone="mid" />
          </Card>
        ))}
      </Row>
    </Frame>
  );
}

function SpacedLines({ gap }: { gap: string }) {
  return (
    <Frame>
      <Col className={cn('flex-1 items-center justify-center', gap)}>
        <Ln w="w-3/4" tone="mid" />
        <span className="block h-px w-full border-t border-dashed border-foreground/40" />
        <Ln w="w-3/4" tone="mid" />
      </Col>
    </Frame>
  );
}

function MapBox({ height }: { height: string }) {
  return (
    <Frame>
      <Col className="flex-1 justify-center">
        <span className={cn('grid w-full place-items-center rounded-[3px] bg-muted', height)}>
          <MapPin className="size-3 text-accent-foreground" />
        </span>
      </Col>
    </Frame>
  );
}

const VARIANT_SKETCHES: Record<VariantSketchId, () => ReactNode> = {
  'hero:center': () => (
    <Frame>
      <Col className="flex-1 gap-1">
        <Row className="justify-between px-0.5">
          <Ln w="w-1/5" tone="mid" />
          <Ln w="w-1/4" />
        </Row>
        <Col className="flex-1 items-center justify-center gap-1 rounded-[3px] bg-foreground/80">
          <Ln w="w-2/3" tone="light" />
          <Btn />
        </Col>
      </Col>
    </Frame>
  ),
  'hero:split': () => (
    <Frame>
      <Row className="flex-1 gap-1.5">
        <Col className="flex-1 justify-center gap-1">
          <Ln w="w-4/5" tone="strong" />
          <Ln w="w-full" />
          <Btn />
        </Col>
        <Pic className="flex-1" />
      </Row>
    </Frame>
  ),
  'hero:full': () => (
    <Frame className="p-0">
      <Col className="flex-1 items-center justify-center gap-1 bg-gradient-to-br from-foreground/90 to-foreground/55">
        <Ln w="w-1/2" tone="light" />
        <Ln w="w-1/3" tone="light" className="opacity-60" />
        <Btn />
      </Col>
    </Frame>
  ),
  'hero:minimal': () => (
    <Frame>
      <Col className="flex-1 justify-center gap-1">
        <Ln w="w-1/5" className="bg-accent-foreground/60" />
        <Ln w="w-4/5" tone="strong" className="h-[5px]" />
        <Ln w="w-3/5" tone="strong" className="h-[5px]" />
        <Ln w="w-2/3" />
        <Btn />
      </Col>
    </Frame>
  ),
  'features:cards': () => BLOCK_SKETCHES.features(),
  'features:icons': () => (
    <Frame>
      <Row className="flex-1 items-center gap-2">
        {[0, 1, 2].map((index) => (
          <Col key={index} className="flex-1 items-center gap-1">
            <Dot className="size-3.5" />
            <Ln w="w-3/4" tone="mid" />
            <Ln />
          </Col>
        ))}
      </Row>
    </Frame>
  ),
  'features:list': () => (
    <Frame>
      <Col className="flex-1 justify-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <Row key={index} className="items-center gap-1.5">
            <Dot />
            <Col className="flex-1 gap-0.5">
              <Ln w="w-1/2" tone="mid" />
              <Ln w="w-4/5" />
            </Col>
          </Row>
        ))}
      </Col>
    </Frame>
  ),
  'cols:2': () => <Columns count={2} />,
  'cols:3': () => <Columns count={3} />,
  'cols:4': () => <Columns count={4} />,
  'gallery:grid': () => BLOCK_SKETCHES.gallery(),
  'gallery:masonry': () => (
    <Frame>
      <Row className="flex-1 gap-1">
        <Col className="flex-1 gap-1">
          <Pic className="h-5" />
          <Pic className="flex-1" />
        </Col>
        <Col className="flex-1 gap-1">
          <Pic className="h-3" />
          <Pic className="flex-1" />
        </Col>
        <Col className="flex-1 gap-1">
          <Pic className="h-6" />
          <Pic className="flex-1" />
        </Col>
      </Row>
    </Frame>
  ),
  'gallery:carousel': () => (
    <Frame>
      <Col className="flex-1 gap-1">
        <Row className="flex-1 items-center gap-1">
          <span className="block size-2 shrink-0 rotate-45 border-b border-l border-foreground/40" />
          <Pic className="h-full flex-1" />
          <span className="block size-2 shrink-0 rotate-45 border-t border-r border-foreground/40" />
        </Row>
        <Row className="justify-center gap-1">
          <span className="block size-1 rounded-full bg-foreground/60" />
          <span className="block size-1 rounded-full bg-foreground/20" />
          <span className="block size-1 rounded-full bg-foreground/20" />
        </Row>
      </Col>
    </Frame>
  ),
  'testimonials:cards': () => BLOCK_SKETCHES.testimonials(),
  'testimonials:quotes': () => BLOCK_SKETCHES.quote(),
  'cta:card': () => (
    <Frame>
      <Col className="flex-1 items-center justify-center gap-1 rounded-md border border-border bg-accent">
        <Ln w="w-1/2" tone="strong" />
        <Ln w="w-1/3" tone="mid" />
        <Btn />
      </Col>
    </Frame>
  ),
  'cta:band': () => (
    <Frame className="p-0">
      <Row className="flex-1 items-center justify-between gap-2 bg-foreground/80 px-2">
        <Col className="w-1/2 gap-1">
          <Ln tone="light" />
          <Ln w="w-2/3" tone="light" className="opacity-60" />
        </Col>
        <Btn />
      </Row>
    </Frame>
  ),
  'image:normal': () => (
    <Frame>
      <Col className="flex-1 items-center justify-center">
        <Pic className="h-full w-1/2" />
      </Col>
    </Frame>
  ),
  'image:wide': () => (
    <Frame>
      <Col className="flex-1 items-center justify-center">
        <Pic className="h-full w-5/6" />
      </Col>
    </Frame>
  ),
  'image:full': () => (
    <Frame className="p-0">
      <Pic className="h-full w-full flex-1 rounded-none" />
    </Frame>
  ),
  'divider:line': () => (
    <Frame>
      <Col className="flex-1 justify-center">
        <span className="block h-px w-full bg-foreground/40" />
      </Col>
    </Frame>
  ),
  'divider:dots': () => (
    <Frame>
      <Row className="flex-1 items-center justify-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <span key={index} className="block size-1.5 rounded-full bg-foreground/45" />
        ))}
      </Row>
    </Frame>
  ),
  'divider:space': () => <SpacedLines gap="gap-2" />,
  'divider-size:sm': () => <SpacedLines gap="gap-0.5" />,
  'divider-size:md': () => <SpacedLines gap="gap-1.5" />,
  'divider-size:lg': () => <SpacedLines gap="gap-3" />,
  'map:sm': () => <MapBox height="h-4" />,
  'map:md': () => <MapBox height="h-7" />,
  'map:lg': () => <MapBox height="h-10" />,
  'side:left': () => (
    <Frame>
      <Row className="flex-1 gap-1.5">
        <Pic className="w-2/5" />
        <Col className="flex-1 justify-center gap-1">
          <Ln w="w-3/4" tone="strong" />
          <Ln />
          <Ln w="w-4/5" />
        </Col>
      </Row>
    </Frame>
  ),
  'side:right': () => (
    <Frame>
      <Row className="flex-1 gap-1.5">
        <Col className="flex-1 justify-center gap-1">
          <Ln w="w-3/4" tone="strong" />
          <Ln />
          <Ln w="w-4/5" />
        </Col>
        <Pic className="w-2/5" />
      </Row>
    </Frame>
  ),
};

/** Dibujo de una variante (portada centrada, galería en mosaico, franja…). */
export function VariantSketch({ id }: { id: VariantSketchId }) {
  return <>{VARIANT_SKETCHES[id]()}</>;
}
