'use client';

import { useId, useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BLOCK_CATEGORIES, BLOCK_INFO, BLOCK_TYPES, type BlockType } from '@/lib/web-sites/blocks';
import { cn } from '@/lib/utils';
import { BlockSketch } from './block-sketches';
import { BLOCK_ICONS } from './editor-shared';

/** Palabras con las que la gente busca cada sección aunque no sea su nombre ("carta" → Lista de precios). */
const ALIASES: Record<BlockType, string> = {
  hero: 'portada banner inicio principal encabezado presentacion',
  text: 'parrafo quienes somos historia nosotros sobre mi articulo',
  split: 'foto al costado imagen y texto presentar servicio',
  image: 'foto imagen grande fotografia',
  gallery: 'fotos portafolio trabajos galeria carrusel proyectos',
  features: 'servicios beneficios tarjetas ventajas que hacemos',
  stats: 'numeros cifras estadisticas experiencia logros',
  steps: 'proceso pasos como funciona etapas',
  pricing: 'planes suscripcion paquetes comparar precios',
  team: 'equipo personas nosotros fundadores profesionales',
  testimonials: 'opiniones resenas clientes comentarios estrellas',
  quote: 'cita frase lema destacada',
  logos: 'marcas clientes certificaciones sellos aliados',
  pricelist: 'carta menu tarifas precios valores lista servicios',
  catalog: 'productos tienda vitrina propiedades fichas whatsapp inventario',
  schedule: 'horario programa clases turnos agenda calendario itinerario',
  faq: 'dudas preguntas respuestas frecuentes',
  cta: 'boton llamado accion invitacion reservar cotizar',
  video: 'youtube vimeo pelicula reel',
  map: 'mapa direccion ubicacion google como llegar',
  countdown: 'cuenta regresiva fecha evento oferta lanzamiento',
  contact: 'formulario correo whatsapp telefono escribenos',
  divider: 'separador linea espacio puntos',
};

const SUGGESTION_WHY: Partial<Record<BlockType, string>> = {
  hero: 'Lo primero que se ve: debe decir qué ofreces.',
  stats: 'Un par de cifras reales dan confianza al tiro.',
  features: 'Cuenta en tarjetas qué ofreces.',
  split: 'Presenta un servicio o tu local con una foto.',
  testimonials: 'Lo que dicen tus clientes convence más que lo que dices tú.',
  faq: 'Responde las dudas antes de que te escriban.',
  cta: 'Invita a dar el siguiente paso.',
  contact: 'Sin una forma de escribirte, nadie te contrata.',
  gallery: 'Los trabajos hablan más que la descripción.',
  text: 'Cuenta quién eres y por qué confiar en ti.',
};

/** Orden en que conviene armar una página: portada → confianza → servicios → prueba social → preguntas → llamado → contacto. */
const SUGGESTION_ORDER: BlockType[] = ['hero', 'stats', 'features', 'split', 'text', 'gallery', 'testimonials', 'faq', 'cta', 'contact'];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export interface SuggestedSection {
  type: BlockType;
  why?: string;
}

/** Sugerencias: primero lo que le falta al tipo de sitio y luego lo siguiente del orden recomendado. */
export function buildSuggestions(missing: SuggestedSection[], present: Set<BlockType>, limit = 4): SuggestedSection[] {
  const byType = new Map<BlockType, SuggestedSection>();
  for (const entry of missing) byType.set(entry.type, entry);
  for (const type of SUGGESTION_ORDER) {
    if (!present.has(type) && !byType.has(type)) byType.set(type, { type, why: SUGGESTION_WHY[type] });
  }
  return [...byType.values()]
    .sort((a, b) => {
      const ia = SUGGESTION_ORDER.indexOf(a.type);
      const ib = SUGGESTION_ORDER.indexOf(b.type);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .slice(0, limit)
    .map((entry) => ({ ...entry, why: entry.why ?? SUGGESTION_WHY[entry.type] }));
}

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: BlockType) => void;
  /** Dónde se va a insertar, en palabras ("al final de «Inicio»"). */
  whereLabel: string;
  /** La página ya tiene portada: no se ofrece otra. */
  heroBlocked: boolean;
  suggestions: SuggestedSection[];
}

function SectionCard({ type, why, blockedText, onPick }: { type: BlockType; why?: string; blockedText?: string | null; onPick: (type: BlockType) => void }) {
  const info = BLOCK_INFO[type];
  const Icon = BLOCK_ICONS[info.icon];
  return (
    <li>
      <button
        type="button"
        disabled={Boolean(blockedText)}
        onClick={() => onPick(type)}
        className="flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-card p-2.5 text-left outline-none transition-colors hover:border-ring hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BlockSketch type={type} />
        <span className="flex items-start gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{info.label}</span>
            <span className="block text-xs text-muted-foreground">{blockedText ?? why ?? info.description}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** Diálogo “Agregar sección”: buscador, sugerencias y todas las secciones agrupadas con un dibujo de cada una. */
export function AddSectionDialog({ open, onOpenChange, onPick, whereLabel, heroBlocked, suggestions }: AddSectionDialogProps) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const needle = normalize(query.trim());

  const results = useMemo(() => {
    if (!needle) return null;
    const words = needle.split(/\s+/);
    return BLOCK_TYPES.filter((type) => {
      const info = BLOCK_INFO[type];
      const haystack = normalize(`${info.label} ${info.description} ${ALIASES[type]}`);
      return words.every((word) => haystack.includes(word));
    });
  }, [needle]);

  const blockedFor = (type: BlockType) => (type === 'hero' && heroBlocked ? 'Esta página ya tiene una portada; solo puede haber una.' : null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Agregar una sección</DialogTitle>
          <DialogDescription>
            Elige lo que quieres sumar; se agregará {whereLabel}. Después puedes moverla con las flechas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor={searchId}>Buscar una sección</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: carta, horario, opiniones, mapa…" className="pl-9" autoComplete="off" />
            </div>
          </div>

          {results ? (
            results.length === 0 ? (
              <p role="status" className="rounded-lg bg-muted px-3 py-8 text-center text-sm text-muted-foreground">
                No encontramos una sección con “{query.trim()}”. Prueba con otra palabra, como “fotos”, “precios” o “contacto”.
              </p>
            ) : (
              <>
                <p role="status" className="text-xs text-muted-foreground">
                  {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.map((type) => (
                    <SectionCard key={type} type={type} blockedText={blockedFor(type)} onPick={onPick} />
                  ))}
                </ul>
              </>
            )
          ) : (
            <>
              {suggestions.length > 0 ? (
                <section aria-labelledby={`${searchId}-suggested`} className="space-y-2 rounded-lg border border-ring/40 bg-accent/40 p-3">
                  <h3 id={`${searchId}-suggested`} className="flex items-center gap-1.5 text-sm font-semibold">
                    <Sparkles className="size-4 text-accent-foreground" aria-hidden="true" /> Te recomendamos
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {suggestions.map((entry) => (
                      <SectionCard key={entry.type} type={entry.type} why={entry.why} blockedText={blockedFor(entry.type)} onPick={onPick} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {BLOCK_CATEGORIES.map((category) => {
                const types = BLOCK_TYPES.filter((type) => BLOCK_INFO[type].category === category.id);
                if (types.length === 0) return null;
                return (
                  <section key={category.id} aria-labelledby={`${searchId}-${category.id}`} className="space-y-2">
                    <h3 id={`${searchId}-${category.id}`} className={cn('text-sm font-semibold')}>
                      {category.label}
                    </h3>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {types.map((type) => (
                        <SectionCard key={type} type={type} blockedText={blockedFor(type)} onPick={onPick} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
