'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  FileDown,
  Lightbulb,
  ListTree,
  MessageCircleQuestion,
  MousePointerClick,
  Printer,
  Search,
  Users,
  UserRound,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { MANUAL_CHAPTERS, type ManualChapter, type ManualSection } from '@/modules/manual/types';
import { searchManual } from '@/modules/manual/search';
import { openAssistant } from '@/components/shared/assistant-events';
import { getModuleKeyForPath } from '@/components/tutorial/tutorial-routes';
import { TUTORIAL_URL_HASH } from '@/components/tutorial/ModuleTutorial';

export type ManualClientSection = ManualSection & { screenshotUrl: string | null };

interface ManualClientProps {
  sections: ManualClientSection[];
  scope: 'role' | 'company';
  companyName: string;
  userName: string;
  roleLabel: string;
}

function chaptersOf(sections: readonly ManualClientSection[]): { chapter: ManualChapter; sections: ManualClientSection[] }[] {
  return MANUAL_CHAPTERS.map((chapter) => ({ chapter, sections: sections.filter((section) => section.chapter === chapter) })).filter(
    (group) => group.sections.length > 0
  );
}

/** Una ruta navegable (sin parámetros dinámicos) que no es el inicio: sirve para "Ir a la pantalla". */
function isNavigableRoute(route: string): boolean {
  return route !== '/dashboard' && !route.includes('[');
}

/**
 * Manual de usuario interactivo. Muestra solo lo que llega filtrado del
 * servidor (módulos contratados; en "Mi rol", además, solo lo que la persona
 * puede hacer). En pantalla: índice por capítulos, búsqueda sin tildes,
 * capturas y accesos a la pantalla, al tutorial guiado y al asistente. Al
 * imprimir: versión expandida completa. Para llevárselo: descarga en Word
 * (`/api/manual/docx`) con el mismo contenido y las capturas.
 */
export default function ManualClient({ sections, scope, companyName, userName, roleLabel }: ManualClientProps) {
  const [query, setQuery] = useState('');
  const [indexOpen, setIndexOpen] = useState(false);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const filtered = useMemo(() => (query.trim() ? searchManual(sections, query) : sections), [sections, query]) as ManualClientSection[];
  const chapters = useMemo(() => chaptersOf(filtered), [filtered]);
  const allChapters = useMemo(() => chaptersOf(sections), [sections]);
  const topicCount = useMemo(() => sections.reduce((sum, section) => sum + section.topics.length, 0), [sections]);
  const searching = query.trim().length > 0;

  // Enlaces profundos desde el asistente o el tutorial: /dashboard/manual#seccion
  // (o #seccion--tema) abre el tema y lo lleva a la vista.
  useEffect(() => {
    function openFromHash() {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      setOpenTopic(hash.includes('--') ? hash : null);
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const docxHref = `/api/manual/docx?alcance=${scope === 'company' ? 'empresa' : 'rol'}`;
  const generatedLabel = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Ayuda"
          title="Manual de Usuario"
          description={`Hecho a la medida de ${companyName}: solo los módulos que tu empresa tiene contratados, con los pasos exactos de cada pantalla.`}
          actions={
            <>
              <a href={docxHref} className={buttonVariants({ variant: 'default' })} download>
                <FileDown aria-hidden="true" /> Descargar Word
              </a>
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer aria-hidden="true" /> Imprimir / PDF
              </Button>
            </>
          }
        />
      </div>

      {/* Alcance + búsqueda */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card print:hidden md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1">
          <div role="tablist" aria-label="Alcance del manual" className="inline-flex rounded-lg bg-muted p-1">
            <Link
              role="tab"
              aria-selected={scope === 'role'}
              href="/dashboard/manual"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                scope === 'role' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserRound className="size-4" aria-hidden="true" /> Mi rol
            </Link>
            <Link
              role="tab"
              aria-selected={scope === 'company'}
              href="/dashboard/manual?alcance=empresa"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                scope === 'company' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="size-4" aria-hidden="true" /> Toda la empresa
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {scope === 'role'
              ? `Lo que tú (${roleLabel}) puedes hacer: ${sections.length} secciones, ${topicCount} temas.`
              : `Todos los módulos contratados, para capacitar al equipo: ${sections.length} secciones, ${topicCount} temas.`}
          </p>
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Busca lo que necesitas: “anular boleta”, “sueldos”…"
            aria-label="Buscar en el manual"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Empieza aquí */}
      {!searching && (
        <div className="grid gap-3 print:hidden sm:grid-cols-3">
          <StartCard
            icon={<BookOpen className="size-5" aria-hidden="true" />}
            title="¿Primera vez?"
            text="Lee Primeros pasos: en diez minutos sabrás moverte por cualquier pantalla."
            href="#primeros-pasos"
            cta="Empezar"
          />
          <StartCard
            icon={<MousePointerClick className="size-5" aria-hidden="true" />}
            title="Aprende haciendo"
            text="Cada sección tiene un tutorial guiado que te muestra los botones en la pantalla real."
            href="#primeros-pasos--ayuda-tres-niveles"
            cta="Cómo funciona"
          />
          <button
            type="button"
            onClick={() => openAssistant('¿Por dónde empiezo a usar el sistema?')}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-card transition-shadow hover:shadow-hover"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <MessageCircleQuestion className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-foreground">¿Apurado? Pregúntale al asistente</span>
            <span className="text-sm text-muted-foreground">Te responde con tus palabras y te lleva a la pantalla correcta.</span>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
              Abrir asistente <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] print:block">
        {/* Índice */}
        <nav aria-label="Índice del manual" className="print:hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium lg:hidden"
            aria-expanded={indexOpen}
            onClick={() => setIndexOpen((value) => !value)}
          >
            <span className="flex items-center gap-2">
              <ListTree className="size-4" aria-hidden="true" /> Índice
            </span>
            <ChevronDown className={cn('size-4 transition-transform', indexOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          <div className={cn('mt-2 space-y-4 lg:mt-0 lg:block', indexOpen ? 'block' : 'hidden')}>
            {chapters.map((group) => (
              <div key={group.chapter} className="min-w-0">
                <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.chapter}</p>
                <ul className="space-y-0.5">
                  {group.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        onClick={() => setIndexOpen(false)}
                        className="block truncate rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted"
                        title={section.title}
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Contenido */}
        <div className="min-w-0 space-y-8 print:hidden">
          {chapters.length === 0 && (
            <EmptyState
              title="Sin resultados"
              description="Prueba con otra palabra, o pregúntale directamente al asistente."
              action={
                <Button type="button" variant="outline" onClick={() => openAssistant(query)}>
                  <MessageCircleQuestion aria-hidden="true" /> Preguntar al asistente
                </Button>
              }
            />
          )}
          {chapters.map((group) => (
            <section key={group.chapter} aria-labelledby={`cap-${group.chapter}`} className="space-y-4">
              <h2 id={`cap-${group.chapter}`} className="border-b border-border pb-2 text-lg font-semibold text-foreground">
                {group.chapter}
              </h2>
              {group.sections.map((section) => (
                <SectionCard key={section.id} section={section} searching={searching} openTopic={openTopic} />
              ))}
            </section>
          ))}
        </div>
      </div>

      {/* Versión de impresión: todo expandido, con capturas. */}
      <div className="hidden print:block">
        <h1 className="text-3xl font-bold">Manual de Usuario</h1>
        <p className="text-lg">{companyName}</p>
        <p className="mb-6 text-sm text-muted-foreground">
          {scope === 'company' ? 'Manual completo de la empresa' : `Manual de ${userName} (${roleLabel})`} · Generado el {generatedLabel}
        </p>
        {allChapters.map((group) => (
          <div key={group.chapter} className="mb-8">
            <h2 className="mb-3 border-b border-border pb-1 text-xl font-semibold" style={{ breakAfter: 'avoid' }}>
              {group.chapter}
            </h2>
            {group.sections.map((section) => (
              <div key={section.id} className="mb-6">
                <h3 className="text-lg font-semibold" style={{ breakAfter: 'avoid' }}>
                  {section.title}
                </h3>
                <p className="mb-2 text-sm italic">{section.summary}</p>
                {section.screenshotUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={section.screenshotUrl}
                    alt={`Captura de pantalla: ${section.title}`}
                    className="mb-2 w-full rounded border border-border"
                    style={{ breakInside: 'avoid' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                {section.topics.map((topic) => (
                  <div key={topic.id} className="mb-3" style={{ breakInside: 'avoid' }}>
                    <h4 className="mb-1 text-sm font-semibold">{topic.title}</h4>
                    <ol className="list-decimal space-y-1 pl-5 text-sm">
                      {topic.steps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                    {topic.tip && <p className="mt-1 border-l-2 border-primary pl-2 text-sm">Importante: {topic.tip}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StartCard({ icon, title, text, href, cta }: { icon: React.ReactNode; title: string; text: string; href: string; cta: string }) {
  return (
    <a href={href} className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-hover">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-sm text-muted-foreground">{text}</span>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
        {cta} <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    </a>
  );
}

function SectionCard({ section, searching, openTopic }: { section: ManualClientSection; searching: boolean; openTopic: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const navigable = isNavigableRoute(section.route);
  const hasTutorial = navigable && getModuleKeyForPath(section.route) !== null;

  return (
    <article id={section.id} className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
          <p className="text-sm text-muted-foreground">{section.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {navigable && (
            <Link href={section.route} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Ir a la pantalla <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {hasTutorial && (
            <Link href={`${section.route}${TUTORIAL_URL_HASH}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <MousePointerClick aria-hidden="true" /> Ver tutorial guiado
            </Link>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => openAssistant(`¿Cómo uso ${section.title}? Dame los pasos principales.`)}>
            <MessageCircleQuestion aria-hidden="true" /> Preguntar al asistente
          </Button>
        </div>
      </div>

      {section.screenshotUrl && !imageFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={section.screenshotUrl}
          alt={`Captura de pantalla: ${section.title}`}
          className="w-full border-y border-border bg-muted object-cover object-top"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}

      <div className="divide-y divide-border">
        {section.topics.map((topic) => {
          const anchor = `${section.id}--${topic.id}`;
          return (
            <details key={topic.id} id={anchor} className="group scroll-mt-24 px-4 py-3 sm:px-5" open={searching || openTopic === anchor}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                <span className="min-w-0">{topic.title}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground marker:font-semibold marker:text-foreground">
                {topic.steps.map((step, index) => (
                  <li key={index} className="pl-1">
                    {step}
                  </li>
                ))}
              </ol>
              {topic.tip && (
                <p className="mt-3 flex gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                  <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{topic.tip}</span>
                </p>
              )}
              {topic.route && topic.route !== section.route && isNavigableRoute(topic.route) && (
                <Link href={topic.route} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Ir a esta pantalla <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
            </details>
          );
        })}
      </div>
    </article>
  );
}
