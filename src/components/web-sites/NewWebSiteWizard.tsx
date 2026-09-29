'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Building,
  Building2,
  CalendarDays,
  Camera,
  Car,
  Check,
  CodeXml,
  Cpu,
  Dumbbell,
  FilePlus,
  GraduationCap,
  Hammer,
  HeartHandshake,
  Images,
  Lightbulb,
  Megaphone,
  PartyPopper,
  PawPrint,
  Scale,
  Scissors,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Store,
  TreePine,
  TriangleAlert,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WebSiteKind, WebSiteMode } from '@prisma/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { findIndustry, INDUSTRY_TEMPLATES, type IndustryIcon } from '@/lib/web-sites/industries';
import { KIND_INFO, WEB_SITE_KINDS } from '@/lib/web-sites/templates';
import { FONT_STACKS } from '@/lib/web-sites/theme';
import { SITE_SLUG_MAX, siteSlugProblem, slugify } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { createWebSiteAction } from '@/modules/web-sites/actions/web-sites.actions';

interface ContactOption {
  id: string;
  name: string;
}

interface Props {
  /** Clientes para asociar el sitio. Vacío = el selector no se muestra. */
  contacts?: ContactOption[];
  /** Hay más clientes de los que caben en la lista. */
  contactsTruncated?: boolean;
  /** Dirección base de la plataforma (`https://…`), para la vista previa de la dirección pública. */
  baseUrl: string;
}

const KIND_ICON: Record<WebSiteKind, LucideIcon> = {
  LANDING: Megaphone,
  CORPORATE: Building2,
  PORTFOLIO: Images,
  CATALOG: Store,
  EVENT: CalendarDays,
  PERSONAL: UserRound,
  BLANK: FilePlus,
};

const INDUSTRY_ICON: Record<IndustryIcon, LucideIcon> = {
  UtensilsCrossed,
  Stethoscope,
  Scale,
  Hammer,
  Scissors,
  Dumbbell,
  Building,
  GraduationCap,
  ShoppingBag,
  Camera,
  PartyPopper,
  TreePine,
  Car,
  HeartHandshake,
  Cpu,
  PawPrint,
};

/** Valor del grupo de rubros para "otro tipo de sitio" (se elige por propósito). */
const OTHER = 'other';

const MODE_LABEL: Record<WebSiteMode, string> = { GUIDED: 'Guiado', HTML: 'HTML propio' };

const STEPS = [
  { n: 1, label: 'Tu negocio' },
  { n: 2, label: 'Cómo armarlo' },
  { n: 3, label: 'Datos básicos' },
] as const;

/** Limpia lo que se escribe en el campo de dirección sin comerse el guion final mientras se teclea. */
function cleanSlugInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
    .slice(0, SITE_SLUG_MAX);
}

/** Tarjeta de un grupo de opciones: es un `radio` real (oculto), así funciona con flechas y Tab. */
function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  labelledBy,
  describedBy,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  /** `id` del título de la tarjeta: es el nombre corto que lee el lector de pantalla. */
  labelledBy: string;
  /** `id` de la descripción. */
  describedBy: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-primary/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
        checked ? 'border-primary bg-accent/40 ring-1 ring-primary' : 'border-border',
        className
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} aria-labelledby={labelledBy} aria-describedby={describedBy} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn('absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-transparent')}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      {children}
    </label>
  );
}

export default function NewWebSiteWizard({ contacts = [], contactsTruncated = false, baseUrl }: Props) {
  const router = useRouter();
  const uid = useId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<WebSiteKind | null>(null);
  /** Rubro elegido (`industries.ts`) u `OTHER` para elegir por propósito. */
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [mode, setMode] = useState<WebSiteMode>('GUIDED');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [slugText, setSlugText] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactId, setContactId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const previousStep = useRef(step);

  // Al cambiar de paso el foco pasa al título: quien usa lector de pantalla o teclado sabe dónde quedó.
  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;
      headingRef.current?.focus();
    }
  }, [step]);

  const trimmedName = name.trim();
  const effectiveSlug = slugTouched ? slugify(slugText) : slugify(name);
  const nameError = trimmedName.length < 2 ? 'Ponle un nombre al sitio (al menos 2 letras).' : null;
  const slugError = trimmedName || slugTouched ? siteSlugProblem(effectiveSlug) : null;
  const showNameError = (nameTouched || submitted) && nameError;
  const base = baseUrl.replace(/\/$/, '');

  const headingId = `${uid}-heading`;
  const nameId = `${uid}-name`;
  const slugId = `${uid}-slug`;
  const contactSelectId = `${uid}-contact`;
  const kindHelpId = `${uid}-kind-help`;

  const industry = findIndustry(industryId);
  const effectiveKind: WebSiteKind | null = industry ? industry.kind : industryId === OTHER ? kind : null;
  const kindInfo = effectiveKind ? KIND_INFO[effectiveKind] : null;
  const canContinue = Boolean(industry) || (industryId === OTHER && kind !== null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    if (!effectiveKind) {
      setStep(1);
      return;
    }
    if (nameError) {
      nameRef.current?.focus();
      return;
    }
    if (slugError) {
      slugRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      // Sin dirección propia se manda vacía: el servidor la arma del nombre y, si ya existe, le agrega un código.
      const result = await createWebSiteAction({ name: trimmedName, slug: slugTouched ? effectiveSlug : undefined, kind: effectiveKind, mode, contactId: contactId || null, industry: industry && mode === 'GUIDED' ? industry.id : null });
      if (!result.success) {
        toast.error(result.error);
        setSaving(false);
        return;
      }
      toast.success(result.message ?? 'Sitio creado');
      router.push(`/dashboard/web-sites/${result.data.id}`);
    } catch {
      toast.error('No pudimos crear el sitio. Revisa tu conexión e intenta de nuevo.');
      setSaving(false);
    }
  }

  const headings: Record<1 | 2 | 3, { title: string; help: string }> = {
    1: { title: '¿De qué es tu negocio?', help: 'Elige tu rubro y te armamos un sitio completo: páginas, secciones en el orden que mejor funciona, colores, tipografías y el botón que más te conviene. Después solo cambias los textos de ejemplo.' },
    2: { title: '¿Cómo lo quieres armar?', help: 'Las dos formas publican un sitio real. Elige la que se ajuste a lo que sabes hacer.' },
    3: { title: 'Datos básicos', help: 'Solo necesitamos un nombre. Todo lo demás lo completas después en el editor.' },
  };

  return (
    <div className="max-w-5xl space-y-6">
      <nav aria-label="Progreso de la creación del sitio" className="space-y-2">
        <ol className="flex items-center gap-2">
          {STEPS.map((item, index) => {
            const done = step > item.n;
            const current = step === item.n;
            return (
              <li key={item.n} aria-current={current ? 'step' : undefined} className={cn('flex items-center gap-2', index < STEPS.length - 1 && 'flex-1')}>
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    done && 'bg-success-soft text-success',
                    current && 'bg-primary text-primary-foreground',
                    !done && !current && 'bg-muted text-muted-foreground'
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : item.n}
                </span>
                <span className={cn('text-sm', current ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {item.label}
                  <span className="sr-only">{done ? ' (completado)' : current ? ' (paso actual)' : ''}</span>
                </span>
                {index < STEPS.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        <div className="h-1 rounded-full bg-muted" aria-hidden="true">
          <div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${(step / STEPS.length) * 100}%` }} />
        </div>
      </nav>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Paso {step} de {STEPS.length}
        </p>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
          {headings[step].title}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{headings[step].help}</p>
      </div>

      {step === 1 && (
        <section className="space-y-5" aria-label="Rubro del sitio">
          <div role="radiogroup" aria-labelledby={headingId} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {INDUSTRY_TEMPLATES.map((item) => {
              const Icon = INDUSTRY_ICON[item.icon];
              return (
                <ChoiceCard key={item.id} name={`${uid}-industry`} value={item.id} checked={industryId === item.id} onSelect={() => setIndustryId(item.id)} labelledBy={`${uid}-ind-${item.id}-title`} describedBy={`${uid}-ind-${item.id}-desc`} className="gap-2 p-3.5">
                  <span className="flex items-center gap-3 pr-6">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-white" style={{ background: item.colors.primary }}>
                      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span id={`${uid}-ind-${item.id}-title`} className="text-sm font-semibold leading-tight">
                      {item.label}
                    </span>
                  </span>
                  <span id={`${uid}-ind-${item.id}-desc`} className="text-xs text-muted-foreground">
                    {item.examples}
                  </span>
                </ChoiceCard>
              );
            })}
            <ChoiceCard name={`${uid}-industry`} value={OTHER} checked={industryId === OTHER} onSelect={() => setIndustryId(OTHER)} labelledBy={`${uid}-ind-other-title`} describedBy={`${uid}-ind-other-desc`} className="gap-2 border-dashed p-3.5">
              <span className="flex items-center gap-3 pr-6">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Sparkles className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span id={`${uid}-ind-other-title`} className="text-sm font-semibold leading-tight">
                  Otro tipo de sitio
                </span>
              </span>
              <span id={`${uid}-ind-other-desc`} className="text-xs text-muted-foreground">
                Elige por propósito: página de captación, portafolio, evento, en blanco…
              </span>
            </ChoiceCard>
          </div>

          {industryId === OTHER ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">¿Para qué es tu sitio?</h3>
              <div role="radiogroup" aria-label="Propósito del sitio" aria-describedby={kindHelpId} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {WEB_SITE_KINDS.map((value) => {
                  const info = KIND_INFO[value];
                  const Icon = KIND_ICON[value];
                  return (
                    <ChoiceCard key={value} name={`${uid}-kind`} value={value} checked={kind === value} onSelect={() => setKind(value)} labelledBy={`${uid}-kind-${value}-title`} describedBy={`${uid}-kind-${value}-desc`}>
                      <span className="flex items-center gap-3 pr-6">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                        </span>
                        <span id={`${uid}-kind-${value}-title`} className="text-sm font-semibold">
                          {info.label}
                        </span>
                      </span>
                      <span id={`${uid}-kind-${value}-desc`} className="flex flex-col gap-3">
                        <span className="text-sm text-foreground">{info.description}</span>
                        <span className="text-xs text-muted-foreground">Ej.: {info.examples}</span>
                      </span>
                    </ChoiceCard>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div id={kindHelpId} aria-live="polite">
            {industry ? (
              <div className="grid gap-4 rounded-lg border border-primary/30 bg-accent/30 p-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Tu sitio de «{industry.label}» vendrá listo con</p>
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>
                        <span className="font-medium">{industry.pages.length} páginas:</span> <span className="text-muted-foreground">{industry.pages.map((page) => page.title).join(' · ')}</span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>
                        <span className="font-medium">Botón destacado «{industry.header.ctaLabel}»</span> <span className="text-muted-foreground">en el encabezado. Objetivo: {industry.goal.charAt(0).toLowerCase() + industry.goal.slice(1)}</span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>
                        <span className="font-medium">Tus datos de contacto</span> <span className="text-muted-foreground">(correo, teléfono y dirección) tomados de la ficha de tu empresa{industry.whatsappButton ? ', con botón de WhatsApp' : ''}{industry.actionBar ? ' y barra «Llamar · WhatsApp · Cómo llegar» en el celular' : ''}.</span>
                      </span>
                    </li>
                  </ul>
                  <div className="flex items-center gap-3">
                    <span className="flex overflow-hidden rounded-md border border-border" aria-hidden="true">
                      {[industry.colors.primary, industry.colors.accent, industry.colors.background, industry.colors.text].map((color) => (
                        <span key={color} className="size-6" style={{ background: color }} />
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Colores y tipografía{' '}
                      <span className="font-medium text-foreground" style={{ fontFamily: FONT_STACKS[industry.headingFont === 'same' ? industry.font : industry.headingFont].css }}>
                        {FONT_STACKS[industry.headingFont === 'same' ? industry.font : industry.headingFont].label}
                      </span>{' '}
                      pensados para el rubro (los cambias cuando quieras).
                    </span>
                  </div>
                </div>
                <div className="space-y-2 rounded-md bg-card p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Lightbulb className="size-4 text-warning" aria-hidden="true" /> Errores comunes del rubro
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {industry.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : kindInfo ? (
              <div className="rounded-lg border border-primary/30 bg-accent/30 p-4">
                <p className="text-sm font-semibold">Un sitio tipo «{kindInfo.label}» debe incluir</p>
                <ul className="mt-2 space-y-1.5">
                  {kindInfo.mustHave.map((item) => (
                    <li key={`${item.type}-${item.label}`} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>
                        <span className="font-medium">{item.label}.</span> <span className="text-muted-foreground">{item.why}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">En modo guiado te las dejamos armadas con textos de ejemplo para que solo los cambies.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{industryId === OTHER ? 'Elige un propósito para ver qué incluirá tu sitio.' : 'Elige tu rubro para ver qué incluirá tu sitio.'}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard/web-sites" className={buttonVariants({ variant: 'ghost' })}>
              Cancelar
            </Link>
            <Button type="button" disabled={!canContinue} onClick={() => setStep(2)}>
              Continuar <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4" aria-label="Forma de armar el sitio">
          <div role="radiogroup" aria-labelledby={headingId} className="grid gap-3 md:grid-cols-2">
            <ChoiceCard name={`${uid}-mode`} value="GUIDED" checked={mode === 'GUIDED'} onSelect={() => setMode('GUIDED')} labelledBy={`${uid}-mode-guided-title`} describedBy={`${uid}-mode-guided-desc`} className="p-5">
              <span className="flex items-center gap-3 pr-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Blocks className="size-6" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span id={`${uid}-mode-guided-title`} className="text-base font-semibold">
                    Guiado
                  </span>
                  <StatusBadge tone="success">Recomendado</StatusBadge>
                </span>
              </span>
              <span id={`${uid}-mode-guided-desc`} className="text-sm text-foreground">Armas el sitio por secciones (portada, servicios, galería, contacto…). Cada una trae ejemplos y una lista te dice qué te falta antes de publicar. No necesitas escribir código.</span>
              <span className="space-y-1.5 text-sm text-muted-foreground">
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> Textos de ejemplo que solo cambias
                </span>
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> Formulario de contacto: los mensajes llegan a tu bandeja
                </span>
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> Lista de «qué te falta» antes de publicar
                </span>
              </span>
            </ChoiceCard>

            <ChoiceCard name={`${uid}-mode`} value="HTML" checked={mode === 'HTML'} onSelect={() => setMode('HTML')} labelledBy={`${uid}-mode-html-title`} describedBy={`${uid}-mode-html-desc ${uid}-mode-html-warn`} className="p-5">
              <span className="flex items-center gap-3 pr-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <CodeXml className="size-6" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span id={`${uid}-mode-html-title`} className="text-base font-semibold">
                  HTML propio
                </span>
              </span>
              <span id={`${uid}-mode-html-desc`} className="text-sm text-foreground">Pegas o escribes tu propio HTML y CSS. Sirve si ya tienes el diseño hecho o sabes programar.</span>
              <span id={`${uid}-mode-html-warn`} className="mt-auto flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Tu página no ejecuta JavaScript y no puede tener formularios. Se publica aislada del resto de la plataforma, por seguridad. Para que te contacten, usa enlaces de WhatsApp o de correo.</span>
              </span>
            </ChoiceCard>
          </div>

          {industry && mode === 'HTML' ? (
            <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> El sitio listo de «{industry.label}» se arma solo en modo guiado. En HTML propio partes de una página básica.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft aria-hidden="true" /> Atrás
            </Button>
            <Button type="button" onClick={() => setStep(3)}>
              Continuar <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5" aria-label="Datos básicos del sitio">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
            <span>
              <span className="text-muted-foreground">{industry && mode === 'GUIDED' ? 'Rubro:' : 'Tipo:'}</span> <span className="font-medium">{industry && mode === 'GUIDED' ? industry.label : kindInfo?.label}</span>{' '}
              <button type="button" onClick={() => setStep(1)} className="text-xs text-primary underline-offset-4 hover:underline">
                Cambiar<span className="sr-only"> el rubro o tipo de sitio</span>
              </button>
            </span>
            <span>
              <span className="text-muted-foreground">Forma:</span> <span className="font-medium">{MODE_LABEL[mode]}</span>{' '}
              <button type="button" onClick={() => setStep(2)} className="text-xs text-primary underline-offset-4 hover:underline">
                Cambiar<span className="sr-only"> la forma de armarlo</span>
              </button>
            </span>
          </div>

          <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-card">
            <div className="space-y-1.5">
              <Label htmlFor={nameId}>Nombre del sitio</Label>
              <Input
                id={nameId}
                ref={nameRef}
                value={name}
                maxLength={80}
                autoComplete="off"
                required
                aria-required="true"
                aria-invalid={showNameError ? true : undefined}
                aria-describedby={showNameError ? `${nameId}-hint ${nameId}-error` : `${nameId}-hint`}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="Ej: Panadería Doña Rosa"
              />
              <p id={`${nameId}-hint`} className="text-xs text-muted-foreground">
                Es el nombre que aparece en el encabezado y en tu lista de sitios. Lo puedes cambiar después.
              </p>
              {showNameError && (
                <p id={`${nameId}-error`} role="alert" className="text-xs text-danger">
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={slugId}>Dirección pública</Label>
              <div className="flex items-stretch">
                <span className="flex items-center rounded-l-xl border border-r-0 border-input bg-secondary px-3 text-sm text-muted-foreground" aria-hidden="true">
                  /web/
                </span>
                <Input
                  id={slugId}
                  ref={slugRef}
                  value={slugTouched ? slugText : slugify(name)}
                  maxLength={SITE_SLUG_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={slugError ? true : undefined}
                  aria-describedby={slugError ? `${slugId}-preview ${slugId}-hint ${slugId}-error` : `${slugId}-preview ${slugId}-hint`}
                  className="rounded-l-none"
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlugText(cleanSlugInput(e.target.value));
                  }}
                  onBlur={() => {
                    if (slugTouched) setSlugText(slugify(slugText));
                  }}
                  placeholder="panaderia-dona-rosa"
                />
              </div>
              <p id={`${slugId}-preview`} className="text-sm">
                <span className="text-muted-foreground">Tu sitio se verá en:</span> <span className="font-mono break-all">{`${base}/web/${effectiveSlug || '…'}`}</span>
              </p>
              <p id={`${slugId}-hint`} className="text-xs text-muted-foreground">
                {slugTouched
                  ? 'Solo letras minúsculas, números y guiones. Si otro sitio ya usa esta dirección, te avisaremos para que pruebes otra.'
                  : 'Se arma sola con el nombre. Si prefieres otra, escríbela aquí. Si ya existe, le agregamos un código al final. Después puedes conectar tu propio dominio (ej. minegocio.cl).'}
              </p>
              {slugError && (
                <p id={`${slugId}-error`} role="alert" className="text-xs text-danger">
                  {slugError}
                </p>
              )}
            </div>

            {contacts.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor={contactSelectId}>¿Lo armas para un cliente?</Label>
                <select id={contactSelectId} className={nativeSelectClass} value={contactId} aria-describedby={`${contactSelectId}-hint`} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">No, es para mi empresa</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
                <p id={`${contactSelectId}-hint`} className="text-xs text-muted-foreground">
                  Elígelo y el sitio queda asociado a su ficha. Es opcional.
                  {contactsTruncated ? ' Se muestran solo algunos clientes; si no encuentras el que buscas, asócialo después en los ajustes del sitio.' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setStep(2)}>
              <ArrowLeft aria-hidden="true" /> Atrás
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando…' : 'Crear sitio'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
