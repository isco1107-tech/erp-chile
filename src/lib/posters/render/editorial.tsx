import type { ReactNode } from 'react';
import { POSTER_FORMAT_SPECS, posterUnit } from '../formats';
import { alpha } from '../palettes';
import { initialsOf, type PosterContent } from '../pieces';
import { heroCrowdMin, solveGrid, solveStack, type StackBlock } from '../layout';
import { fitGroups } from '../text-fit';
import { Arrow, Box, ContainedImage, Lines, NameLines, QrCard, SponsorStrip, fit, fontOf, logoBox, photoObjectPosition, qrCardHeight, sponsorStripHeight, upper, reportOmitted, type PosterRenderInput, type PosterTypeKit } from './primitives';

/**
 * Estilo "Editorial": portada de revista. Papel claro teñido del acento,
 * Bodoni de alto contraste, cabecera con filetes, la foto a sangre y el
 * titular debajo, alineado a la izquierda. Sin dorados ni brillos: el
 * contraste lo dan la tipografía y la tinta.
 */

const INK = '#16130f';
const MAX_TILES = 30;

interface Ctx {
  u: number;
  type: PosterTypeKit;
  pal: PosterRenderInput['palette'];
  paper: string;
}

function photoHero(content: PosterContent, images: PosterRenderInput['images']): string | null {
  if (content.hero.kind === 'portrait') return images.portrait;
  if (content.hero.kind === 'cover') return images.background;
  return null;
}

function Tag({ text, ctx, maxWidth }: { text: string; ctx: Ctx; maxWidth: number }) {
  const { u, type, pal } = ctx;
  const tagFit = fit(type, 'sansBold', upper(text), { maxWidth: maxWidth - 40 * u, maxLines: 1, maxSize: 20 * u, minSize: 10, letterSpacingEm: 0.24 });
  return (
    <Box style={{ padding: `${10 * u}px ${20 * u}px`, background: pal.mid }}>
      <Lines fit={tagFit} type={type} role="sansBold" color={ctx.paper} letterSpacingEm={0.24} lineHeight={1.2} />
    </Box>
  );
}

function tagHeight(u: number): number {
  return 20 * u * 1.2 + 20 * u;
}

function Hero({ content, images, width, height, ctx, bleed }: { content: PosterContent; images: PosterRenderInput['images']; width: number; height: number; ctx: Ctx; bleed: boolean }): ReactNode {
  const { u, type, pal } = ctx;
  const hero = content.hero;
  if (height <= 0) return null;
  const photo = photoHero(content, images);

  if (hero.kind === 'cover' || hero.kind === 'portrait') {
    if (photo) {
      const badge = hero.kind === 'portrait' ? hero.badge : null;
      const badgeSize = Math.min(150 * u, height * 0.24);
      return (
        <Box style={{ position: 'relative', width, height }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" width={width} height={height} style={{ width, height, objectFit: 'cover', objectPosition: photoObjectPosition(content.decor.photoPosition, hero.kind === 'portrait' ? 'center 6%' : 'center 30%') }} />
          <Box style={{ position: 'absolute', top: bleed ? 40 * u : 0, left: bleed ? 40 * u : 0 }}>
            <Tag text={content.eyebrow} ctx={ctx} maxWidth={width * 0.8} />
          </Box>
          {badge && (
            <Box style={{ position: 'absolute', bottom: 0, left: bleed ? 40 * u : 0, padding: `${14 * u}px ${24 * u}px ${8 * u}px`, background: ctx.paper, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', ...fontOf(type, 'accent'), fontSize: badgeSize * 0.32, color: pal.mid, lineHeight: 1.6, marginRight: 8 * u }}>N.º</div>
              <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: badgeSize * 0.62, color: INK, lineHeight: 1 }}>{badge}</div>
            </Box>
          )}
        </Box>
      );
    }
    if (hero.kind === 'portrait') {
      return (
        <Box style={{ width, height, background: pal.mid, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', ...fontOf(type, 'display'), fontSize: Math.min(height * 0.5, width * 0.4), color: ctx.paper }}>{hero.monogram}</div>
        </Box>
      );
    }
    // Portada sin foto: el año de la edición como pieza tipográfica (dato real), o un filete si no hay año.
    if (!content.edition || height < 160 * u) return <Box style={{ width, height: 2 * u, background: INK }} />;
    const numeralFit = fit(type, 'numeral', content.edition, { maxWidth: width, maxLines: 1, maxSize: height * 0.9, minSize: 20 });
    return (
      <Box style={{ width, height, alignItems: 'center', justifyContent: 'center', borderTop: `${3 * u}px solid ${INK}`, borderBottom: `${1 * u}px solid ${INK}` }}>
        <Lines fit={numeralFit} type={type} role="numeral" color={alpha(pal.mid, 0.9)} lineHeight={1} />
      </Box>
    );
  }

  if (hero.kind === 'date') {
    const day = Math.min(height * 0.82, width * 0.42);
    const sideW = width - day * 1.25 - 40 * u;
    const monthFit = fit(type, 'display', upper(hero.month), { maxWidth: sideW, maxLines: 1, maxSize: day * 0.3, minSize: 14, letterSpacingEm: 0.04 });
    const weekdayFit = fit(type, 'accent', hero.weekday, { maxWidth: sideW, maxLines: 1, maxSize: day * 0.2, minSize: 14 });
    const timeFit = fit(type, 'sansBold', `${hero.year} · ${upper(hero.time)}`, { maxWidth: sideW, maxLines: 1, maxSize: 26 * u, minSize: 10, letterSpacingEm: 0.18 });
    return (
      <Box style={{ width, height, alignItems: 'center', borderTop: `${3 * u}px solid ${INK}`, borderBottom: `${1 * u}px solid ${INK}` }}>
        <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: day, lineHeight: 1, color: INK, letterSpacing: '-0.03em' }}>{hero.day}</div>
        <Box style={{ width: 2 * u, height: day * 0.7, background: INK, margin: `0 ${32 * u}px` }} />
        <Box style={{ flexDirection: 'column' }}>
          <Lines fit={weekdayFit} type={type} role="accent" color={pal.mid} align="left" lineHeight={1.2} />
          <Lines fit={monthFit} type={type} role="display" color={INK} align="left" letterSpacingEm={0.04} lineHeight={1.05} />
          <Lines fit={timeFit} type={type} role="sansBold" color={INK} align="left" letterSpacingEm={0.18} lineHeight={1.6} />
        </Box>
      </Box>
    );
  }

  if (hero.kind === 'countdown') {
    const numeric = /^\d+$/.test(hero.value);
    const valueFit = fit(type, numeric ? 'numeral' : 'accent', hero.value, { maxWidth: width * 0.62, maxLines: 1, maxSize: height * 0.9, minSize: 30 });
    const sideW = width - valueFit.width - 50 * u;
    const unitFit = hero.unit ? fit(type, 'accent', hero.unit, { maxWidth: sideW, maxLines: 1, maxSize: valueFit.fontSize * 0.36, minSize: 16 }) : null;
    const captionFit = fit(type, 'sansBold', upper(hero.caption), { maxWidth: sideW, maxLines: 2, maxSize: 26 * u, minSize: 10, letterSpacingEm: 0.16, lineHeight: 1.3 });
    return (
      <Box style={{ width, height, alignItems: 'center', borderTop: `${3 * u}px solid ${INK}`, borderBottom: `${1 * u}px solid ${INK}` }}>
        <Lines fit={valueFit} type={type} role={numeric ? 'numeral' : 'accent'} color={pal.mid} lineHeight={1} align="left" />
        <Box style={{ flexDirection: 'column', marginLeft: 40 * u }}>
          {unitFit && <Lines fit={unitFit} type={type} role="accent" color={INK} align="left" lineHeight={1.1} />}
          <Lines fit={captionFit} type={type} role="sansBold" color={INK} align="left" letterSpacingEm={0.16} lineHeight={1.3} style={{ marginTop: 10 * u }} />
        </Box>
      </Box>
    );
  }

  if (hero.kind === 'mosaic') {
    const shown = hero.tiles.length > MAX_TILES ? hero.tiles.slice(0, MAX_TILES - 1) : hero.tiles;
    const extra = hero.total - shown.length;
    const count = shown.length + (extra > 0 ? 1 : 0);
    const gap = 14 * u;
    let grid = solveGrid(count, width, height, { aspect: 1.25, gap, captionHeight: 0 });
    const captionH = Math.max(24 * u, Math.min(grid.tileWidth * 0.3, 70 * u));
    grid = solveGrid(count, width, height, { aspect: 1.25, gap, captionHeight: captionH + 6 * u });
    const tw = grid.tileWidth;
    const th = grid.tileHeight;
    const nameSize = Math.min(captionH * 0.44, 26 * u);
    const numberSize = Math.max(18 * u, Math.min(tw * 0.18, 44 * u));
    const tiles: ReactNode[] = shown.map((tile, index) => {
      const src = images.tiles[index] ?? null;
      const nameFit = fit(type, 'sansBold', upper(tile.title), { maxWidth: tw, maxLines: 1, maxSize: nameSize, minSize: 8, letterSpacingEm: 0.04 });
      const captionFit = tile.caption && captionH >= 44 * u ? fit(type, 'accent', tile.caption, { maxWidth: tw, maxLines: 1, maxSize: nameSize, minSize: 8 }) : null;
      return (
        <Box key={index} style={{ flexDirection: 'column', width: tw }}>
          <Box style={{ position: 'relative', width: tw, height: th, background: pal.mid, alignItems: 'center', justifyContent: 'center' }}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" width={tw} height={th} style={{ width: tw, height: th, objectFit: 'cover', objectPosition: 'center 20%' }} />
            ) : (
              <div style={{ display: 'flex', ...fontOf(type, 'display'), fontSize: tw * 0.32, color: ctx.paper }}>{initialsOf(tile.title)}</div>
            )}
            {tile.badge && (
              <Box style={{ position: 'absolute', top: 0, left: 0, padding: `${4 * u}px ${10 * u}px`, background: ctx.paper }}>
                <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: numberSize, lineHeight: 1.05, color: INK }}>{tile.badge}</div>
              </Box>
            )}
          </Box>
          <Lines fit={nameFit} type={type} role="sansBold" color={INK} align="left" letterSpacingEm={0.04} lineHeight={1.35} style={{ marginTop: 6 * u }} />
          {captionFit && <Lines fit={captionFit} type={type} role="accent" color={pal.mid} align="left" lineHeight={1.15} />}
        </Box>
      );
    });
    if (extra > 0) {
      tiles.push(
        <Box key="extra" style={{ width: tw, height: th, border: `${2 * u}px solid ${INK}`, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: tw * 0.3, color: INK }}>{`+${extra}`}</div>
        </Box>,
      );
    }
    const rows: ReactNode[] = [];
    for (let r = 0; r < grid.rows; r++) {
      rows.push(
        <Box key={r} style={{ gap, marginTop: r === 0 ? 0 : gap }}>
          {tiles.slice(r * grid.cols, (r + 1) * grid.cols)}
        </Box>,
      );
    }
    return <Box style={{ flexDirection: 'column', width, height, justifyContent: 'center' }}>{rows}</Box>;
  }

  // names
  const groupGap = 28 * u;
  const groups = fitGroups(hero.groups, type.measure.display, {
    maxWidth: width,
    maxHeight: height,
    maxSize: (height > 900 * u ? 72 : 60) * u,
    minSize: 14,
    separator: '  /  ',
    lineHeight: 1.25,
    labelHeight: () => 18 * u * 1.4 + 14 * u + groupGap,
  });
  return (
    <Box style={{ flexDirection: 'column', width, height, justifyContent: 'center' }}>
      {groups.groups.map(({ group, lines }, index) => (
        <Box key={index} style={{ flexDirection: 'column', marginTop: index === 0 ? 0 : groupGap }}>
          {group.label && (
            <Box style={{ alignItems: 'center', marginBottom: 14 * u, width }}>
              <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'sansBold'), fontSize: 18 * u, letterSpacing: '0.24em', color: pal.mid, lineHeight: 1.4 }}>{upper(group.label)}</div>
              <Box style={{ flexGrow: 1, height: 1 * u, background: alpha(INK, 0.35), marginLeft: 18 * u }} />
            </Box>
          )}
          <NameLines lines={lines} type={type} role="display" size={groups.fontSize} color={INK} separator="  /  " separatorColor={pal.mid} lineHeight={1.25} align="left" />
        </Box>
      ))}
    </Box>
  );
}

/** Alto máximo del titular: una quinta parte del afiche (un tercio en horizontal, donde va en su columna). */
function headlineCap(format: PosterRenderInput['format']): number {
  const spec = POSTER_FORMAT_SPECS[format];
  return spec.height * (spec.orientation === 'landscape' ? 0.32 : 0.2);
}

interface Blocks {
  stack: StackBlock[];
  render: Record<string, ReactNode>;
}

function brandWithoutYear(content: PosterContent): string {
  return content.brand.replace(/\s(?:19|20)\d{2}$/, '');
}

/** Cabecera de revista: logo propio (si lo hay), nombre del certamen y edición, sobre filetes. */
function Masthead({ content, width, ctx, logo }: { content: PosterContent; width: number; ctx: Ctx; logo: string | null }) {
  const { u, type } = ctx;
  const edition = /\s((?:19|20)\d{2})$/.exec(content.brand)?.[1];
  const right = edition ? `EDICIÓN ${edition}` : null;
  const box = logo ? logoBox(logo, width * 0.4, MASTHEAD_LOGO_H * u) : null;
  const rightFit = right ? fit(type, 'sansBold', right, { maxWidth: width * 0.3, maxLines: 1, maxSize: 18 * u, minSize: 9, letterSpacingEm: 0.24 }) : null;
  const leftFit = fit(type, 'sansBold', upper(brandWithoutYear(content)), {
    maxWidth: width - (rightFit ? rightFit.width + 40 * u : 0) - (box ? box.width + 22 * u : 0),
    maxLines: 1,
    maxSize: 22 * u,
    minSize: 10,
    letterSpacingEm: 0.28,
  });
  return (
    <Box style={{ flexDirection: 'column', width }}>
      <Box style={{ width, height: mastheadRowHeight(u, Boolean(logo)), justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Box style={{ alignItems: 'flex-end' }}>
          {box && logo && (
            <Box style={{ marginRight: 22 * u }}>
              <ContainedImage src={logo} width={box.width} height={box.height} />
            </Box>
          )}
          <Lines fit={leftFit} type={type} role="sansBold" color={INK} align="left" letterSpacingEm={0.28} lineHeight={1.3} />
        </Box>
        {rightFit && <Lines fit={rightFit} type={type} role="sansBold" color={INK} align="right" letterSpacingEm={0.24} lineHeight={1.3} />}
      </Box>
      <Box style={{ width, height: 3 * u, background: INK, marginTop: 12 * u }} />
      <Box style={{ width, height: 1 * u, background: INK, marginTop: 5 * u }} />
    </Box>
  );
}

const MASTHEAD_LOGO_H = 64;

function mastheadRowHeight(u: number, withLogo: boolean): number {
  return withLogo ? MASTHEAD_LOGO_H * u : 22 * u * 1.3;
}

function mastheadHeight(u: number, withLogo: boolean): number {
  return mastheadRowHeight(u, withLogo) + 12 * u + 3 * u + 5 * u + 1 * u;
}

function textBlocks(input: PosterRenderInput, width: number, ctx: Ctx, options: { photoHero: boolean; withHeroSlot: boolean }): Blocks {
  const { content, format, qrDataUrl } = input;
  const { u, type, pal } = ctx;
  const story = format === 'story';
  const square = format === 'square';
  const stack: StackBlock[] = [];
  const render: Record<string, ReactNode> = {};

  if (!options.photoHero) {
    stack.push({ key: 'tag', height: tagHeight(u), gap: 0, drop: 0 });
    render.tag = <Tag text={content.eyebrow} ctx={ctx} maxWidth={width} />;
  }
  if (options.withHeroSlot) stack.push({ key: 'hero', height: 0, gap: options.photoHero ? 0 : 30 * u, drop: 0 });

  if (content.kicker) {
    const kickerFit = fit(type, 'accent', content.kicker, { maxWidth: width, maxLines: 1, maxSize: (square ? 34 : 44) * u, minSize: 14 });
    stack.push({ key: 'kicker', height: kickerFit.height, gap: 30 * u, drop: 2 });
    render.kicker = <Lines fit={kickerFit} type={type} role="accent" color={pal.mid} align="left" />;
  }

  const person = content.piece === 'candidata' || content.piece === 'resultados';
  const heavy = content.hero.kind === 'mosaic' || content.hero.kind === 'names';
  const headlineFit = fit(type, 'display', content.headline, {
    maxWidth: width,
    // Tope de alto: un titular largo se reparte en líneas a un tamaño sensato en vez de comerse el afiche.
    maxHeight: headlineCap(input.format),
    maxLines: person ? 2 : 3,
    maxSize: (story ? 210 : square ? 128 : 180) * u * (person ? 0.72 : heavy ? 0.66 : 1) * content.decor.titleScale,
    minSize: 36,
    lineHeight: 0.98,
    letterSpacingEm: -0.01,
  });
  stack.push({ key: 'headline', height: headlineFit.height, gap: content.kicker ? 6 * u : 28 * u, drop: 0 });
  render.headline = <Lines fit={headlineFit} type={type} role="display" color={INK} align="left" lineHeight={0.98} letterSpacingEm={-0.01} />;

  if (content.subline) {
    const sublineFit = fit(type, 'sans', content.subline, { maxWidth: width * 0.92, maxLines: 2, maxSize: (square ? 24 : 30) * u, minSize: 12, lineHeight: 1.3 });
    stack.push({ key: 'subline', height: sublineFit.height, gap: 18 * u, drop: 5 });
    render.subline = <Lines fit={sublineFit} type={type} role="sans" color={alpha(INK, 0.78)} align="left" lineHeight={1.3} />;
  }

  if (content.facts.length > 0) {
    const facts = content.facts.slice(0, 4);
    const colGap = 26 * u;
    const colW = (width - colGap * (facts.length - 1)) / facts.length;
    const labelSize = Math.min(...facts.map((f) => fit(type, 'sansBold', upper(f.label), { maxWidth: colW, maxLines: 1, maxSize: 16 * u, minSize: 9, letterSpacingEm: 0.2 }).fontSize));
    const valueSize = Math.min(...facts.map((f) => fit(type, 'display', f.value, { maxWidth: colW, maxLines: 2, maxSize: (square ? 30 : 36) * u, minSize: 11, lineHeight: 1.12 }).fontSize));
    const valueFits = facts.map((f) => fit(type, 'display', f.value, { maxWidth: colW, maxLines: 2, maxSize: valueSize, minSize: 8, lineHeight: 1.12 }));
    const valueH = Math.max(...valueFits.map((f) => f.height));
    stack.push({ key: 'facts', height: 2 * u + 12 * u + labelSize * 1.4 + 6 * u + valueH, gap: 30 * u, drop: 3 });
    render.facts = (
      <Box style={{ width }}>
        {facts.map((f, index) => (
          <Box key={index} style={{ flexDirection: 'column', width: colW, marginLeft: index === 0 ? 0 : colGap, borderTop: `${2 * u}px solid ${INK}`, paddingTop: 12 * u }}>
            <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'sansBold'), fontSize: labelSize, letterSpacing: '0.2em', color: pal.mid, lineHeight: 1.4, marginBottom: 6 * u }}>{upper(f.label)}</div>
            <Lines fit={valueFits[index]!} type={type} role="display" color={INK} align="left" lineHeight={1.12} />
          </Box>
        ))}
      </Box>
    );
  }

  if (content.list && content.list.items.length > 0) {
    const items = content.list.items.slice(0, 4);
    const itemSize = Math.min(...items.map((item) => fit(type, 'sans', item, { maxWidth: width - 70 * u, maxLines: 1, maxSize: 25 * u, minSize: 11 }).fontSize));
    const rowH = itemSize * 1.6;
    stack.push({ key: 'list', height: rowH * items.length, gap: 26 * u, drop: 6 });
    render.list = (
      <Box style={{ flexDirection: 'column', width }}>
        {items.map((item, index) => (
          <Box key={index} style={{ alignItems: 'center', height: rowH, width, ...(index === items.length - 1 ? { borderBottom: `${1 * u}px solid ${alpha(INK, 0.25)}` } : {}), borderTop: `${1 * u}px solid ${alpha(INK, 0.25)}` }}>
            {content.list!.marker === 'check' && <div style={{ display: 'flex', width: 56 * u, ...fontOf(type, 'accent'), fontSize: itemSize * 1.1, color: pal.mid }}>{String(index + 1).padStart(2, '0')}</div>}
            <div style={{ display: 'flex', whiteSpace: 'pre', ...fontOf(type, 'sans'), fontSize: itemSize, color: INK }}>{item}</div>
          </Box>
        ))}
      </Box>
    );
  }

  if (content.note) {
    const noteFit = fit(type, 'accent', content.note, { maxWidth: width - 30 * u, maxLines: 3, maxSize: (square ? 30 : 36) * u, minSize: 13, lineHeight: 1.2 });
    stack.push({ key: 'note', height: noteFit.height, gap: 24 * u, drop: 1 });
    render.note = (
      <Box style={{ borderLeft: `${5 * u}px solid ${pal.mid}`, paddingLeft: 22 * u }}>
        <Lines fit={noteFit} type={type} role="accent" color={INK} align="left" lineHeight={1.2} />
      </Box>
    );
  }

  if (content.cta || (content.qr && qrDataUrl)) {
    const qrSize = qrDataUrl ? (story ? 180 : format === 'print' ? 200 : square ? 130 : 160) * u : 0;
    const qrH = qrDataUrl ? qrCardHeight(qrSize) + 4 * u : 0;
    const ctaW = qrDataUrl ? width - qrSize * 1.18 - 30 * u : width;
    const labelFit = content.cta ? fit(type, 'sansBold', upper(content.cta.label), { maxWidth: ctaW - 140 * u, maxLines: 1, maxSize: (story ? 30 : 26) * u, minSize: 11, letterSpacingEm: 0.16 }) : null;
    const bar = labelFit ? labelFit.fontSize * 1.2 + 48 * u : 0;
    const urlFit = content.cta?.displayUrl ? fit(type, 'sans', content.cta.displayUrl, { maxWidth: ctaW, maxLines: 1, maxSize: 22 * u, minSize: 10 }) : null;
    stack.push({ key: 'cta', height: Math.max(bar + (urlFit ? urlFit.height + 12 * u : 0), qrH), gap: 30 * u, drop: 0 });
    render.cta = (
      <Box style={{ width, alignItems: 'center', justifyContent: 'space-between' }}>
        {labelFit && (
          <Box style={{ flexDirection: 'column', width: ctaW }}>
            <Box style={{ width: ctaW, height: bar, background: INK, alignItems: 'center', justifyContent: 'space-between', padding: `0 ${34 * u}px` }}>
              <Lines fit={labelFit} type={type} role="sansBold" color={ctx.paper} align="left" letterSpacingEm={0.16} lineHeight={1.2} />
              <Arrow size={44 * u} color={ctx.paper} />
            </Box>
            {urlFit && <Lines fit={urlFit} type={type} role="sans" color={alpha(INK, 0.75)} align="left" style={{ marginTop: 12 * u }} />}
          </Box>
        )}
        {content.qr && qrDataUrl && (
          <Box style={{ border: `${2 * u}px solid ${INK}` }}>
            <QrCard src={qrDataUrl} size={qrSize} caption={content.qr.caption} type={type} ink={INK} radius={0} />
          </Box>
        )}
      </Box>
    );
  }

  if (input.images.sponsorLogos.length > 0) {
    stack.push({ key: 'sponsors', height: sponsorStripHeight(input.images.sponsorLogos.length, width, u), gap: 26 * u, drop: 1 });
    render.sponsors = <SponsorStrip logos={input.images.sponsorLogos} width={width} u={u} type={type} label="AUSPICIAN" labelColor={pal.mid} panel="#ffffff" radius={0} />;
  }

  if (content.contact.length > 0) {
    const contactFit = fit(type, 'sans', content.contact.join('   ·   '), { maxWidth: width, maxLines: 1, maxSize: 19 * u, minSize: 9 });
    stack.push({ key: 'contact', height: contactFit.height + 12 * u, gap: 22 * u, drop: 8 });
    render.contact = (
      <Box style={{ width, borderTop: `${1 * u}px solid ${alpha(INK, 0.3)}`, paddingTop: 12 * u }}>
        <Lines fit={contactFit} type={type} role="sans" color={alpha(INK, 0.68)} align="left" />
      </Box>
    );
  }
  return { stack, render };
}

function heroMin(content: PosterContent, photo: boolean, u: number): number {
  if (photo) return 420 * u;
  switch (content.hero.kind) {
    case 'cover':
      return content.edition ? 200 * u : 0;
    case 'mosaic':
      return 320 * u;
    case 'names':
      return 240 * u;
    default:
      return 280 * u;
  }
}

export function renderEditorial(input: PosterRenderInput) {
  const { content, format, palette: pal, type, images } = input;
  const { width: W, height: H, orientation } = POSTER_FORMAT_SPECS[format];
  const u = posterUnit(format);
  const ctx: Ctx = { u, type, pal, paper: pal.paper };
  const photo = photoHero(content, images);
  const story = format === 'story';
  const padX = 64 * u;
  // En la historia, Instagram tapa arriba (perfil) y abajo (responder): ahí no va nada importante.
  const padTop = (story ? 210 : 56) * u;
  const padBottom = (story ? 210 : 56) * u;
  const background = (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H, backgroundColor: pal.paper, backgroundImage: `radial-gradient(circle at 30% 0%, #ffffff 0%, ${pal.paper} 55%)` }} />
  );

  if (orientation === 'landscape') {
    const leftW = W * 0.5 - padX - 30 * u;
    const rightX = W * 0.5 + 10 * u;
    const rightW = W - rightX - (photo ? 0 : padX);
    const masthead = mastheadHeight(u, Boolean(images.logo));
    const blocks = textBlocks(input, leftW, ctx, { photoHero: Boolean(photo), withHeroSlot: false });
    const innerH = H - padTop - padBottom - masthead - 30 * u;
    const solution = solveStack(blocks.stack, innerH, 0);
    reportOmitted(input.report, blocks.stack, solution.kept);
    return (
      <div style={{ display: 'flex', width: W, height: H, position: 'relative', backgroundColor: pal.paper }}>
        {background}
        <Box style={{ position: 'absolute', top: padTop, left: padX, width: leftW, flexDirection: 'column' }}>
          <Masthead content={content} width={leftW} ctx={ctx} logo={images.logo} />
        </Box>
        <Box style={{ position: 'absolute', top: padTop + masthead + 30 * u, left: padX, width: leftW, height: innerH, flexDirection: 'column', justifyContent: 'center' }}>
          {blocks.stack
            .filter((block) => solution.kept.has(block.key))
            .map((block, index) => (
              <Box key={block.key} style={{ marginTop: index === 0 ? 0 : block.gap, flexDirection: 'column' }}>
                {blocks.render[block.key]}
              </Box>
            ))}
        </Box>
        <Box style={{ position: 'absolute', top: photo ? 0 : padTop, left: rightX, width: rightW, height: photo ? H : H - padTop - padBottom, alignItems: 'center' }}>
          <Hero content={content} images={images} width={rightW} height={photo ? H : H - padTop - padBottom} ctx={ctx} bleed={Boolean(photo)} />
        </Box>
      </div>
    );
  }

  const contentW = W - padX * 2;
  const masthead = mastheadHeight(u, Boolean(images.logo));
  const blocks = textBlocks(input, contentW, ctx, { photoHero: Boolean(photo), withHeroSlot: true });
  const innerH = H - padTop - padBottom - masthead - 26 * u;
  const solution = solveStack(blocks.stack, innerH, Math.max(heroMin(content, Boolean(photo), u), heroCrowdMin(content.hero, u)));
  reportOmitted(input.report, blocks.stack, solution.kept);
  return (
    <div style={{ display: 'flex', width: W, height: H, position: 'relative', backgroundColor: pal.paper }}>
      {background}
      <Box style={{ position: 'absolute', top: padTop, left: padX, width: contentW, flexDirection: 'column' }}>
        <Masthead content={content} width={contentW} ctx={ctx} logo={images.logo} />
        <Box style={{ flexDirection: 'column', marginTop: 26 * u, width: contentW, height: innerH }}>
          {blocks.stack
            .filter((block) => solution.kept.has(block.key))
            .map((block, index) =>
              block.key === 'hero' ? (
                <Box key="hero" style={{ marginTop: index === 0 ? 0 : block.gap, width: contentW, height: solution.flex }}>
                  <Hero content={content} images={images} width={contentW} height={solution.flex} ctx={ctx} bleed={false} />
                </Box>
              ) : (
                <Box key={block.key} style={{ marginTop: index === 0 ? 0 : block.gap, flexDirection: 'column' }}>
                  {blocks.render[block.key]}
                </Box>
              ),
            )}
        </Box>
      </Box>
    </div>
  );
}
