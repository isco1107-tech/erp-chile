import { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HelpCircle, Image as ImageIcon, Images, LayoutGrid, Mail, MousePointerClick, Quote, Sparkles, Type, type LucideIcon } from 'lucide-react';
import type { BlockTypeInfo, WebSiteBlock } from '@/lib/web-sites/blocks';

/**
 * Tipos, constantes y utilidades que comparten los paneles del editor de
 * sitios web. Nada de esto toca el servidor: el estado vive en `WebSiteEditor`.
 */

/** Nombre de ícono de `BLOCK_INFO` → componente de lucide-react. */
export const BLOCK_ICONS: Record<BlockTypeInfo['icon'], LucideIcon> = {
  Sparkles,
  Type,
  Image: ImageIcon,
  Images,
  LayoutGrid,
  MousePointerClick,
  HelpCircle,
  Quote,
  Mail,
};

export interface EditorAsset {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  alt: string;
}

/** Ajustes editables del sitio (los que guarda `updateWebSiteSettingsAction`). */
export interface SettingsDraft {
  name: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  indexable: boolean;
  logoUrl: string;
  ogImageUrl: string;
  contactId: string | null;
}

export function settingsEqual(a: SettingsDraft, b: SettingsDraft): boolean {
  return (
    a.name === b.name &&
    a.slug === b.slug &&
    a.seoTitle === b.seoTitle &&
    a.seoDescription === b.seoDescription &&
    a.indexable === b.indexable &&
    a.logoUrl === b.logoUrl &&
    a.ogImageUrl === b.ogImageUrl &&
    a.contactId === b.contactId
  );
}

export const EDITOR_TABS = ['content', 'design', 'images', 'settings', 'readiness', 'messages'] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

export function isEditorTab(value: string | undefined | null): value is EditorTab {
  return EDITOR_TABS.some((tab) => tab === value);
}

export type PreviewDevice = 'desktop' | 'mobile';
export const MOBILE_PREVIEW_WIDTH = 390;

/** Mismo límite que el endpoint de subida (4 MB); el servidor tiene la última palabra. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export async function copyText(text: string, okMessage = 'Dirección copiada'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  } catch {
    toast.error('No se pudo copiar: selecciónala y cópiala a mano.');
  }
}

/** Resumen de una línea del contenido de una sección (para la tarjeta plegada). */
export function blockSummary(block: WebSiteBlock): string {
  const clip = (value: string, max = 70): string => {
    const text = value.trim().replace(/\s+/g, ' ');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };
  const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  switch (block.type) {
    case 'hero':
      return clip(block.title) || 'Sin título todavía';
    case 'text':
      return clip(block.heading || block.body) || 'Sin contenido todavía';
    case 'image':
      return clip(block.caption || block.alt) || (block.imageUrl ? 'Imagen sin descripción' : 'Sin imagen todavía');
    case 'gallery':
      return [clip(block.heading, 40), count(block.images.filter((image) => image.url).length, 'foto', 'fotos')].filter(Boolean).join(' · ');
    case 'features':
      return [clip(block.heading, 40), count(block.items.length, 'tarjeta', 'tarjetas')].filter(Boolean).join(' · ');
    case 'cta':
      return clip(block.title || block.buttonLabel) || 'Sin mensaje todavía';
    case 'faq':
      return [clip(block.heading, 40), count(block.items.length, 'pregunta', 'preguntas')].filter(Boolean).join(' · ');
    case 'testimonials':
      return [clip(block.heading, 40), count(block.items.length, 'testimonio', 'testimonios')].filter(Boolean).join(' · ');
    case 'contact':
      return clip(block.heading || block.email || block.phone) || 'Sin datos todavía';
  }
}

/** Devuelve `value` con retraso: la vista previa y la lista "qué falta" no se recalculan en cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Subida de imágenes
// ---------------------------------------------------------------------------

export type UploadOutcome = { ok: true; asset: EditorAsset } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toAsset(value: unknown): EditorAsset | null {
  if (!isRecord(value)) return null;
  const { id, url, fileName, mimeType, sizeBytes, alt } = value;
  if (typeof id !== 'string' || typeof url !== 'string' || typeof fileName !== 'string') return null;
  return {
    id,
    url,
    fileName,
    mimeType: typeof mimeType === 'string' ? mimeType : '',
    sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : 0,
    alt: typeof alt === 'string' ? alt : '',
  };
}

/** Contrato de `POST /api/web-sites/asset-upload`: `{success:true,data}` o `{success:false,error}`. */
export async function uploadWebSiteImage(siteId: string, file: File, alt?: string): Promise<UploadOutcome> {
  const body = new FormData();
  body.append('siteId', siteId);
  body.append('file', file);
  if (alt?.trim()) body.append('alt', alt.trim());
  let response: Response;
  try {
    response = await fetch('/api/web-sites/asset-upload', { method: 'POST', body });
  } catch {
    return { ok: false, error: `${file.name}: no se pudo subir. Revisa tu conexión e inténtalo de nuevo.` };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: response.status === 413 ? `${file.name}: la imagen es demasiado pesada.` : `${file.name}: no se pudo subir. Inténtalo de nuevo en un momento.` };
  }
  if (isRecord(payload) && payload.success === true) {
    const asset = toAsset(payload.data);
    if (asset) return { ok: true, asset };
  }
  const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'no se pudo subir. Inténtalo de nuevo.';
  return { ok: false, error: `${file.name}: ${message}` };
}

// ---------------------------------------------------------------------------
// Contexto de la biblioteca (lo leen los selectores de imagen)
// ---------------------------------------------------------------------------

export interface EditorAssetsContextValue {
  siteId: string;
  assets: EditorAsset[];
  readOnly: boolean;
  addAsset: (asset: EditorAsset) => void;
}

export const EditorAssetsContext = createContext<EditorAssetsContextValue | null>(null);

export function useEditorAssets(): EditorAssetsContextValue {
  const value = useContext(EditorAssetsContext);
  if (!value) throw new Error('useEditorAssets debe usarse dentro del editor de sitios web');
  return value;
}
