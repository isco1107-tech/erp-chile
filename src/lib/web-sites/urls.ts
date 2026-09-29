/**
 * Enlaces e imágenes de un sitio web. Todo lo que el usuario escribe como URL
 * pasa por acá antes de llegar a un `href`/`src`: es la barrera contra
 * `javascript:`, `data:` y esquemas raros, tanto al guardar como al pintar.
 * Puro (sin servidor ni red): lo usa el editor en el navegador y la página pública.
 */

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;
const BARE_DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const ANCHOR_RE = /^#[\w-]{1,60}$/;

/**
 * Devuelve un `href` seguro o `null` si el texto no sirve como enlace.
 * Acepta `#ancla`, `https://…`, `http://…`, `mailto:`, `tel:`, y perdona lo
 * que la gente escribe de verdad: `www.miweb.cl`, `hola@miweb.cl`, `+56 9 1234 5678`.
 */
export function safeHref(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || value.length > 500) return null;
  if (ANCHOR_RE.test(value)) return value;

  if (/^mailto:/i.test(value)) {
    const address = value.slice(7).split('?')[0] ?? '';
    return EMAIL_RE.test(address) ? `mailto:${address}` : null;
  }
  if (/^tel:/i.test(value)) {
    const number = value.slice(4);
    return PHONE_RE.test(number) ? `tel:${number.replace(/[^\d+]/g, '')}` : null;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.hostname.includes('.') ? url.toString() : null;
    } catch {
      return null;
    }
  }
  // Cualquier otro esquema (javascript:, data:, vbscript:, file:…) se rechaza.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(value)) return null;

  if (EMAIL_RE.test(value)) return `mailto:${value}`;
  if (BARE_DOMAIN_RE.test(value)) return safeHref(`https://${value}`);
  if (PHONE_RE.test(value)) return `tel:${value.replace(/[^\d+]/g, '')}`;
  return null;
}

/** ¿El enlace abre una página externa (para `target="_blank"` y `rel`)? */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * URL de imagen para pintar: solo `https:`. El servidor, al guardar, exige
 * además que sea de nuestro almacenamiento (`isAllowedBlobUrl`); acá no se
 * puede comprobar porque el navegador no conoce el host de R2.
 */
export function safeImageSrc(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Enlace de WhatsApp a partir de un número escrito de cualquier forma; `null` si no parece número. */
export function whatsappHref(raw: string | null | undefined, message?: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  // Chile: 9 dígitos móviles (+56 9…) o con prefijo 56; se acepta 8–15 dígitos (E.164).
  if (digits.length < 8 || digits.length > 15) return null;
  const withCountry = digits.length === 9 && digits.startsWith('9') ? `56${digits}` : digits;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${withCountry}${text}`;
}

// ---------------------------------------------------------------------------
// Video, mapa y redes sociales
// ---------------------------------------------------------------------------

export interface VideoEmbed {
  provider: 'youtube' | 'vimeo';
  /** Dirección para el iframe (YouTube sin cookies de seguimiento). */
  embedUrl: string;
  /** Dirección para abrir el video en su plataforma. */
  watchUrl: string;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Enlace de YouTube o Vimeo → dirección de inserción. Solo se aceptan esos dos
 * servicios y el iframe se arma con el ID extraído, nunca con la URL que
 * escribió el usuario: así no se puede incrustar cualquier página.
 */
export function videoEmbed(raw: string | null | undefined): VideoEmbed | null {
  const value = (raw ?? '').trim();
  if (!value || value.length > 300) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  let youtubeId: string | null = null;
  if (host === 'youtu.be') youtubeId = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') youtubeId = url.searchParams.get('v');
    else {
      const match = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
      youtubeId = match?.[1] ?? null;
    }
  }
  if (youtubeId && YOUTUBE_ID_RE.test(youtubeId)) {
    return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`, watchUrl: `https://www.youtube.com/watch?v=${youtubeId}` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = /^\/(?:video\/)?(\d{5,12})(?:[/?#]|$)/.exec(url.pathname);
    if (match?.[1]) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${match[1]}`, watchUrl: `https://vimeo.com/${match[1]}` };
  }
  return null;
}

/** Mapa de Google para una dirección escrita (sin llave de API). `null` si no hay dirección. */
export function mapEmbedUrl(address: string | null | undefined): string | null {
  const value = (address ?? '').trim();
  if (value.length < 3 || value.length > 200) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(value)}&output=embed`;
}

/** Enlace para abrir una dirección en Google Maps (en el celular abre la app). */
export function mapLinkUrl(address: string | null | undefined): string | null {
  const value = (address ?? '').trim();
  if (value.length < 3 || value.length > 200) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
}

export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

const SOCIAL_HOSTS: Record<SocialNetwork, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  linkedin: ['linkedin.com'],
  x: ['x.com', 'twitter.com'],
};

const SOCIAL_FROM_HANDLE: Record<SocialNetwork, (handle: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  x: (h) => `https://x.com/${h}`,
};

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
};

/**
 * Perfil de una red social: acepta la dirección completa o solo el usuario
 * (`@minegocio`). Una dirección de otro sitio se rechaza: el ícono de Instagram
 * nunca lleva a una página cualquiera.
 */
export function socialHref(network: SocialNetwork, raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || value.length > 200) return null;
  const handle = value.replace(/^@/, '');
  // Un usuario ("@mi.negocio") no tiene barras ni esquema; "instagram.com/x" o "www.…" es una dirección.
  const looksLikeUrl = /[/:]/.test(value) || /^www\./i.test(value) || SOCIAL_HOSTS[network].some((host) => value.toLowerCase().includes(host));
  if (!looksLikeUrl && /^[A-Za-z0-9._-]{1,60}$/.test(handle) && !handle.includes('..')) return SOCIAL_FROM_HANDLE[network](handle);
  const href = safeHref(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!href || !isExternalHref(href)) return null;
  try {
    const host = new URL(href).hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    return SOCIAL_HOSTS[network].some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ? href : null;
  } catch {
    return null;
  }
}

/** Texto en `slug`: minúsculas, sin tildes, guiones. Vacío si no queda nada. */
export function slugify(input: string, max = 50): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const SITE_SLUG_MIN = 3;
export const SITE_SLUG_MAX = 50;

/** Motivo (en español) por el que un slug no sirve, o `null` si sirve. */
export function siteSlugProblem(slug: string): string | null {
  if (slug.length < SITE_SLUG_MIN) return `La dirección debe tener al menos ${SITE_SLUG_MIN} caracteres`;
  if (slug.length > SITE_SLUG_MAX) return `La dirección puede tener hasta ${SITE_SLUG_MAX} caracteres`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Usa solo letras minúsculas, números y guiones';
  return null;
}
