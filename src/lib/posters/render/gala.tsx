import type { ReactNode } from 'react';
import { POSTER_FORMAT_SPECS, posterUnit } from '../formats';
import { NIGHT, alpha } from '../palettes';
import { initialsOf, type PosterContent, type PosterHero } from '../pieces';
import { heroCrowdMin, seededRandom, solveGrid, solveStack, type StackBlock } from '../layout';
import { fitGroups } from '../text-fit';
import { Box, Check, Crown, Diamond, Lines, NameLines, QrCard, Sparkle, fit, fontOf, qrCardHeight, upper, type PosterRenderInput, type PosterTypeKit } from './primitives';

/**
 * Estilo "Gala": noche azul del micrositio, dorados en degradado, Italiana
 * para el titular y Cormorant en cursiva para los acentos. Las fotos van en
 * ventanas con forma de arco (nunca bajo el texto: no se tapa una cara).
 */

const MAX_TILES = 30;

interface Ctx {
  u: number;
  type: PosterTypeKit;
  pal: PosterRenderInput['palette'];
  gold: string;
  text: string;
  muted: string;
}

function goldGradient(pal: PosterRenderInput['palette'], angle = 180): string {
  return `linear-gradient(${angle}deg, ${pal.light} 0%, #fff7e6 38%, ${pal.main} 72%, ${pal.light} 100%)`;
}

// ---------------------------------------------------------------------------
// Piezas centrales
// ---------------------------------------------------------------------------

function archRadius(width: number, u: number) {
  return { borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2, borderBottomLeftRadius: 18 * u, borderBottomRightRadius: 18 * u };
}

function ArchPhoto({ src, monogram, width, height, ctx, badge }: { src: string | null; monogram: string; width: number; height: number; ctx: Ctx; badge: string | null }) {
  const { u, pal, type } = ctx;
  const ring = 14 * u;
  const badgeSize = Math.round(Math.min(110 * u, width * 0.26));
  const badgeFit = badge ? fit(type, 'numeral', badge, { maxWidth: badgeSize * 0.7, maxLines: 1, maxSize: badgeSize * 0.56, minSize: 10 }) : null;
  return (
    <div style={{ display: 'flex', position: 'relative', width: width + ring * 2, height: height + ring + (badge ? badgeSize / 2 : 0), justifyContent: 'center' }}>
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: width + ring * 2, height: height + ring, border: `${1.5 * u}px solid ${alpha(pal.light, 0.55)}`, ...archRadius(width + ring * 2, u) }} />
      <div style={{ display: 'flex', position: 'absolute', top: ring, left: ring, width, height, ...archRadius(width, u), background: `radial-gradient(circle at 50% 30%, ${alpha(pal.main, 0.45)}, ${NIGHT.bottom} 75%)`, alignItems: 'center', justifyContent: 'center' }}>
        {src ? (
          // El arco va en la propia foto: recortar la caja con `overflow: hidden` es mucho más lento de dibujar.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={width} height={height} style={{ width, height, objectFit: 'cover', objectPosition: 'center 22%', ...archRadius(width, u) }} />
        ) : (
          <div style={{ display: 'flex', ...fontOf(type, 'display'), fontSize: width * 0.36, color: pal.light }}>{monogram}</div>
        )}
      </div>
      {badge && badgeFit && (
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: (width + ring * 2 - badgeSize) / 2, width: badgeSize, height: badgeSize, borderRadius: badgeSize, background: goldGradient(pal, 135), border: `${3 * u}px solid ${NIGHT.mid}`, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: badgeFit.fontSize, lineHeight: 1, color: NIGHT.bottom }}>{badge}</div>
        </div>
      )}
    </div>
  );
}

function heroMinHeight(hero: PosterHero, hasPhoto: boolean, u: number): number {
  switch (hero.kind) {
    case 'cover':
      return hasPhoto ? 260 * u : 0;
    case 'portrait':
      return 380 * u;
    case 'mosaic':
      return 300 * u;
    case 'names':
      return 220 * u;
    default:
      return 300 * u;
  }
}

function Hero({ content, images, width, height, ctx }: { content: PosterContent; images: PosterRenderInput['images']; width: number; height: number; ctx: Ctx }): ReactNode {
  const { u, type, pal } = ctx;
  const hero = content.hero;
  if (height <= 0) return null;

  if (hero.kind === 'cover') {
    if (!images.background || height < 200 * u) return null;
    const archH = height - 14 * u;
    const archW = Math.min(width * 0.86, archH * 0.82);
    return <ArchPhoto src={images.background} monogram="" width={archW} height={archH} ctx={ctx} badge={null} />;
  }

  if (hero.kind === 'portrait') {
    const badgeSpace = hero.badge ? Math.min(110 * u, width * 0.26) / 2 : 0;
    const archH = height - 14 * u - badgeSpace;
    const archW = Math.min(width * 0.86, archH * 0.78);
    return <ArchPhoto src={images.portrait} monogram={hero.monogram} width={archW} height={archH} ctx={ctx} badge={hero.badge} />;
  }

  if (hero.kind === 'date') {
    const small = Math.min(30 * u, height * 0.07);
    const day = Math.min(width * 0.5, (height - small * 5.5) / 1.42, 380 * u);
    const monthFit = fit(type, 'display', upper(hero.month), { maxWidth: width * 0.9, maxLines: 1, maxSize: day * 0.3, minSize: 12, letterSpacingEm: 0.22 });
    return (
      <Box style={{ flexDirection: 'column', alignItems: 'center', width, height, justifyContent: 'center' }}>
        <div style={{ display: 'flex', ...fontOf(type, 'sansBold'), fontSize: small, letterSpacing: '0.42em', color: pal.light, lineHeight: 1.3 }}>{upper(hero.weekday)}</div>
        <Box style={{ alignItems: 'center', marginTop: small * 0.4 }}>
          <Box style={{ width: 90 * u, height: 1.5 * u, background: alpha(pal.light, 0.6), marginRight: 34 * u }} />
          <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: day, lineHeight: 1, color: 'transparent', backgroundImage: goldGradient(pal), backgroundClip: 'text' }}>{hero.day}</div>
          <Box style={{ width: 90 * u, height: 1.5 * u, background: alpha(pal.light, 0.6), marginLeft: 34 * u }} />
        </Box>
        <Lines fit={monthFit} type={type} role="display" color={pal.light} letterSpacingEm={0.22} lineHeight={1.1} />
        <Box style={{ marginTop: small * 0.9, padding: `${small * 0.35}px ${small * 1.1}px`, borderRadius: 999, border: `${1.5 * u}px solid ${alpha(pal.light, 0.6)}`, ...fontOf(type, 'sansBold'), fontSize: small, letterSpacing: '0.2em', color: ctx.text }}>
          {`${hero.year} · ${upper(hero.time)}`}
        </Box>
      </Box>
    );
  }

  if (hero.kind === 'countdown') {
    const small = Math.min(30 * u, height * 0.07);
    const numeric = /^\d+$/.test(hero.value);
    const valueFit = fit(type, numeric ? 'numeral' : 'display', hero.value, { maxWidth: width * 0.92, maxLines: 1, maxSize: Math.min(height * 0.55, 460 * u), minSize: 40 });
    const unitFit = hero.unit ? fit(type, 'display', upper(hero.unit), { maxWidth: width * 0.8, maxLines: 1, maxSize: valueFit.fontSize * 0.26, minSize: 14, letterSpacingEm: 0.3 }) : null;
    const captionFit = fit(type, 'accent', hero.caption, { maxWidth: width * 0.9, maxLines: 1, maxSize: 48 * u, minSize: 14 });
    return (
      <Box style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width, height }}>
        {hero.unit && <div style={{ display: 'flex', ...fontOf(type, 'sansBold'), fontSize: small, letterSpacing: '0.5em', color: pal.light, lineHeight: 1.3 }}>FALTAN</div>}
        <Lines fit={valueFit} type={type} role={numeric ? 'numeral' : 'display'} color={pal.light} gradient={goldGradient(pal)} lineHeight={1} />
        {unitFit && <Lines fit={unitFit} type={type} role="display" color={pal.light} letterSpacingEm={0.3} lineHeight={1.15} />}
        <Lines fit={captionFit} type={type} role="accent" color={ctx.text} lineHeight={1.3} style={{ marginTop: small * 0.5 }} />
      </Box>
    );
  }

  if (hero.kind === 'mosaic') {
    const shown = hero.tiles.length > MAX_TILES ? hero.tiles.slice(0, MAX_TILES - 1) : hero.tiles;
    const extra = hero.total - shown.length;
    const count = shown.length + (extra > 0 ? 1 : 0);
    const gap = 18 * u;
    let grid = solveGrid(count, width, height, { aspect: 1.3, gap, captionHeight: 0 });
    const captionH = Math.max(26 * u, Math.min(grid.tileWidth * 0.3, 70 * u));
    grid = solveGrid(count, width, height, { aspect: 1.3, gap, captionHeight: captionH + 8 * u });
    const tw = grid.tileWidth;
    const th = grid.tileHeight;
    const nameSize = Math.min(captionH * 0.46, 28 * u);
    const badgeSize = Math.max(28 * u, Math.min(tw * 0.26, 64 * u));
    const tiles: ReactNode[] = shown.map((tile, index) => {
      const src = images.tiles[hero.tiles.indexOf(tile)] ?? null;
      const nameFit = fit(type, 'sansBold', upper(tile.title), { maxWidth: tw, maxLines: 1, maxSize: nameSize, minSize: 8, letterSpacingEm: 0.06 });
      const captionFit = tile.caption && captionH >= 44 * u ? fit(type, 'accent', tile.caption, { maxWidth: tw, maxLines: 1, maxSize: nameSize * 0.95, minSize: 8 }) : null;
      return (
        <Box key={index} style={{ flexDirection: 'column', alignItems: 'center', width: tw, position: 'relative' }}>
          <div style={{ display: 'flex', width: tw, height: th, ...archRadius(tw, u * 0.6), border: `${1.5 * u}px solid ${alpha(pal.light, 0.5)}`, background: NIGHT.mid, alignItems: 'center', justifyContent: 'center' }}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" width={tw - 3 * u} height={th - 3 * u} style={{ width: tw - 3 * u, height: th - 3 * u, objectFit: 'cover', objectPosition: 'center 20%', ...archRadius(tw - 3 * u, u * 0.6) }} />
            ) : (
              <div style={{ display: 'flex', ...fontOf(type, 'display'), fontSize: tw * 0.3, color: pal.light }}>{initialsOf(tile.title)}</div>
            )}
          </div>
          {tile.badge && (
            <div style={{ display: 'flex', position: 'absolute', top: th - badgeSize * 0.7, right: -badgeSize * 0.12, width: badgeSize, height: badgeSize, borderRadius: badgeSize, background: goldGradient(pal, 135), alignItems: 'center', justifyContent: 'center', border: `${2 * u}px solid ${NIGHT.mid}` }}>
              <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: badgeSize * 0.52, lineHeight: 1, color: NIGHT.bottom }}>{tile.badge}</div>
            </div>
          )}
          <Lines fit={nameFit} type={type} role="sansBold" color={ctx.text} letterSpacingEm={0.06} lineHeight={1.3} style={{ marginTop: 8 * u }} />
          {captionFit && <Lines fit={captionFit} type={type} role="accent" color={pal.light} lineHeight={1.2} />}
        </Box>
      );
    });
    if (extra > 0) {
      tiles.push(
        <Box key="extra" style={{ width: tw, height: th, ...archRadius(tw, u * 0.6), border: `${1.5 * u}px solid ${alpha(pal.light, 0.5)}`, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', ...fontOf(type, 'numeral'), fontSize: tw * 0.3, color: pal.light }}>{`+${extra}`}</div>
        </Box>,
      );
    }
    const rows: ReactNode[] = [];
    for (let r = 0; r < grid.rows; r++) {
      rows.push(
        <Box key={r} style={{ gap, justifyContent: 'center', marginTop: r === 0 ? 0 : gap }}>
          {tiles.slice(r * grid.cols, (r + 1) * grid.cols)}
        </Box>,
      );
    }
    return <Box style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width, height }}>{rows}</Box>;
  }

  // names
  const labelScale = 0.42;
  const groupGap = 30 * u;
  const groups = fitGroups(hero.groups, type.measure.accent, {
    maxWidth: width,
    maxHeight: height,
    maxSize: (height > 900 * u ? 76 : 64) * u,
    minSize: 16,
    lineHeight: 1.32,
    labelHeight: (size) => Math.max(16 * u, size * labelScale) * 1.4 + 12 * u + groupGap,
  });
  const labelSize = Math.max(16 * u, groups.fontSize * labelScale);
  return (
    <Box style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width, height }}>
      {groups.groups.map(({ group, lines }, index) => (
        <Box key={index} style={{ flexDirection: 'column', alignItems: 'center', marginTop: index === 0 ? 0 : groupGap }}>
          {group.label && (
            <Box style={{ alignItems: 'center', marginBottom: 12 * u }}>
              <Diamond size={7 * u} color={pal.light} />
              <div style={{ display: 'flex', ...fontOf(type, 'sansBold'), fontSize: labelSize, letterSpacing: '0.32em', color: pal.light, lineHeight: 1.4, margin: `0 ${16 * u}px` }}>{upper(group.label)}</div>
              <Diamond size={7 * u} color={pal.light} />
            </Box>
          )}
          <NameLines lines={lines} type={type} role="accent" size={groups.fontSize} color={ctx.text} separator="  ·  " separatorColor={pal.light} lineHeight={1.32} />
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Bloques de texto
// ---------------------------------------------------------------------------

interface Blocks {
  stack: StackBlock[];
  render: Record<string, ReactNode>;
}

function textBlocks(input: PosterRenderInput, width: number, ctx: Ctx, landscape: boolean): Blocks {
  const { content, format, qrDataUrl } = input;
  const { u, type, pal } = ctx;
  const story = format === 'story';
  const square = format === 'square';
  const stack: StackBlock[] = [];
  const render: Record<string, ReactNode> = {};

  // Encabezado: corona + rótulo de la pieza.
  const eyebrowFit = fit(type, 'sansBold', upper(content.eyebrow), { maxWidth: width - 80 * u, maxLines: 1, maxSize: 22 * u, minSize: 11, letterSpacingEm: 0.3 });
  const crownW = (square ? 52 : 66) * u;
  const pillH = eyebrowFit.fontSize * 1.25 + 24 * u;
  stack.push({ key: 'top', height: crownW * 0.62 + 16 * u + pillH, gap: 0, drop: 0 });
  render.top = (
    <Box style={{ flexDirection: 'column', alignItems: landscape ? 'flex-start' : 'center' }}>
      <Crown width={crownW} color={pal.light} />
      <Box style={{ marginTop: 16 * u, padding: `${12 * u}px ${30 * u}px`, borderRadius: 999, border: `${1.5 * u}px solid ${alpha(pal.light, 0.75)}`, background: alpha(pal.light, 0.08) }}>
        <Lines fit={eyebrowFit} type={type} role="sansBold" color={pal.light} letterSpacingEm={0.3} lineHeight={1.25} />
      </Box>
    </Box>
  );

  if (content.kicker) {
    const kickerFit = fit(type, 'sansBold', upper(content.kicker), { maxWidth: width - (landscape ? 0 : 200 * u), maxLines: 1, maxSize: 30 * u, minSize: 12, letterSpacingEm: 0.3 });
    stack.push({ key: 'kicker', height: kickerFit.height, gap: (square ? 30 : 44) * u, drop: 1 });
    render.kicker = (
      <Box style={{ alignItems: 'center' }}>
        {!landscape && <Box style={{ width: 70 * u, height: 1.5 * u, background: alpha(pal.light, 0.7), marginRight: 26 * u }} />}
        <Lines fit={kickerFit} type={type} role="sansBold" color={ctx.text} letterSpacingEm={0.3} />
        {!landscape && <Box style={{ width: 70 * u, height: 1.5 * u, background: alpha(pal.light, 0.7), marginLeft: 26 * u }} />}
      </Box>
    );
  }

  const personHeadline = content.piece === 'candidata' || content.piece === 'resultados';
  const headlineFit = fit(type, 'display', content.headline, {
    maxWidth: width,
    maxLines: personHeadline ? 2 : 3,
    maxSize: (story ? 230 : square ? 150 : landscape ? 190 : 200) * u * (personHeadline ? 0.62 : content.hero.kind === 'mosaic' || content.hero.kind === 'names' ? 0.72 : 1),
    minSize: 40,
    lineHeight: 1,
  });
  stack.push({ key: 'headline', height: headlineFit.height, gap: (content.kicker ? 14 : square ? 30 : 44) * u, drop: 0 });
  render.headline = (
    <Lines fit={headlineFit} type={type} role="display" color={pal.light} gradient={goldGradient(pal)} lineHeight={1} align={landscape ? 'left' : 'center'} />
  );

  if (content.edition) {
    const size = 26 * u;
    stack.push({ key: 'edition', height: size * 1.3, gap: 16 * u, drop: 4 });
    render.edition = (
      <Box style={{ alignItems: 'center' }}>
        <Diamond size={8 * u} color={pal.light} />
        <div style={{ display: 'flex', ...fontOf(type, 'sansBold'), fontSize: size, letterSpacing: '0.6em', color: pal.light, lineHeight: 1.3, margin: `0 ${12 * u}px 0 ${26 * u}px` }}>{content.edition}</div>
        <Diamond size={8 * u} color={pal.light} />
      </Box>
    );
  }

  if (content.subline) {
    const sublineFit = fit(type, 'accent', content.subline, { maxWidth: width * 0.92, maxLines: 2, maxSize: (square ? 36 : 44) * u, minSize: 16, lineHeight: 1.2 });
    stack.push({ key: 'subline', height: sublineFit.height, gap: 24 * u, drop: 5 });
    render.subline = <Lines fit={sublineFit} type={type} role="accent" color={ctx.text} lineHeight={1.2} align={landscape ? 'left' : 'center'} />;
  }

  stack.push({ key: 'hero', height: 0, gap: (square ? 24 : 36) * u, drop: 0 });

  if (content.list && content.list.items.length > 0) {
    const items = content.list.items.slice(0, 4);
    const itemSize = Math.min(...items.map((item) => fit(type, 'sans', item, { maxWidth: width * 0.8 - 44 * u, maxLines: 1, maxSize: 27 * u, minSize: 12 }).fontSize));
    const titleSize = 18 * u;
    const rowH = itemSize * 1.55;
    stack.push({ key: 'list', height: titleSize * 1.4 + 12 * u + rowH * items.length, gap: 30 * u, drop: 6 });
    render.list = (
      <Box style={{ flexDirection: 'column', alignItems: landscape ? 'flex-start' : 'center' }}>
        <div style={{ display: 'flex', ...fontOf(type, 'sansBold'), fontSize: titleSize, letterSpacing: '0.34em', color: pal.light, lineHeight: 1.4, marginBottom: 12 * u }}>{upper(content.list.title)}</div>
        <Box style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          {items.map((item, index) => (
            <Box key={index} style={{ alignItems: 'center', height: rowH }}>
              {content.list!.marker === 'check' ? <Check size={itemSize * 0.95} color={pal.light} /> : <Diamond size={itemSize * 0.36} color={pal.light} />}
              <div style={{ display: 'flex', whiteSpace: 'nowrap', ...fontOf(type, 'sans'), fontSize: itemSize, color: ctx.text, marginLeft: 16 * u }}>{item}</div>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  if (content.facts.length > 0) {
    const facts = content.facts.slice(0, 4);
    const colGap = 22 * u;
    const colW = (width - colGap * (facts.length - 1)) / facts.length;
    // En horizontal las columnas llevan sangría tras la línea: el texto se ajusta al ancho que queda.
    const textW = colW - (landscape ? 22 * u : 4 * u);
    const labelFits = facts.map((f) => fit(type, 'sansBold', upper(f.label), { maxWidth: textW, maxLines: 1, maxSize: 18 * u, minSize: 9, letterSpacingEm: 0.24 }));
    const labelSize = Math.min(...labelFits.map((f) => f.fontSize));
    const valueFits = facts.map((f) => fit(type, 'accent', f.value, { maxWidth: textW, maxLines: 2, maxSize: (square ? 34 : 40) * u, minSize: 12, lineHeight: 1.12 }));
    const valueSize = Math.min(...valueFits.map((f) => f.fontSize));
    const sameSize = facts.map((f) => fit(type, 'accent', f.value, { maxWidth: textW, maxLines: 2, maxSize: valueSize, minSize: 8, lineHeight: 1.12 }));
    const valueH = Math.max(...sameSize.map((f) => f.height));
    stack.push({ key: 'facts', height: labelSize * 1.4 + 10 * u + valueH, gap: 32 * u, drop: 3 });
    render.facts = (
      <Box style={{ width, alignItems: 'stretch', justifyContent: landscape ? 'flex-start' : 'center' }}>
        {facts.map((f, index) => (
          <Box key={index} style={{ width: colW, flexDirection: 'column', alignItems: landscape ? 'flex-start' : 'center', ...(index === 0 ? {} : { borderLeft: `${1.5 * u}px solid ${alpha(pal.light, 0.35)}`, marginLeft: colGap, paddingLeft: landscape ? 18 * u : 0 }) }}>
            <div style={{ display: 'flex', whiteSpace: 'nowrap', ...fontOf(type, 'sansBold'), fontSize: labelSize, letterSpacing: '0.24em', color: pal.light, lineHeight: 1.4, marginBottom: 10 * u }}>{upper(f.label)}</div>
            <Lines fit={sameSize[index]!} type={type} role="accent" color={ctx.text} lineHeight={1.12} align={landscape ? 'left' : 'center'} />
          </Box>
        ))}
      </Box>
    );
  }

  if (content.note) {
    const noteFit = fit(type, 'accent', content.note, { maxWidth: width * 0.9, maxLines: 2, maxSize: (square ? 34 : 40) * u, minSize: 14, lineHeight: 1.2 });
    stack.push({ key: 'note', height: noteFit.height + 22 * u, gap: 26 * u, drop: 2 });
    render.note = (
      <Box style={{ flexDirection: 'column', alignItems: 'center' }}>
        <Sparkle size={18 * u} color={pal.light} />
        <Lines fit={noteFit} type={type} role="accent" color={pal.light} lineHeight={1.2} align={landscape ? 'left' : 'center'} style={{ marginTop: 4 * u }} />
      </Box>
    );
  }

  if (content.cta || (content.qr && qrDataUrl)) {
    const qrSize = qrDataUrl ? (story ? 190 : format === 'print' ? 210 : square ? 140 : 170) * u : 0;
    const qrH = qrDataUrl ? qrCardHeight(qrSize) : 0;
    const ctaW = qrDataUrl ? width - qrSize * 1.18 - 34 * u : Math.min(width, 780 * u);
    const labelFit = content.cta ? fit(type, 'sansBold', upper(content.cta.label), { maxWidth: ctaW - 90 * u, maxLines: 1, maxSize: (story ? 32 : 28) * u, minSize: 12, letterSpacingEm: 0.16 }) : null;
    const pill = labelFit ? labelFit.fontSize * 1.2 + 52 * u : 0;
    const urlFit = content.cta?.displayUrl ? fit(type, 'sans', content.cta.displayUrl, { maxWidth: ctaW, maxLines: 1, maxSize: 24 * u, minSize: 10 }) : null;
    const ctaH = pill + (urlFit ? urlFit.height + 14 * u : 0);
    stack.push({ key: 'cta', height: Math.max(ctaH, qrH), gap: 36 * u, drop: 0 });
    render.cta = (
      <Box style={{ alignItems: 'center', justifyContent: landscape ? 'flex-start' : 'center', width }}>
        {labelFit && (
          <Box style={{ flexDirection: 'column', alignItems: 'center', width: ctaW }}>
            <Box style={{ width: ctaW, height: pill, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundImage: goldGradient(pal, 100), boxShadow: `0 ${10 * u}px ${40 * u}px ${alpha(pal.main, 0.35)}` }}>
              <Lines fit={labelFit} type={type} role="sansBold" color={NIGHT.bottom} letterSpacingEm={0.16} lineHeight={1.2} />
            </Box>
            {urlFit && <Lines fit={urlFit} type={type} role="sans" color={ctx.text} style={{ marginTop: 14 * u }} />}
          </Box>
        )}
        {content.qr && qrDataUrl && (
          <Box style={{ marginLeft: labelFit ? 34 * u : 0 }}>
            <QrCard src={qrDataUrl} size={qrSize} caption={content.qr.caption} type={type} ink={NIGHT.bottom} radius={18 * u} />
          </Box>
        )}
      </Box>
    );
  }

  if (content.contact.length > 0) {
    const contactFit = fit(type, 'sans', content.contact.join('   ·   '), { maxWidth: width, maxLines: 1, maxSize: 22 * u, minSize: 10 });
    stack.push({ key: 'contact', height: contactFit.height, gap: 24 * u, drop: 8 });
    render.contact = <Lines fit={contactFit} type={type} role="sans" color={ctx.muted} align={landscape ? 'left' : 'center'} />;
  }

  return { stack, render };
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------

function Background({ width, height, ctx, seed, padX }: { width: number; height: number; ctx: Ctx; seed: string; padX: number }) {
  const { u, pal } = ctx;
  const random = seededRandom(seed);
  const inset = 30 * u;
  // Destellos solo en los márgenes laterales: nunca encima de un texto.
  const band = Math.max(0, padX - inset - 40 * u);
  const sparkles = band > 0
    ? Array.from({ length: 14 }, (_, index) => {
        const left = index % 2 === 0;
        const size = (8 + random() * 14) * u;
        const x = left ? inset + 18 * u + random() * (band - size) : width - inset - 18 * u - size - random() * (band - size);
        return { x, y: inset + 40 * u + random() * (height - inset * 2 - 80 * u), s: size, o: 0.22 + random() * 0.45 };
      })
    : [];
  const layer = { display: 'flex', position: 'absolute', top: 0, left: 0, width, height } as const;
  const frame = (offset: number, line: number, opacity: number) => (
    <div style={{ display: 'flex', position: 'absolute', top: offset, left: offset, width: width - offset * 2, height: height - offset * 2, border: `${line}px solid ${alpha(pal.light, opacity)}` }} />
  );
  return (
    <>
      <div style={{ ...layer, backgroundImage: `radial-gradient(circle at 50% 0%, ${NIGHT.top} 0%, ${NIGHT.mid} 45%, ${NIGHT.bottom} 100%)` }} />
      <div style={{ ...layer, backgroundImage: `radial-gradient(circle at 50% 0%, ${alpha(pal.light, 0.2)} 0%, transparent 55%)` }} />
      <div style={{ ...layer, backgroundImage: `radial-gradient(circle at 50% 100%, ${alpha(pal.main, 0.16)} 0%, transparent 50%)` }} />
      {sparkles.map((s, index) => (
        <div key={index} style={{ display: 'flex', position: 'absolute', left: s.x, top: s.y }}>
          <Sparkle size={s.s} color={pal.light} opacity={s.o} />
        </div>
      ))}
      {frame(inset, 1.5 * u, 0.5)}
      {frame(inset + 10 * u, 1 * u, 0.2)}
      {[
        [inset, inset],
        [width - inset, inset],
        [inset, height - inset],
        [width - inset, height - inset],
      ].map(([x, y], index) => (
        <div key={index} style={{ display: 'flex', position: 'absolute', left: x! - 7 * u, top: y! - 7 * u }}>
          <Diamond size={14 * u} color={pal.light} />
        </div>
      ))}
    </>
  );
}

export function renderGala(input: PosterRenderInput) {
  const { content, format, palette: pal, type, images } = input;
  const { width: W, height: H, orientation } = POSTER_FORMAT_SPECS[format];
  const u = posterUnit(format);
  const ctx: Ctx = { u, type, pal, gold: pal.light, text: '#f6f1e7', muted: 'rgba(246,241,231,0.72)' };
  const landscape = orientation === 'landscape';
  const padX = (landscape ? 110 : 96) * u;
  // En la historia, Instagram tapa arriba (perfil) y abajo (responder): ahí no va nada importante.
  const padTop = (format === 'story' ? 210 : 92) * u;
  const padBottom = (format === 'story' ? 210 : 84) * u;
  const innerH = H - padTop - padBottom;
  const background = <Background width={W} height={H} ctx={ctx} seed={content.brand + content.piece} padX={padX} />;

  if (landscape) {
    const leftW = W * 0.5 - padX;
    const rightW = W - padX * 2 - leftW - 70 * u;
    const blocks = textBlocks(input, leftW, ctx, true);
    const solution = solveStack(blocks.stack, innerH, 0);
    const heroEl = <Hero content={content} images={images} width={rightW} height={innerH} ctx={ctx} />;
    return (
      <div style={{ display: 'flex', width: W, height: H, position: 'relative', color: ctx.text, backgroundColor: NIGHT.bottom }}>
        {background}
        <Box style={{ position: 'absolute', top: padTop, left: padX, width: leftW, height: innerH, flexDirection: 'column', justifyContent: 'center' }}>
          {blocks.stack
            .filter((block) => block.key !== 'hero' && solution.kept.has(block.key))
            .map((block, index) => (
              <Box key={block.key} style={{ marginTop: index === 0 ? 0 : block.gap, flexDirection: 'column', alignItems: 'flex-start' }}>
                {blocks.render[block.key]}
              </Box>
            ))}
        </Box>
        <Box style={{ position: 'absolute', top: padTop, right: padX, width: rightW, height: innerH, alignItems: 'center', justifyContent: 'center' }}>{heroEl}</Box>
      </div>
    );
  }

  const contentW = W - padX * 2;
  const blocks = textBlocks(input, contentW, ctx, false);
  const hasPhoto = Boolean(images.background || images.portrait);
  const solution = solveStack(blocks.stack, innerH, Math.max(heroMinHeight(content.hero, hasPhoto, u), heroCrowdMin(content.hero, u)));
  return (
    <div style={{ display: 'flex', width: W, height: H, position: 'relative', color: ctx.text, backgroundColor: NIGHT.bottom }}>
      {background}
      <Box style={{ position: 'absolute', top: padTop, left: padX, width: contentW, height: innerH, flexDirection: 'column', alignItems: 'center' }}>
        {blocks.stack
          .filter((block) => solution.kept.has(block.key))
          .map((block, index) =>
            block.key === 'hero' ? (
              <Box key="hero" style={{ marginTop: block.gap, width: contentW, height: Math.max(0, solution.flex - block.gap * 0), alignItems: 'center', justifyContent: 'center' }}>
                <Hero content={content} images={images} width={contentW} height={solution.flex} ctx={ctx} />
              </Box>
            ) : (
              <Box key={block.key} style={{ marginTop: index === 0 ? 0 : block.gap, flexDirection: 'column', alignItems: 'center' }}>
                {blocks.render[block.key]}
              </Box>
            ),
          )}
      </Box>
    </div>
  );
}
