import type { CSSProperties, ReactNode } from 'react';
import { blockAnchors, buildNav, type BlockOf, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { themeVariables, type WebSiteTheme } from '@/lib/web-sites/theme';
import { isExternalHref, safeHref, safeImageSrc, whatsappHref } from '@/lib/web-sites/urls';
import ContactForm from './ContactForm';

/**
 * Pinta un sitio armado en modo guiado. Lo usan la página pública y la vista
 * previa del editor, así que lo que el usuario ve mientras edita es lo que
 * publica. Todo texto pasa como texto de React (escapado) y todo enlace/imagen
 * por `safeHref`/`safeImageSrc`: un bloque nunca puede inyectar HTML ni
 * `javascript:`.
 *
 * Es responsivo por el ANCHO DEL CONTENEDOR (container queries de Tailwind,
 * `@md:`…), no por el de la ventana: así la vista previa "celular" del editor
 * se ve realmente como un celular.
 */

export interface SiteRendererProps {
  name: string;
  logoUrl: string | null;
  theme: WebSiteTheme;
  blocks: WebSiteBlock[];
  slug: string;
  mode: 'public' | 'preview';
}

function A({ href, preview, className, children }: { href: string | null; preview: boolean; className?: string; children: ReactNode }) {
  if (!href) return <span className={className}>{children}</span>;
  // En la vista previa nada navega: un clic no debe sacar al usuario del editor.
  if (preview) return <span role="link" className={className}>{children}</span>;
  const external = isExternalHref(href);
  return (
    <a href={href} className={className} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}

function Img({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const safe = safeImageSrc(src);
  if (!safe) return null;
  // Imágenes remotas del almacenamiento del cliente: no pasan por next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safe} alt={alt} loading="lazy" decoding="async" className={className} />;
}

const button = 'inline-block px-6 py-3 font-semibold rounded-[var(--ws-radius)] transition-opacity hover:opacity-90';
const section = 'px-6 py-14 @2xl:py-20';
const inner = 'mx-auto w-full max-w-5xl';
const h2 = 'mb-6 text-2xl font-bold tracking-tight @2xl:text-3xl';

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-lg leading-relaxed">
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

function Hero({ block, preview }: { block: BlockOf<'hero'>; preview: boolean }) {
  const image = safeImageSrc(block.imageUrl);
  const href = safeHref(block.ctaHref);
  return (
    <div className="relative isolate overflow-hidden bg-[color:var(--ws-primary)] px-6 py-20 text-center text-[color:var(--ws-on-primary)] @2xl:py-32">
      {image && (
        <>
          <Img src={image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-[color:var(--ws-primary)] opacity-70" />
        </>
      )}
      <div className="mx-auto max-w-3xl">
        {block.title && <h1 className="text-4xl leading-tight font-bold tracking-tight @2xl:text-6xl">{block.title}</h1>}
        {block.subtitle && <p className="mx-auto mt-5 max-w-2xl text-lg opacity-90 @2xl:text-xl">{block.subtitle}</p>}
        {block.ctaLabel && href && (
          <A href={href} preview={preview} className={`${button} mt-8 bg-[color:var(--ws-accent)] text-[color:var(--ws-on-accent)]`}>
            {block.ctaLabel}
          </A>
        )}
      </div>
    </div>
  );
}

function Contact({ block, slug, preview }: { block: BlockOf<'contact'>; slug: string; preview: boolean }) {
  const mail = block.email ? safeHref(`mailto:${block.email}`) : null;
  const tel = block.phone ? safeHref(`tel:${block.phone}`) : null;
  const wa = whatsappHref(block.whatsapp);
  const hasInfo = Boolean(mail || tel || wa || block.address);
  return (
    <div className={`${inner} grid gap-10 ${block.showForm && hasInfo ? '@2xl:grid-cols-2' : ''}`}>
      <div>
        {block.heading && <h2 className={h2}>{block.heading}</h2>}
        {block.text && <p className="mb-6 text-lg leading-relaxed whitespace-pre-line">{block.text}</p>}
        {hasInfo && (
          <ul className="space-y-3 text-lg">
            {mail && (
              <li>
                <A href={mail} preview={preview} className="underline underline-offset-4">
                  {block.email}
                </A>
              </li>
            )}
            {tel && (
              <li>
                <A href={tel} preview={preview} className="underline underline-offset-4">
                  {block.phone}
                </A>
              </li>
            )}
            {wa && (
              <li>
                <A href={wa} preview={preview} className={`${button} bg-[color:var(--ws-accent)] text-[color:var(--ws-on-accent)]`}>
                  Escribir por WhatsApp
                </A>
              </li>
            )}
            {block.address && <li className="whitespace-pre-line">{block.address}</li>}
          </ul>
        )}
      </div>
      {block.showForm && <ContactForm slug={slug} preview={preview} />}
    </div>
  );
}

function renderBlock(block: WebSiteBlock, ctx: { slug: string; preview: boolean }): ReactNode {
  switch (block.type) {
    case 'hero':
      return <Hero block={block} preview={ctx.preview} />;
    case 'text':
      return (
        <div className={`${inner} max-w-3xl`}>
          {block.heading && <h2 className={h2}>{block.heading}</h2>}
          <Paragraphs text={block.body} />
        </div>
      );
    case 'image':
      return safeImageSrc(block.imageUrl) ? (
        <figure className={`${inner} max-w-4xl`}>
          <Img src={block.imageUrl} alt={block.alt} className="w-full object-cover rounded-[var(--ws-radius)]" />
          {block.caption && <figcaption className="mt-3 text-center text-sm text-[color:var(--ws-muted)]">{block.caption}</figcaption>}
        </figure>
      ) : null;
    case 'gallery': {
      const images = block.images.filter((image) => safeImageSrc(image.url));
      return (
        <div className={inner}>
          {block.heading && <h2 className={h2}>{block.heading}</h2>}
          {images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4">
              {images.map((image, index) => (
                <li key={index} className="aspect-square overflow-hidden rounded-[var(--ws-radius)]">
                  <Img src={image.url} alt={image.alt} className="h-full w-full object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'features': {
      const items = block.items.filter((item) => item.title || item.text);
      return (
        <div className={inner}>
          {block.heading && <h2 className={h2}>{block.heading}</h2>}
          {block.intro && <p className="mb-8 max-w-2xl text-lg text-[color:var(--ws-muted)]">{block.intro}</p>}
          <ul className="grid gap-5 @md:grid-cols-2 @3xl:grid-cols-3">
            {items.map((item, index) => (
              <li key={index} className="border border-[color:var(--ws-text)]/15 p-6 rounded-[var(--ws-radius)]">
                <Img src={item.imageUrl} alt="" className="mb-4 aspect-video w-full object-cover rounded-[var(--ws-radius)]" />
                {item.title && <h3 className="text-xl font-semibold">{item.title}</h3>}
                {item.text && <p className="mt-2 leading-relaxed text-[color:var(--ws-muted)]">{item.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'cta': {
      const href = safeHref(block.buttonHref);
      return (
        <div className={`${inner} bg-[color:var(--ws-accent)] px-8 py-12 text-center text-[color:var(--ws-on-accent)] rounded-[var(--ws-radius)]`}>
          {block.title && <h2 className="text-2xl font-bold @2xl:text-3xl">{block.title}</h2>}
          {block.text && <p className="mx-auto mt-3 max-w-2xl text-lg opacity-90">{block.text}</p>}
          {block.buttonLabel && href && (
            <A href={href} preview={ctx.preview} className={`${button} mt-6 bg-[color:var(--ws-primary)] text-[color:var(--ws-on-primary)]`}>
              {block.buttonLabel}
            </A>
          )}
        </div>
      );
    }
    case 'faq': {
      const items = block.items.filter((item) => item.question);
      return (
        <div className={`${inner} max-w-3xl`}>
          {block.heading && <h2 className={h2}>{block.heading}</h2>}
          <div className="divide-y divide-[color:var(--ws-text)]/15 border-y border-[color:var(--ws-text)]/15">
            {items.map((item, index) => (
              <details key={index} className="group py-4">
                <summary className="cursor-pointer text-lg font-semibold">{item.question}</summary>
                {item.answer && <p className="mt-3 leading-relaxed whitespace-pre-line text-[color:var(--ws-muted)]">{item.answer}</p>}
              </details>
            ))}
          </div>
        </div>
      );
    }
    case 'testimonials': {
      const items = block.items.filter((item) => item.quote);
      return (
        <div className={inner}>
          {block.heading && <h2 className={h2}>{block.heading}</h2>}
          <ul className="grid gap-5 @2xl:grid-cols-2">
            {items.map((item, index) => (
              <li key={index}>
                <blockquote className="h-full border-l-4 border-[color:var(--ws-accent)] bg-[color:var(--ws-text)]/5 p-6 rounded-[var(--ws-radius)]">
                  <p className="text-lg leading-relaxed italic">“{item.quote}”</p>
                  {(item.author || item.role) && (
                    <footer className="mt-4 text-sm font-semibold">
                      {item.author}
                      {item.role && <span className="font-normal text-[color:var(--ws-muted)]"> · {item.role}</span>}
                    </footer>
                  )}
                </blockquote>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'contact':
      return <Contact block={block} slug={ctx.slug} preview={ctx.preview} />;
  }
}

export default function SiteRenderer({ name, logoUrl, theme, blocks, slug, mode }: SiteRendererProps) {
  const preview = mode === 'preview';
  const visible = blocks.filter((block) => !block.hidden);
  const anchors = blockAnchors(visible);
  const nav = theme.showNav ? buildNav(blocks) : [];
  const rootStyle = { ...themeVariables(theme), fontFamily: 'var(--ws-font)', background: 'var(--ws-bg)', color: 'var(--ws-text)' } as CSSProperties;

  return (
    <div className="@container" style={rootStyle}>
      {theme.showNav && (
        <header className="sticky top-0 z-10 border-b border-[color:var(--ws-text)]/10 bg-[color:var(--ws-bg)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Img src={logoUrl} alt="" className="h-9 w-auto max-w-[8rem] object-contain" />
              <span className="truncate text-lg font-bold">{name}</span>
            </div>
            {nav.length > 0 && (
              <nav aria-label="Secciones" className="hidden gap-5 text-sm font-medium @2xl:flex">
                {nav.map((entry) => (
                  <A key={entry.anchor} href={`#${entry.anchor}`} preview={preview} className="underline-offset-4 hover:underline">
                    {entry.label}
                  </A>
                ))}
              </nav>
            )}
          </div>
        </header>
      )}
      <main>
        {visible.map((block) => (
          <section key={block.id} id={block.type === 'hero' ? undefined : anchors.get(block.id)} className={block.type === 'hero' ? undefined : `${section} scroll-mt-16`}>
            {renderBlock(block, { slug, preview })}
          </section>
        ))}
      </main>
      <footer className="border-t border-[color:var(--ws-text)]/10 px-6 py-8 text-center text-sm text-[color:var(--ws-muted)]">
        {theme.footerText || `© ${new Date().getFullYear()} ${name}`}
      </footer>
    </div>
  );
}
