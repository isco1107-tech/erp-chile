'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, EyeOff, FileText, House, PencilLine, Plus, Trash2, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { isValidPageSlug, PAGE_SLUG_MAX, pageSlugProblem } from '@/lib/web-sites/page-slugs';
import { duplicatePage, MAX_PAGES, movePage, pageHasContent, removePage, setHomePage, updatePage, type SiteDocument, type SitePage } from '@/lib/web-sites/site';
import { slugify } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { AddPageDialog } from './AddPageDialog';
import { SwitchRow, TextField } from './fields';
import { countLinksTo } from './pages-logic';

interface PagesPanelProps {
  doc: SiteDocument;
  /** Dirección pública sin `https://` (p. ej. `app.cl/web/mi-sitio`, o el dominio propio): las páginas cuelgan de ella. */
  addressBase: string;
  /** El sitio ya está publicado: cambiar una dirección rompe los enlaces que ya se compartieron. */
  published: boolean;
  siteName: string;
  currentPageId: string;
  onDocumentChange: (updater: (previous: SiteDocument) => SiteDocument) => void;
  /** Agregaste o duplicaste una página: que pase a ser la que se edita. */
  onSelectPage: (pageId: string) => void;
  /** Ir a editar el contenido de esta página (pestaña Contenido). */
  onEditPage: (pageId: string) => void;
  readOnly: boolean;
}

const TITLE_IDEAL = [10, 60] as const;
const DESCRIPTION_IDEAL = [50, 155] as const;

function clip(text: string, max: number): string {
  const value = text.trim().replace(/\s+/g, ' ');
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Escribe como la gente: mayúsculas, tildes y espacios se convierten solos en una dirección válida. */
function typedSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, PAGE_SLUG_MAX);
}

function suggestedSlug(title: string, taken: Set<string>): string {
  let base = slugify(title, PAGE_SLUG_MAX) || 'pagina';
  if (!isValidPageSlug(base)) base = `${base.slice(0, PAGE_SLUG_MAX - 7)}-pagina`;
  let candidate = base;
  for (let n = 2; taken.has(candidate) || !isValidPageSlug(candidate); n += 1) candidate = `${base.slice(0, PAGE_SLUG_MAX - 4)}-${n}`;
  return candidate;
}

/**
 * Campo que solo pasa al sitio lo que es válido: mientras lo escrito no sirve
 * (nombre vacío, dirección repetida) se queda en el campo con su aviso y el
 * sitio conserva el último valor bueno. Al salir del campo vuelve a ese valor.
 */
function useCommitDraft(value: string, validate: (draft: string) => string | null, commit: (draft: string) => void) {
  const [draft, setDraft] = useState(value);
  // Si el valor cambia desde afuera (deshacer, "usar el nombre"), el campo lo sigue.
  useEffect(() => setDraft(value), [value]);
  const error = draft === value ? null : validate(draft);
  return {
    draft,
    error,
    change(next: string) {
      setDraft(next);
      if (validate(next) === null && next !== value) commit(next);
    },
    reset() {
      setDraft(value);
    },
  };
}

function AddressField({ page, taken, addressBase, published, disabled, onCommit }: { page: SitePage; taken: Set<string>; addressBase: string; published: boolean; disabled: boolean; onCommit: (slug: string) => void }) {
  const id = useId();
  const field = useCommitDraft(
    page.slug,
    (draft) => {
      // Un guion al final es una dirección a medio escribir ("mi-" mientras llegas a "mi-empresa"): no se avisa ni se guarda todavía.
      if (draft.endsWith('-') && draft.length > 1) return null;
      const problem = pageSlugProblem(draft);
      if (problem) return problem;
      return taken.has(draft) ? 'Otra página ya usa esa dirección. Elige una distinta.' : null;
    },
    (draft) => {
      if (!draft.endsWith('-')) onCommit(draft);
    }
  );
  const suggestion = suggestedSlug(page.title, taken);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Dirección de la página</Label>
      <div className="flex items-stretch gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl border border-input bg-muted focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
          <span className="max-w-[55%] truncate pl-2.5 text-sm text-muted-foreground" title={`${addressBase}/`}>
            {addressBase}/
          </span>
          <Input
            id={id}
            value={field.draft}
            maxLength={PAGE_SLUG_MAX}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={field.error ? true : undefined}
            aria-describedby={`${id}-hint`}
            className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-0 shadow-none focus-visible:ring-0"
            onChange={(event) => field.change(typedSlug(event.target.value))}
            onBlur={() => field.reset()}
          />
        </div>
        {suggestion !== page.slug ? (
          <Button type="button" variant="outline" disabled={disabled} title="Crear la dirección a partir del nombre" onClick={() => onCommit(suggestion)}>
            <WandSparkles aria-hidden="true" /> <span className="max-sm:sr-only">Usar el nombre</span>
          </Button>
        ) : null}
      </div>
      <p id={`${id}-hint`} className={cn('text-xs', field.error ? 'font-medium text-danger' : 'text-muted-foreground')}>
        {field.error ?? (published ? 'Si cambias la dirección, los enlaces antiguos hacia esta página dejarán de funcionar. Usa solo letras, números y guiones.' : 'Usa solo letras, números y guiones. Se arma sola a partir del nombre.')}
      </p>
    </div>
  );
}

function GooglePreview({ page, siteName, addressBase }: { page: SitePage; siteName: string; addressBase: string }) {
  const path = page.slug ? `${addressBase}/${page.slug}` : addressBase;
  const shown = path.split('/').filter(Boolean).join(' › ');
  const title = page.seoTitle.trim() || `${page.title}${siteName && page.title !== siteName ? ` · ${siteName}` : ''}`;
  const description = page.seoDescription.trim();
  return (
    <figure className="space-y-0.5 rounded-lg border border-border bg-card p-3" aria-label="Así se verá esta página en Google">
      <figcaption className="mb-1.5 text-xs font-medium text-muted-foreground">Así se verá en Google (aproximado)</figcaption>
      <p className="truncate text-xs text-success">{shown}</p>
      <p className="truncate text-lg leading-snug text-info">{clip(title, 60)}</p>
      {description ? <p className="line-clamp-2 text-sm text-muted-foreground">{clip(description, 155)}</p> : <p className="text-sm text-muted-foreground italic">Escribe una descripción y aparecerá aquí, bajo el título.</p>}
    </figure>
  );
}

interface PageCardProps {
  page: SitePage;
  index: number;
  total: number;
  doc: SiteDocument;
  addressBase: string;
  published: boolean;
  siteName: string;
  expanded: boolean;
  readOnly: boolean;
  onToggle: (pageId: string) => void;
  onChange: (pageId: string, patch: Partial<Omit<SitePage, 'id'>>) => void;
  onMove: (pageId: string, dir: -1 | 1) => void;
  onSetHome: (page: SitePage) => void;
  onDuplicate: (page: SitePage) => void;
  onRemove: (page: SitePage) => void;
  onEdit: (pageId: string) => void;
}

function PageCard({ page, index, total, doc, addressBase, published, siteName, expanded, readOnly, onToggle, onChange, onMove, onSetHome, onDuplicate, onRemove, onEdit }: PageCardProps) {
  const bodyId = useId();
  const home = index === 0;
  const Icon = home ? House : page.hidden ? EyeOff : FileText;
  const taken = new Set(doc.pages.filter((other) => other.id !== page.id && other.slug).map((other) => other.slug));
  const name = useCommitDraft(
    page.title,
    (draft) => (draft.trim() ? null : 'Ponle un nombre a la página.'),
    (draft) => onChange(page.id, { title: draft })
  );
  const empty = !pageHasContent(page);

  return (
    <li id={`page-card-${page.id}`} className="rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => onToggle(page.id)}
          className="flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', home ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')} aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{page.title}</span>
              {home ? <StatusBadge tone="accent">Página de inicio</StatusBadge> : null}
              {page.hidden ? <StatusBadge tone="neutral">Oculta</StatusBadge> : !page.showInMenu ? <StatusBadge tone="neutral">Fuera del menú</StatusBadge> : null}
              {empty ? <StatusBadge tone="warning">Sin contenido</StatusBadge> : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {home ? 'Se abre al entrar al sitio' : `/${page.slug}`} · {page.blocks.length} {page.blocks.length === 1 ? 'sección' : 'secciones'}
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1">
          {!home ? (
            <>
              <Button id={`page-${page.id}-up`} type="button" variant="ghost" size="icon-sm" disabled={readOnly || index <= 1} aria-label={`Subir «${page.title}»`} onClick={() => onMove(page.id, -1)}>
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button id={`page-${page.id}-down`} type="button" variant="ghost" size="icon-sm" disabled={readOnly || index >= total - 1} aria-label={`Bajar «${page.title}»`} onClick={() => onMove(page.id, 1)}>
                <ArrowDown aria-hidden="true" />
              </Button>
            </>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(page.id)}>
            <PencilLine aria-hidden="true" /> Editar contenido
          </Button>
        </div>
      </div>

      {expanded ? (
        <div id={bodyId} className="space-y-4 border-t border-border p-4">
          <TextField label="Nombre de la página" value={name.draft} max={60} disabled={readOnly} error={name.error} placeholder="Ej.: Servicios" onChange={name.change} onBlur={name.reset} hint="Es lo que se ve en la pestaña del navegador y, por omisión, en el menú." />

          {home ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              La página de inicio se abre en <span className="font-medium text-foreground">{addressBase}</span> y siempre está publicada.
            </p>
          ) : (
            <AddressField page={page} taken={taken} addressBase={addressBase} published={published} disabled={readOnly} onCommit={(slug) => onChange(page.id, { slug })} />
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">En el menú</h3>
            <SwitchRow
              label="Mostrar en el menú"
              description={doc.header.menuMode === 'custom' ? 'Tu menú es personalizado: esto solo cuenta si lo vuelves automático o lo rehaces desde tus páginas (en «Encabezado y pie»).' : 'La gente llega a esta página desde el menú de arriba.'}
              checked={page.showInMenu}
              disabled={readOnly || page.hidden}
              onChange={(checked) => onChange(page.id, { showInMenu: checked })}
            />
            <TextField label="Texto en el menú (opcional)" value={page.menuLabel} max={40} disabled={readOnly || !page.showInMenu || page.hidden} placeholder={page.title} onChange={(value) => onChange(page.id, { menuLabel: value })} hint="Úsalo si en el menú quieres algo más corto, por ejemplo «Precios» en vez de «Planes y precios»." />
            {!home ? (
              <SwitchRow
                label="Ocultar página"
                description="No se publica ni aparece en el menú, pero la conservas aquí para seguir trabajando en ella. Es útil para preparar algo antes de mostrarlo."
                checked={page.hidden}
                disabled={readOnly}
                onChange={(checked) => onChange(page.id, { hidden: checked })}
              />
            ) : null}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Cómo aparece en Google</h3>
              <p className="text-xs text-muted-foreground">Opcional. Si lo dejas vacío, armamos el título con el nombre de la página.</p>
            </div>
            <TextField
              label="Título para Google"
              value={page.seoTitle}
              max={70}
              ideal={TITLE_IDEAL}
              disabled={readOnly}
              placeholder="Ej.: Remodelaciones y gasfitería en Temuco"
              warning={page.seoTitle.trim().length > TITLE_IDEAL[1] ? 'Es largo: Google lo va a cortar. Lo ideal son 60 caracteres o menos.' : null}
              onChange={(value) => onChange(page.id, { seoTitle: value })}
            />
            <TextField
              label="Descripción para Google"
              value={page.seoDescription}
              max={200}
              ideal={DESCRIPTION_IDEAL}
              multiline
              rows={2}
              disabled={readOnly}
              placeholder="Cuenta en una o dos frases qué encontrará quien entre a esta página."
              warning={page.seoDescription.trim().length > DESCRIPTION_IDEAL[1] ? 'Es larga: Google la va a cortar. Lo ideal son 155 caracteres o menos.' : null}
              onChange={(value) => onChange(page.id, { seoDescription: value })}
            />
            <GooglePreview page={page} siteName={siteName} addressBase={addressBase} />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {!home ? (
              <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => onSetHome(page)}>
                <House aria-hidden="true" /> Convertir en página de inicio
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={readOnly || total >= MAX_PAGES} title={total >= MAX_PAGES ? `Un sitio puede tener hasta ${MAX_PAGES} páginas` : undefined} onClick={() => onDuplicate(page)}>
              <Copy aria-hidden="true" /> Duplicar
            </Button>
            {!home ? (
              <Button type="button" variant="destructive" size="sm" disabled={readOnly} onClick={() => onRemove(page)}>
                <Trash2 aria-hidden="true" /> Eliminar página
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Pestaña "Páginas": ordenar, nombrar, ocultar y preparar para Google cada página del sitio. */
export function PagesPanel({ doc, addressBase, published, siteName, currentPageId, onDocumentChange, onSelectPage, onEditPage, readOnly }: PagesPanelProps) {
  const confirm = useConfirm();
  const [expandedId, setExpandedId] = useState<string | null>(currentPageId);
  const [addOpen, setAddOpen] = useState(false);
  const atMax = doc.pages.length >= MAX_PAGES;

  const toggle = (pageId: string) => setExpandedId((current) => (current === pageId ? null : pageId));
  const change = (pageId: string, patch: Partial<Omit<SitePage, 'id'>>) => onDocumentChange((previous) => updatePage(previous, pageId, patch));

  function move(pageId: string, dir: -1 | 1) {
    onDocumentChange((previous) => movePage(previous, pageId, dir));
    // Al reubicarse, el navegador suelta el foco: se devuelve al botón que se acaba de usar.
    window.requestAnimationFrame(() => {
      const first = window.document.getElementById(`page-${pageId}-${dir < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null;
      const second = window.document.getElementById(`page-${pageId}-${dir < 0 ? 'down' : 'up'}`) as HTMLButtonElement | null;
      (first && !first.disabled ? first : second)?.focus();
    });
  }

  async function makeHome(page: SitePage) {
    const ok = await confirm({
      title: `¿Convertir «${page.title}» en la página de inicio?`,
      description: `Será la primera página que vea quien entre a tu sitio. La página de inicio actual pasará a ser una página más, con su propia dirección. Los enlaces que ya compartiste hacia «${page.title}» dejarán de funcionar.`,
      confirmLabel: 'Convertir en inicio',
      destructive: false,
    });
    if (!ok) return;
    onDocumentChange((previous) => setHomePage(previous, page.id));
    setExpandedId(page.id);
    toast.success(`«${page.title}» ahora es tu página de inicio`);
  }

  function duplicate(page: SitePage) {
    if (atMax) {
      toast.error(`Un sitio puede tener hasta ${MAX_PAGES} páginas. Elimina alguna para poder duplicar.`);
      return;
    }
    const out: { page: SitePage | null } = { page: null };
    onDocumentChange((previous) => {
      const copy = duplicatePage(previous, page.id);
      if (!copy) return previous;
      out.page = copy.page;
      return copy.doc;
    });
    const copy = out.page;
    if (!copy) return;
    setExpandedId(copy.id);
    onSelectPage(copy.id);
    toast.success(`Se creó «${copy.title}»`, { description: 'Es una copia con las mismas secciones. Cámbiale el nombre y los textos.' });
  }

  async function remove(page: SitePage) {
    const links = countLinksTo(doc, page.id);
    const notes: string[] = [];
    if (links.cleaned > 0) notes.push(`Se quitarán ${links.cleaned === 1 ? 'el enlace' : `los ${links.cleaned} enlaces`} del menú y del pie que llevaban a ella.`);
    if (links.manual > 0) notes.push(`${links.manual === 1 ? 'Un botón' : `${links.manual} botones`} de tus secciones ${links.manual === 1 ? 'llevaba' : 'llevaban'} a esta página: quedarán sin destino y tendrás que elegir otro (la pestaña «Qué le falta» te lo recuerda).`);
    const ok = await confirm({
      title: `¿Eliminar la página «${page.title}»?`,
      description: `Se pierde todo su contenido (${page.blocks.length} ${page.blocks.length === 1 ? 'sección' : 'secciones'}). ${notes.join(' ')} Si solo quieres que no se vea por ahora, usa «Ocultar página». También puedes deshacer con Ctrl+Z.`.replace(/\s+/g, ' ').trim(),
      confirmLabel: 'Eliminar página',
    });
    if (!ok) return;
    onDocumentChange((previous) => removePage(previous, page.id));
    toast.success(`Se eliminó «${page.title}»`);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold">
            Páginas de tu sitio{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({doc.pages.length} de {MAX_PAGES})
            </span>
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">Cada página tiene su propia dirección y aparece en el menú de arriba. Toca una para cambiar su nombre, su dirección o cómo se ve en Google.</p>
        </div>
        <Button type="button" disabled={readOnly || atMax} title={atMax ? `Un sitio puede tener hasta ${MAX_PAGES} páginas` : undefined} onClick={() => setAddOpen(true)}>
          <Plus aria-hidden="true" /> Agregar página
        </Button>
      </div>

      {atMax ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Llegaste al máximo de {MAX_PAGES} páginas. Elimina alguna que no uses para poder agregar otra.</p> : null}

      {doc.pages.length === 1 ? (
        <div className="rounded-lg border border-dashed border-border bg-card">
          <EmptyState title="Tu sitio tiene una sola página" description="Puedes sumar «Nosotros», «Servicios», «Precios» o «Contacto». Cada una nace con textos de ejemplo que dicen qué escribir." actionLabel={readOnly ? undefined : 'Agregar página'} onAction={() => setAddOpen(true)} className="py-8" />
        </div>
      ) : null}

      <ol className="space-y-3">
        {doc.pages.map((page, index) => (
          <PageCard
            key={page.id}
            page={page}
            index={index}
            total={doc.pages.length}
            doc={doc}
            addressBase={addressBase}
            published={published}
            siteName={siteName}
            expanded={expandedId === page.id}
            readOnly={readOnly}
            onToggle={toggle}
            onChange={change}
            onMove={move}
            onSetHome={(target) => void makeHome(target)}
            onDuplicate={duplicate}
            onRemove={(target) => void remove(target)}
            onEdit={onEditPage}
          />
        ))}
      </ol>

      <AddPageDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        document={doc}
        onDocumentChange={onDocumentChange}
        onAdded={(pageId) => {
          setExpandedId(pageId);
          onEditPage(pageId);
        }}
      />
    </div>
  );
}
