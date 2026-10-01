import type { ReactNode } from 'react';
import { POSTER_FORMAT_SPECS, posterUnit } from '../formats';
import { alpha } from '../palettes';
import { initialsOf, type PosterContent } from '../pieces';
import { heroCrowdMin, solveGrid, solveStack, type StackBlock } from '../layout';
import { fitGroups } from '../text-fit';
import { Arrow, Box, Check, Lines, NameLines, QrCard, Sparkle, fit, fontOf, qrCardHeight, upper, type PosterRenderInput, type PosterTypeKit } from './primitives';

/**
 * Estilo "Impacto": moderno y para detener el scroll. Foto a sangre arriba
 * que se funde con el fondo, titular condensado (Anton) a todo el ancho,
 * una cinta de color cruzada con el llamado a la acción y bloques de color
 * pleno. Fondo casi negro teñido del acento.
 */

const MAX_TILES = 30;
const WHITE = '#ffffff';

interface Ctx {
  u: number;
  type: PosterTypeKit;
  pal: PosterRenderInput['palette'];
  bg: string;
}

function photoOf(content: PosterContent, images: PosterRenderInput['images']): string | null {
  if (content.hero.kind === 'portrait') return images.portrait;
  if (content.hero.kind === 'cover') return images.background;
  return null;
}

function stripes(ctx: Ctx): string {
  const { u, pal } = ctx;
  return `repeating-linear-gradient(135deg, ${alpha(pal.main, 0.12)} 0px, ${alpha(pal.main, 0.12)} ${12 * u}px, transparent ${12 * u}px, transparent ${34 * u}px)`;
}

function Eyebrow({ text, ctx, maxWidth }: { text: string; ctx: Ctx; maxWidth: number }) {
  const { u, type, pal } = ctx;
  const eyebrowFit = fit(type, 'accent', upper(text), { maxWidth: maxWidth - 44 * u, maxLines: 1, maxSize: 26 * u, minSize: 11, letterSpacingEm: 0.04 });
  return (
    <Box style={{ padding: `${10 * u}px ${22 * u}px`, background: pal.main, transform: 'rotate(-3deg)', boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.35)` }}>
      <Lines fit={eyebrowFit} type={type} role="accent" color={pal.ink} letterSpacingEm={0.04} lineHeight={1.15} />
    </Box>
  );
}

/** Pieza central sin foto (fecha, cuenta, mosaico, nombres), dibujada dentro de `width` × `height`. */
function Hero({ content, images, width, height, ctx }: { content: PosterContent; images: PosterRenderInput['images']; width: number; height: number; ctx: Ctx }): ReactNode {
  const { u, type, pal } = ctx;
  const hero = content.hero;
  if (height <= 0) return null;

  if (hero.kind === 'cover') {
    // Sin foto: el año de la edición en grande, si existe (dato real).
    if (!content.edition || height < 160 * u) return null;
    const numeralFit = fit(type, 'numeral', content.edition, { maxWidth: width, maxLines: 1, maxSize: height * 0.85, minSize: 30 });
    return (
      <Box style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Lines fit={numeralFit} type={type} role="numeral" color={alpha(pal.main, 0.85)} lineHeight={1} />
      </Box>
    );
  }

  if (hero.kind === 'portrait') {
    return (
      <Box style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', ...fontOf(type, 'display'), fontSize: Math.min(height * 0.6, width * 0.5), color: pal.main }}>{hero.monogram}</div>
      </Box>
    );
  }

  if (hero.kind === 'date') {
    const day = Math.min(height * 0.88, width * 0.5);
    const sideW = width - day * 0.95 - 30 * u;
    const monthFit = fit(type, 'display', upper(hero.month), { maxWidth: sideW, maxLines: 1, maxSize: day * 0.36, minSize: 16 });
    const weekdayFit = fit(type, 'accent', upper(hero.weekday), { maxWidth: sideW, maxLines: 1, maxSize: day * 0.13, minSize: 11 });
    const timeFit = fit(type, 'display', `${hero.year} · ${upper(hero.time)}`, { maxWidth: sideW, maxLines: 1, maxSize: day * 0.16, minSize: 11 });
    return (
      <Box style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: day, lineHeight: 1, color: WHITE }}>{hero.day}</div>
        <Box style={{ flexDirection: 'column', marginLeft: 30 * u }}>
          <Lines fit={weekdayFit} type={type} role="accent" color={pal.main} align="left" lineHeight={1.2} />
          <Lines fit={monthFit} type={type} role="display" color={WHITE} align="left" lineHeight={1.02} />
          <Box style={{ marginTop: 10 * u, padding: `${6 * u}px ${14 * u}px`, background: pal.main }}>
            <Lines fit={timeFit} type={type} role="display" color={pal.ink} align="left" lineHeight={1.1} />
          </Box>
        </Box>
      </Box>
    );
  }

  if (hero.kind === 'countdown') {
    const numeric = /^\d+$/.test(hero.value);
    const valueFit = fit(type, numeric ? 'numeral' : 'display', upper(hero.value), { maxWidth: width * 0.62, maxLines: 1, maxSize: height * 0.9, minSize: 40 });
    const sideW = width - valueFit.width - 40 * u;
    const unitFit = hero.unit ? fit(type, 'display', upper(hero.unit), { maxWidth: sideW, maxLines: 1, maxSize: valueFit.fontSize * 0.42, minSize: 16 }) : null;
    const captionFit = fit(type, 'accent', upper(hero.caption), { maxWidth: sideW, maxLines: 2, maxSize: 30 * u, minSize: 11, lineHeight: 1.15 });
    return (
      <Box style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Lines fit={valueFit} type={type} role={numeric ? 'numeral' : 'display'} color={pal.main} lineHeight={0.95} />
        <Box style={{ flexDirection: 'column', marginLeft: 36 * u }}>
          {unitFit && <Lines fit={unitFit} type={type} role="display" color={WHITE} align="left" lineHeight={1} />}
          <Lines fit={captionFit} type={type} role="accent" color={pal.main} align="left" lineHeight={1.15} style={{ marginTop: 8 * u }} />
        </Box>
      </Box>
    );
  }

  if (hero.kind === 'mosaic') {
    const shown = hero.tiles.length > MAX_TILES ? hero.tiles.slice(0, MAX_TILES - 1) : hero.tiles;
    const extra = hero.total - shown.length;
    const count = shown.length + (extra > 0 ? 1 : 0);
    const gap = 12 * u;
    let grid = solveGrid(count, width, height, { aspect: 1.22, gap, captionHeight: 0 });
    const captionH = Math.max(22 * u, Math.min(grid.tileWidth * 0.2, 46 * u));
    grid = solveGrid(count, width, height, { aspect: 1.22, gap, captionHeight: captionH + 4 * u });
    const tw = grid.tileWidth;
    const th = grid.tileHeight;
    const chip = Math.max(22 * u, Math.min(tw * 0.22, 54 * u));
    const tiles: ReactNode[] = shown.map((tile, index) => {
      const src = images.tiles[index] ?? null;
      const nameFit = fit(type, 'display', upper(tile.title), { maxWidth: tw, maxLines: 1, maxSize: captionH * 0.72, minSize: 8 });
      return (
        <Box key={index} style={{ flexDirection: 'column', width: tw }}>
          <Box style={{ position: 'relative', width: tw, height: th, borderRadius: 12 * u, background: alpha(pal.main, 0.25), alignItems: 'center', justifyContent: 'center' }}>
            {src ? (
              // Esquinas en la propia foto, no con `overflow: hidden` en la caja: recortar 30 cajas es varias veces más lento.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" width={tw} height={th} style={{ width: tw, height: th, objectFit: 'cover', objectPosition: 'center 18%', borderRadius: 12 * u }} />
            ) : (
              <div style={{ display: 'flex', ...fontOf(type, 'display'), fontSize: tw * 0.36, color: pal.main }}>{initialsOf(tile.title)}</div>
            )}
            {tile.badge && (
              <Box style={{ position: 'absolute', top: 0, left: 0, minWidth: chip, height: chip, padding: `0 ${6 * u}px`, background: pal.main, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12 * u, borderBottomRightRadius: 10 * u }}>
                <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: chip * 0.68, lineHeight: 1, color: pal.ink }}>{tile.badge}</div>
              </Box>
            )}
          </Box>
          <Lines fit={nameFit} type={type} role="display" color={WHITE} align="left" lineHeight={1.25} style={{ marginTop: 4 * u }} />
        </Box>
      );
    });
    if (extra > 0) {
      tiles.push(
        <Box key="extra" style={{ width: tw, height: th, borderRadius: 12 * u, background: pal.main, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: tw * 0.32, color: pal.ink }}>{`+${extra}`}</div>
        </Box>,
      );
    }
    const rows: ReactNode[] = [];
    for (let r = 0; r < grid.rows; r++) {
      rows.push(
        <Box key={r} style={{ gap, marginTop: r === 0 ? 0 : gap, justifyContent: 'center' }}>
          {tiles.slice(r * grid.cols, (r + 1) * grid.cols)}
        </Box>,
      );
    }
    return <Box style={{ flexDirection: 'column', width, height, justifyContent: 'center', alignItems: 'center' }}>{rows}</Box>;
  }

  // names
  const groupGap = 26 * u;
  const groups = fitGroups(
    hero.groups.map((group) => ({ ...group, items: group.items.map(upper) })),
    type.measure.display,
    { maxWidth: width, maxHeight: height, maxSize: (height > 900 * u ? 84 : 70) * u, minSize: 14, separator: '  /  ', lineHeight: 1.22, labelHeight: () => 20 * u * 1.3 + 10 * u + groupGap },
  );
  return (
    <Box style={{ flexDirection: 'column', width, height, justifyContent: 'center' }}>
      {groups.groups.map(({ group, lines }, index) => (
        <Box key={index} style={{ flexDirection: 'column', marginTop: index === 0 ? 0 : groupGap }}>
          {group.label && (
            <Box style={{ marginBottom: 10 * u }}>
              <Box style={{ padding: `${2 * u}px ${10 * u}px`, background: pal.main }}>
                <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'sansBold'), fontSize: 20 * u, letterSpacing: '0.16em', color: pal.ink, lineHeight: 1.3 }}>{upper(group.label)}</div>
              </Box>
            </Box>
          )}
          <NameLines lines={lines} type={type} role="display" size={groups.fontSize} color={WHITE} separator="  /  " separatorColor={pal.main} lineHeight={1.22} align="left" />
        </Box>
      ))}
    </Box>
  );
}

interface Blocks {
  stack: StackBlock[];
  render: Record<string, ReactNode>;
}

function Ticker({ text, ctx, width }: { text: string; ctx: Ctx; width: number }) {
  const { u, type, pal } = ctx;
  const size = 34 * u;
  const items = Array.from({ length: 10 }, (_, index) => index);
  return (
    <Box style={{ width, height: size * 1.9, background: pal.main, alignItems: 'center', overflow: 'hidden', transform: 'rotate(-2.5deg)' }}>
      {items.map((index) => (
        <Box key={index} style={{ alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'display'), fontSize: size, lineHeight: 1, color: pal.ink, margin: `0 ${22 * u}px` }}>{text}</div>
          <Sparkle size={size * 0.7} color={pal.ink} />
        </Box>
      ))}
    </Box>
  );
}

function textBlocks(input: PosterRenderInput, width: number, ctx: Ctx, opts: { bleedWidth: number; padX: number; withHero: boolean }): Blocks {
  const { content, format, qrDataUrl } = input;
  const { u, type, pal } = ctx;
  const story = format === 'story';
  const square = format === 'square';
  const stack: StackBlock[] = [];
  const render: Record<string, ReactNode> = {};

  if (opts.withHero) stack.push({ key: 'hero', height: 0, gap: 0, drop: 0 });

  if (content.kicker) {
    const kickerFit = fit(type, 'accent', upper(content.kicker), { maxWidth: width, maxLines: 1, maxSize: (square ? 30 : 38) * u, minSize: 12, letterSpacingEm: 0.02 });
    stack.push({ key: 'kicker', height: kickerFit.height, gap: 18 * u, drop: 1 });
    render.kicker = <Lines fit={kickerFit} type={type} role="accent" color={pal.main} align="left" letterSpacingEm={0.02} />;
  }

  const person = content.piece === 'candidata' || content.piece === 'resultados';
  const heavy = content.hero.kind === 'mosaic' || content.hero.kind === 'names';
  const headlineFit = fit(type, 'display', upper(content.headline), {
    maxWidth: width,
    maxLines: person ? 2 : 3,
    maxSize: (story ? 280 : square ? 170 : 240) * u * (person ? 0.62 : heavy ? 0.62 : 1),
    minSize: 40,
    // Las mayúsculas con tilde de Anton (Í, Ó, É) chocan con la línea de arriba si se aprieta más.
    lineHeight: 1.02,
  });
  stack.push({ key: 'headline', height: headlineFit.height, gap: content.kicker ? 4 * u : 18 * u, drop: 0 });
  render.headline = <Lines fit={headlineFit} type={type} role="display" color={WHITE} align="left" lineHeight={1.02} />;

  if (content.edition && !person) {
    const size = 30 * u;
    stack.push({ key: 'edition', height: size * 1.25, gap: 10 * u, drop: 4 });
    render.edition = (
      <Box style={{ alignItems: 'center' }}>
        <Box style={{ width: 60 * u, height: 6 * u, background: pal.main, marginRight: 16 * u }} />
        <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: size, lineHeight: 1.25, color: pal.main, letterSpacing: '0.08em' }}>{`EDICIÓN ${content.edition}`}</div>
      </Box>
    );
  }

  if (content.cta) {
    const tickerH = 34 * u * 1.9 + 50 * u;
    stack.push({ key: 'ticker', height: tickerH, gap: 26 * u, drop: 7 });
    render.ticker = (
      <Box style={{ width: opts.bleedWidth, marginLeft: -opts.padX - 60 * u, height: tickerH, alignItems: 'center' }}>
        <Ticker text={upper(content.cta.label)} ctx={ctx} width={opts.bleedWidth + 120 * u} />
      </Box>
    );
  }

  if (content.subline) {
    const sublineFit = fit(type, 'sans', content.subline, { maxWidth: width * 0.94, maxLines: 2, maxSize: (square ? 26 : 32) * u, minSize: 12, lineHeight: 1.3 });
    stack.push({ key: 'subline', height: sublineFit.height, gap: 20 * u, drop: 5 });
    render.subline = <Lines fit={sublineFit} type={type} role="sans" color={alpha(WHITE, 0.86)} align="left" lineHeight={1.3} />;
  }

  if (content.facts.length > 0) {
    const facts = content.facts.slice(0, 4);
    const colGap = 18 * u;
    const colW = (width - colGap * (facts.length - 1)) / facts.length;
    const inner = colW - 24 * u;
    const labelSize = Math.min(...facts.map((f) => fit(type, 'sansBold', upper(f.label), { maxWidth: inner, maxLines: 1, maxSize: 17 * u, minSize: 9, letterSpacingEm: 0.12 }).fontSize));
    const valueSize = Math.min(...facts.map((f) => fit(type, 'display', upper(f.value), { maxWidth: inner, maxLines: 2, maxSize: (square ? 34 : 42) * u, minSize: 12, lineHeight: 1.04 }).fontSize));
    const valueFits = facts.map((f) => fit(type, 'display', upper(f.value), { maxWidth: inner, maxLines: 2, maxSize: valueSize, minSize: 8, lineHeight: 1.04 }));
    const valueH = Math.max(...valueFits.map((f) => f.height));
    stack.push({ key: 'facts', height: labelSize * 1.4 + 4 * u + valueH, gap: 28 * u, drop: 3 });
    render.facts = (
      <Box style={{ width }}>
        {facts.map((f, index) => (
          <Box key={index} style={{ flexDirection: 'column', width: colW, marginLeft: index === 0 ? 0 : colGap, borderLeft: `${6 * u}px solid ${pal.main}`, paddingLeft: 16 * u }}>
            <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'sansBold'), fontSize: labelSize, letterSpacing: '0.12em', color: pal.main, lineHeight: 1.4, marginBottom: 4 * u }}>{upper(f.label)}</div>
            <Lines fit={valueFits[index]!} type={type} role="display" color={WHITE} align="left" lineHeight={1.04} />
          </Box>
        ))}
      </Box>
    );
  }

  if (content.list && content.list.items.length > 0) {
    const items = content.list.items.slice(0, 4);
    const itemSize = Math.min(...items.map((item) => fit(type, 'sansBold', item, { maxWidth: width - 60 * u, maxLines: 1, maxSize: 25 * u, minSize: 11 }).fontSize));
    const rowH = itemSize * 1.6;
    stack.push({ key: 'list', height: rowH * items.length, gap: 24 * u, drop: 6 });
    render.list = (
      <Box style={{ flexDirection: 'column' }}>
        {items.map((item, index) => (
          <Box key={index} style={{ alignItems: 'center', height: rowH }}>
            <Box style={{ width: itemSize * 1.15, height: itemSize * 1.15, background: pal.main, alignItems: 'center', justifyContent: 'center', borderRadius: 4 * u, marginRight: 16 * u }}>
              {content.list!.marker === 'check' ? <Check size={itemSize * 0.85} color={pal.ink} /> : <div style={{ display: 'flex', width: itemSize * 0.3, height: itemSize * 0.3, background: pal.ink }} />}
            </Box>
            <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'sansBold'), fontSize: itemSize, color: WHITE }}>{item}</div>
          </Box>
        ))}
      </Box>
    );
  }

  if (content.note) {
    const noteFit = fit(type, 'accent', content.note, { maxWidth: width, maxLines: 2, maxSize: (square ? 28 : 34) * u, minSize: 12, lineHeight: 1.2 });
    stack.push({ key: 'note', height: noteFit.height, gap: 22 * u, drop: 2 });
    render.note = <Lines fit={noteFit} type={type} role="accent" color={pal.main} align="left" lineHeight={1.2} />;
  }

  if (content.cta || (content.qr && qrDataUrl)) {
    const qrSize = qrDataUrl ? (story ? 180 : format === 'print' ? 200 : square ? 130 : 160) * u : 0;
    const qrH = qrDataUrl ? qrCardHeight(qrSize) : 0;
    const ctaW = qrDataUrl ? width - qrSize * 1.18 - 28 * u : width;
    const labelFit = content.cta ? fit(type, 'display', upper(content.cta.label), { maxWidth: ctaW - 130 * u, maxLines: 1, maxSize: (story ? 54 : 46) * u, minSize: 14 }) : null;
    const bar = labelFit ? labelFit.fontSize * 1.1 + 40 * u : 0;
    const urlFit = content.cta?.displayUrl ? fit(type, 'sansBold', content.cta.displayUrl, { maxWidth: ctaW, maxLines: 1, maxSize: 24 * u, minSize: 10 }) : null;
    stack.push({ key: 'cta', height: Math.max(bar + (urlFit ? urlFit.height + 12 * u : 0), qrH), gap: 30 * u, drop: 0 });
    render.cta = (
      <Box style={{ width, alignItems: 'center', justifyContent: 'space-between' }}>
        {labelFit && (
          <Box style={{ flexDirection: 'column', width: ctaW }}>
            <Box style={{ width: ctaW, height: bar, background: pal.main, borderRadius: 14 * u, alignItems: 'center', justifyContent: 'space-between', padding: `0 ${30 * u}px` }}>
              <Lines fit={labelFit} type={type} role="display" color={pal.ink} align="left" lineHeight={1.1} />
              <Arrow size={52 * u} color={pal.ink} />
            </Box>
            {urlFit && <Lines fit={urlFit} type={type} role="sansBold" color={WHITE} align="left" style={{ marginTop: 12 * u }} />}
          </Box>
        )}
        {content.qr && qrDataUrl && <QrCard src={qrDataUrl} size={qrSize} caption={content.qr.caption} type={type} ink={pal.ink} radius={14 * u} />}
      </Box>
    );
  }

  if (content.contact.length > 0) {
    const contactFit = fit(type, 'sans', content.contact.join('   ·   '), { maxWidth: width, maxLines: 1, maxSize: 20 * u, minSize: 9 });
    stack.push({ key: 'contact', height: contactFit.height, gap: 20 * u, drop: 8 });
    render.contact = <Lines fit={contactFit} type={type} role="sans" color={alpha(WHITE, 0.66)} align="left" />;
  }
  return { stack, render };
}

function heroMin(content: PosterContent, photo: boolean, u: number): number {
  if (photo) return 460 * u;
  switch (content.hero.kind) {
    case 'cover':
      return content.edition ? 220 * u : 0;
    case 'mosaic':
      return 340 * u;
    case 'names':
      return 260 * u;
    default:
      return 300 * u;
  }
}

function PhotoLayer({ src, width, height, ctx, fade, position }: { src: string; width: number; height: number; ctx: Ctx; fade: 'bottom' | 'right'; position: string }) {
  const { pal, bg } = ctx;
  return (
    <Box style={{ position: 'relative', width, height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={width} height={height} style={{ width, height, objectFit: 'cover', objectPosition: position }} />
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width, height, backgroundImage: `linear-gradient(${fade === 'bottom' ? 180 : 90}deg, ${alpha(pal.main, 0.08)} 0%, transparent 45%, ${alpha(bg, 0.65)} 78%, ${bg} 100%)` }} />
    </Box>
  );
}

// Sin `overflow: hidden` en el lienzo: el PNG ya se corta a su tamaño, y recortar todo el lienzo multiplicaba por cinco el tiempo de dibujo.
export function renderImpacto(input: PosterRenderInput) {
  const { content, format, palette: pal, type, images } = input;
  const { width: W, height: H, orientation } = POSTER_FORMAT_SPECS[format];
  const u = posterUnit(format);
  const bg = '#08080b';
  const ctx: Ctx = { u, type, pal, bg };
  const photo = photoOf(content, images);
  const story = format === 'story';
  const padX = 64 * u;
  const safeTop = (story ? 210 : 56) * u;
  const padBottom = (story ? 210 : 60) * u;
  const position = content.hero.kind === 'portrait' ? 'center 8%' : 'center 30%';
  const background = (
    <>
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(170deg, ${pal.deep} 0%, ${bg} 70%)` }} />
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H, backgroundImage: `radial-gradient(circle at 100% 100%, ${alpha(pal.main, 0.22)} 0%, transparent 45%)` }} />
    </>
  );

  if (orientation === 'landscape') {
    const leftW = W * 0.48;
    const textX = leftW + 60 * u;
    const textW = W - textX - padX;
    const blocks = textBlocks(input, textW, ctx, { bleedWidth: W - leftW, padX: 60 * u, withHero: false });
    const innerH = H - safeTop - padBottom;
    const solution = solveStack(blocks.stack, innerH, 0);
    return (
      <div style={{ display: 'flex', width: W, height: H, position: 'relative', backgroundColor: bg }}>
        {background}
        <Box style={{ position: 'absolute', top: 0, left: 0, width: leftW, height: H, ...(photo ? {} : { backgroundImage: stripes(ctx) }), alignItems: 'center', justifyContent: 'center' }}>
          {photo ? (
            <PhotoLayer src={photo} width={leftW} height={H} ctx={ctx} fade="right" position={position} />
          ) : (
            <Box style={{ position: 'absolute', top: safeTop + 90 * u, left: padX, width: leftW - padX * 2, height: H - safeTop - 90 * u - padBottom }}>
              <Hero content={content} images={images} width={leftW - padX * 2} height={H - safeTop - 90 * u - padBottom} ctx={ctx} />
            </Box>
          )}
        </Box>
        <Box style={{ position: 'absolute', top: safeTop, left: padX, maxWidth: leftW - padX }}>
          <Eyebrow text={content.eyebrow} ctx={ctx} maxWidth={leftW - padX * 2} />
        </Box>
        <Box style={{ position: 'absolute', top: safeTop, left: textX, width: textW, height: innerH, flexDirection: 'column', justifyContent: 'center' }}>
          {blocks.stack
            .filter((block) => solution.kept.has(block.key))
            .map((block, index) => (
              <Box key={block.key} style={{ marginTop: index === 0 ? 0 : block.gap, flexDirection: 'column' }}>
                {blocks.render[block.key]}
              </Box>
            ))}
        </Box>
      </div>
    );
  }

  const contentW = W - padX * 2;
  const blocks = textBlocks(input, contentW, ctx, { bleedWidth: W, padX, withHero: true });
  // La foto (o la pieza central) arranca en el borde superior; el texto se ordena debajo.
  const available = H - padBottom;
  const solution = solveStack(blocks.stack, available - (photo ? 0 : safeTop + 70 * u), Math.max(heroMin(content, Boolean(photo), u), heroCrowdMin(content.hero, u)));
  const heroH = solution.flex;
  const heroTop = photo ? 0 : safeTop + 70 * u;
  const textBlocksKept = blocks.stack.filter((block) => block.key !== 'hero' && solution.kept.has(block.key));
  return (
    <div style={{ display: 'flex', width: W, height: H, position: 'relative', backgroundColor: bg }}>
      {background}
      {!photo && <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: heroTop + heroH, backgroundImage: stripes(ctx) }} />}
      <Box style={{ position: 'absolute', top: heroTop, left: photo ? 0 : padX, width: photo ? W : contentW, height: heroH }}>
        {photo ? <PhotoLayer src={photo} width={W} height={heroH} ctx={ctx} fade="bottom" position={position} /> : <Hero content={content} images={images} width={contentW} height={heroH} ctx={ctx} />}
      </Box>
      <Box style={{ position: 'absolute', top: safeTop, left: padX }}>
        <Eyebrow text={content.eyebrow} ctx={ctx} maxWidth={contentW} />
      </Box>
      <Box style={{ position: 'absolute', top: heroTop + heroH, left: padX, width: contentW, flexDirection: 'column' }}>
        {textBlocksKept.map((block, index) => (
          <Box key={block.key} style={{ marginTop: index === 0 ? block.gap : block.gap, flexDirection: 'column' }}>
            {blocks.render[block.key]}
          </Box>
        ))}
      </Box>
    </div>
  );
}
