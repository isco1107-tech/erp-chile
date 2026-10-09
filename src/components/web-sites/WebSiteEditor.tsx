'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ExternalLink, Globe, Loader2, Lock, Redo2, RefreshCw, Save, Undo2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { blockImageUrls } from '@/lib/web-sites/blocks';
import { htmlHints, sanitizeHtml, wrapHtmlDocument } from '@/lib/web-sites/html';
import { evaluateReadiness, type ReadinessReport } from '@/lib/web-sites/readiness';
import { allBlocks, findPage, homeOf, normalizeSiteDocument, pageBlockAnchors, siteDocumentSchema, type SiteDocument } from '@/lib/web-sites/site';
import { KIND_INFO } from '@/lib/web-sites/templates';
import { parseTheme, type WebSiteTheme } from '@/lib/web-sites/theme';
import { siteSlugProblem, slugify } from '@/lib/web-sites/urls';
import { getWebSiteAction, publishWebSiteAction, saveWebSiteContentAction, unpublishWebSiteAction, updateWebSiteSettingsAction } from '@/modules/web-sites/actions/web-sites.actions';
import type { WebSiteDetail } from '@/modules/web-sites/services/web-sites.service';
import { AddPageDialog } from './AddPageDialog';
import { AssetLibrary } from './AssetLibrary';
import { EditorTabs, tabId, tabPanelId, type EditorTabDef } from './EditorTabs';
import { SiteDesignAssistant } from './SiteDesignAssistant';
import { GuidedEditor } from './GuidedEditor';
import { HtmlEditor } from './HtmlEditor';
import { LayoutPanel } from './LayoutPanel';
import { PageSwitcher } from './PageSwitcher';
import { PagesPanel } from './PagesPanel';
import { PreviewPane, type PreviewScrollRequest } from './PreviewPane';
import { PublishDialog } from './PublishDialog';
import { ReadinessPanel } from './ReadinessPanel';
import { SettingsPanel } from './SettingsPanel';
import { StartGuide } from './StartGuide';
import { ThemePanel } from './ThemePanel';
import WebSiteDomainPanel from './WebSiteDomainPanel';
import WebSiteMessagesPanel from './WebSiteMessagesPanel';
import { canRedo, canUndo, emptyHistory, recordChange, redoStep, structureSignature, undoStep, type HistoryState } from './editor-history';
import { EditorAssetsContext, isEditorTab, settingsEqual, useDebouncedValue, type EditorAsset, type EditorAssetsContextValue, type EditorTab, type PreviewDevice, type SettingsDraft } from './editor-shared';

interface WebSiteEditorProps {
  site: WebSiteDetail;
  /** Clientes para el selector de Ajustes; `null` si el usuario no puede ver contactos. */
  contacts: { id: string; label: string }[] | null;
  canWrite: boolean;
  canPublish: boolean;
  /** Pestaña con la que se abre (`?tab=messages`). */
  initialTab?: string;
}

/** Mensaje del servidor cuando `expectedUpdatedAt` ya no coincide (otra persona guardó). */
const CONFLICT_MARKER = 'Otra persona guardó cambios';

/** Segundos de calma tras el último cambio antes de guardar el borrador solo. */
const AUTOSAVE_MS = 4000;

type Busy = 'saving' | 'publishing' | 'unpublishing' | 'settings' | null;
type SaveMode = 'manual' | 'auto';

/** Lo que se puede deshacer: el sitio armado y su tema. */
interface Content {
  document: SiteDocument;
  theme: WebSiteTheme;
}

/** Lo último que se guardó, por referencia: mientras el contenido actual sea ese mismo objeto, no hay nada pendiente. */
interface SavedContent extends Content {
  html: string;
}

interface ContentSnapshot {
  document: string;
  theme: string;
  html: string;
}

/** Contenido tal como lo deja el servidor tras normalizarlo (mismo esquema): sirve para comparar sin ruido. */
function snapshotOf(content: SavedContent): ContentSnapshot {
  return { document: JSON.stringify(normalizeSiteDocument(content.document)), theme: JSON.stringify(parseTheme(content.theme)), html: content.html };
}

function draftOf(site: WebSiteDetail): SettingsDraft {
  return {
    name: site.name,
    slug: site.slug,
    seoTitle: site.seoTitle,
    seoDescription: site.seoDescription,
    indexable: site.indexable,
    logoUrl: site.logoUrl,
    ogImageUrl: site.ogImageUrl,
    faviconUrl: site.faviconUrl,
    contactId: site.contactId,
  };
}

function formatMoment(value: Date | string): string {
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });
}

function agoLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

/** Primer aviso del esquema que un usuario pueda entender (los mensajes propios; no los genéricos de la librería). */
function friendlyIssue(issues: { message: string }[]): string {
  const own = issues.find((issue) => !/^(Too (small|big)|Invalid|Expected|Unrecognized|Required)/.test(issue.message));
  return own?.message ?? 'Revisa los textos del sitio: alguno es demasiado largo o no es válido.';
}

/** Campos donde escribir tiene su propio deshacer: ahí Ctrl+Z no se toca. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(target.type);
  return false;
}

const NETWORK_ERROR = 'No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.';

export default function WebSiteEditor({ site, contacts, canWrite, canPublish, initialTab }: WebSiteEditorProps) {
  const confirm = useConfirm();
  const isGuided = site.mode === 'GUIDED';

  const [tab, setTab] = useState<EditorTab>(isEditorTab(initialTab) ? initialTab : 'content');
  const [status, setStatus] = useState(site.status);
  const [publishedAt, setPublishedAt] = useState<Date | string | null>(site.publishedAt);
  const [pendingChanges, setPendingChanges] = useState(site.pendingChanges);
  const [content, setContent] = useState<Content>(() => ({ document: site.document, theme: site.theme }));
  const [html, setHtml] = useState(site.html);
  const [saved, setSaved] = useState<SavedContent>(() => ({ document: site.document, theme: site.theme, html: site.html }));
  const [settings, setSettings] = useState<SettingsDraft>(() => draftOf(site));
  const [savedSettings, setSavedSettings] = useState<SettingsDraft>(() => draftOf(site));
  const [assets, setAssets] = useState<EditorAsset[]>(() => site.assets.map(({ id, url, fileName, mimeType, sizeBytes, alt }) => ({ id, url, fileName, mimeType, sizeBytes, alt })));
  const [version, setVersion] = useState(site.version);
  const [baseline, setBaseline] = useState<ContentSnapshot>(() => snapshotOf({ document: site.document, theme: site.theme, html: site.html }));
  const [busy, setBusy] = useState<Busy>(null);
  const [conflict, setConflict] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [currentPageId, setCurrentPageId] = useState(() => homeOf(site.document).id);
  const [openId, setOpenId] = useState<string | null>(() => homeOf(site.document).blocks[0]?.id ?? null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<PreviewScrollRequest | null>(null);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [unread, setUnread] = useState(site.unreadMessages);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishReport, setPublishReport] = useState<ReadinessReport | null>(null);
  const [historyFlags, setHistoryFlags] = useState({ undo: false, redo: false });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<SavedContent | null>(null);

  // Fuente de verdad síncrona del contenido: varias ediciones en el mismo instante se apilan sin perderse.
  const contentRef = useRef(content);
  const historyRef = useRef<HistoryState<Content>>(emptyHistory());
  const lastKind = useRef<'document' | 'theme' | null>(null);
  const scrollSeq = useRef(0);
  const reloading = useRef(false);

  const archived = status === 'ARCHIVED';
  const readOnly = !canWrite || archived;
  const { document, theme } = content;
  const contentDirty = document !== saved.document || theme !== saved.theme || html !== saved.html;
  const settingsDirty = !settingsEqual(settings, savedSettings);
  const anyDirty = contentDirty || settingsDirty;
  const publicBase = site.publicUrl.slice(0, Math.max(site.publicUrl.length - site.slug.length, 0));
  const publicUrl = `${publicBase}${savedSettings.slug}`;
  const domainLive = Boolean(site.customDomain && site.customDomainVerifiedAt);
  const addressBase = (domainLive && site.customDomain ? site.customDomain : publicUrl.replace(/^https?:\/\//, '')).replace(/\/$/, '');
  const platformUrl = useMemo(() => {
    try {
      return new URL(site.publicUrl).origin;
    } catch {
      return site.publicUrl;
    }
  }, [site.publicUrl]);

  // Si la página que se edita ya no existe (se borró o se deshizo su creación), se vuelve a la de inicio.
  const currentPage = findPage(document, currentPageId) ?? homeOf(document);
  const pageId = currentPage.id;
  const pageIdRef = useRef(pageId);
  useEffect(() => {
    pageIdRef.current = pageId;
  }, [pageId]);

  // "Páginas" y "Encabezado y pie" solo existen en el modo guiado.
  const activeTab: EditorTab = !isGuided && (tab === 'pages' || tab === 'layout') ? 'content' : tab;

  // -------------------------------------------------------------------------
  // Edición con historial
  // -------------------------------------------------------------------------

  const syncHistoryFlags = useCallback(() => {
    const next = { undo: canUndo(historyRef.current), redo: canRedo(historyRef.current) };
    setHistoryFlags((previous) => (previous.undo === next.undo && previous.redo === next.redo ? previous : next));
  }, []);

  const commit = useCallback(
    (next: Content, kind: 'document' | 'theme') => {
      const previous = contentRef.current;
      if (next.document === previous.document && next.theme === previous.theme) return;
      // Agregar, quitar o mover algo es una acción con su propio paso; escribir seguido se junta en uno.
      const boundary = lastKind.current !== kind || (kind === 'document' && structureSignature(previous.document) !== structureSignature(next.document));
      historyRef.current = recordChange(historyRef.current, previous, Date.now(), { boundary });
      lastKind.current = kind;
      contentRef.current = next;
      setContent(next);
      syncHistoryFlags();
    },
    [syncHistoryFlags]
  );

  const updateDocument = useCallback(
    (updater: (previous: SiteDocument) => SiteDocument) => {
      const previous = contentRef.current;
      commit({ ...previous, document: updater(previous.document) }, 'document');
    },
    [commit]
  );

  const updateTheme = useCallback(
    (patch: Partial<WebSiteTheme>) => {
      const previous = contentRef.current;
      commit({ ...previous, theme: { ...previous.theme, ...patch } }, 'theme');
    },
    [commit]
  );

  const updateHtml = useCallback((next: string) => setHtml(next), []);

  const undo = useCallback(() => {
    const step = undoStep(historyRef.current, contentRef.current);
    if (!step) return;
    historyRef.current = step.history;
    contentRef.current = step.value;
    lastKind.current = null;
    setContent(step.value);
    syncHistoryFlags();
    toast('Cambio deshecho', { id: 'ws-history', duration: 1500 });
  }, [syncHistoryFlags]);

  const redo = useCallback(() => {
    const step = redoStep(historyRef.current, contentRef.current);
    if (!step) return;
    historyRef.current = step.history;
    contentRef.current = step.value;
    lastKind.current = null;
    setContent(step.value);
    syncHistoryFlags();
    toast('Cambio rehecho', { id: 'ws-history', duration: 1500 });
  }, [syncHistoryFlags]);

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z y Ctrl+Y — salvo dentro de un campo de texto, que ya sabe deshacer lo que se escribe en él.
  const historyEnabled = isGuided && !readOnly;
  useEffect(() => {
    if (!historyEnabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const wantsUndo = key === 'z' && !event.shiftKey;
      const wantsRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.metaKey);
      if (!wantsUndo && !wantsRedo) return;
      if (isTextEntry(event.target)) return;
      // Con un diálogo abierto (publicar, agregar página) el cambio ocurriría por detrás sin verse.
      if (window.document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      if (wantsUndo) undo();
      else redo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyEnabled, undo, redo]);

  const updateSettings = useCallback((patch: Partial<SettingsDraft>) => setSettings((previous) => ({ ...previous, ...patch })), []);

  const addAsset = useCallback((asset: EditorAsset) => setAssets((previous) => (previous.some((item) => item.id === asset.id) ? previous : [asset, ...previous])), []);

  const assetsContext = useMemo<EditorAssetsContextValue>(() => ({ siteId: site.id, assets, readOnly, addAsset }), [site.id, assets, readOnly, addAsset]);

  // -------------------------------------------------------------------------
  // Navegación: página actual, sección abierta y vista previa
  // -------------------------------------------------------------------------

  const requestScroll = useCallback((request: Omit<PreviewScrollRequest, 'id'>) => {
    scrollSeq.current += 1;
    setScrollRequest({ id: scrollSeq.current, ...request });
  }, []);

  const selectPage = useCallback(
    (nextId: string) => {
      const page = findPage(contentRef.current.document, nextId);
      if (!page) return;
      setCurrentPageId(nextId);
      setOpenId(page.blocks[0]?.id ?? null);
      requestScroll({ pageId: nextId, target: 'top' });
    },
    [requestScroll]
  );

  const editPage = useCallback(
    (nextId: string) => {
      selectPage(nextId);
      setTab('content');
    },
    [selectPage]
  );

  // Un clic en el menú o en un botón de la vista previa: se cambia de página sin salir del editor.
  const previewNavigate = useCallback(
    (targetPageId: string, anchor: string | null) => {
      if (targetPageId !== pageIdRef.current) {
        const page = findPage(contentRef.current.document, targetPageId);
        if (!page) return;
        setCurrentPageId(targetPageId);
        setOpenId(page.blocks[0]?.id ?? null);
      }
      requestScroll({ pageId: targetPageId, target: anchor ? 'anchor' : 'top', anchor });
    },
    [requestScroll]
  );

  // Un clic en una sección de la vista previa: se abre para editarla y se lleva a la vista.
  const previewSelectBlock = useCallback((blockId: string) => {
    setTab('content');
    setOpenId(blockId);
    setRevealId(blockId);
  }, []);

  useEffect(() => {
    if (activeTab !== 'content' || !revealId) return;
    const id = revealId;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        const card = window.document.getElementById(`sec-${id}`);
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
        setRevealId(null);
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [activeTab, revealId]);

  // Al abrir una sección en el editor, la vista previa la muestra.
  const changeOpenSection = useCallback(
    (id: string | null) => {
      setOpenId(id);
      if (!id) return;
      const page = findPage(contentRef.current.document, pageIdRef.current);
      requestScroll({ pageId: pageIdRef.current, target: 'block', blockId: id, anchor: page ? (pageBlockAnchors(page).get(id) ?? null) : null });
    },
    [requestScroll]
  );

  const focusArea = useCallback((area: 'top' | 'bottom') => requestScroll({ target: area }), [requestScroll]);

  // En una ventana angosta la vista previa arranca como celular.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) setDevice('mobile');
  }, []);

  // -------------------------------------------------------------------------
  // Vista previa y "qué le falta" (con retraso: no se recalculan en cada tecla)
  // -------------------------------------------------------------------------

  const live = useMemo(
    () => ({ document, theme, html, pageId, name: settings.name, seoTitle: settings.seoTitle, seoDescription: settings.seoDescription, logoUrl: settings.logoUrl }),
    [document, theme, html, pageId, settings.name, settings.seoTitle, settings.seoDescription, settings.logoUrl]
  );
  const debounced = useDebouncedValue(live, 150);

  const report = useMemo(
    () => evaluateReadiness({ kind: site.kind, mode: site.mode, seoTitle: debounced.seoTitle, seoDescription: debounced.seoDescription, logoUrl: debounced.logoUrl, theme: debounced.theme, document: debounced.document, html: debounced.html }),
    [debounced, site.kind, site.mode]
  );
  const sanitized = useMemo(() => (isGuided ? null : sanitizeHtml(debounced.html)), [isGuided, debounced.html]);
  const hints = useMemo(() => (isGuided ? [] : htmlHints(debounced.html)), [isGuided, debounced.html]);
  const srcDoc = useMemo(
    () => (sanitized ? wrapHtmlDocument(sanitized.html, { title: debounced.seoTitle.trim() || debounced.name.trim() || site.name, description: debounced.seoDescription.trim() || null }) : ''),
    [sanitized, debounced.seoTitle, debounced.name, debounced.seoDescription, site.name]
  );

  // Imágenes en uso (con el contenido actual, guardado o no): no se dejan eliminar desde la biblioteca.
  const usedUrls = useMemo(() => new Set([...allBlocks(document).flatMap(blockImageUrls), settings.logoUrl, settings.ogImageUrl, settings.faviconUrl].filter(Boolean)), [document, settings.logoUrl, settings.ogImageUrl, settings.faviconUrl]);
  const isUsed = useCallback((url: string) => usedUrls.has(url) || (!isGuided && html.includes(url)), [usedUrls, isGuided, html]);

  // -------------------------------------------------------------------------
  // Guardar
  // -------------------------------------------------------------------------

  async function saveContent(mode: SaveMode): Promise<boolean> {
    const sent: SavedContent = { document: contentRef.current.document, theme: contentRef.current.theme, html };
    const fail = (message: string) => {
      setSaveError(message);
      setFailedFor(sent);
      // Con la misma `id`, un aviso repetido reemplaza al anterior en vez de apilarse.
      toast.error(message, { id: 'ws-save-error', duration: mode === 'auto' ? 6000 : 8000 });
      return false;
    };
    if (isGuided) {
      const check = siteDocumentSchema.safeParse(sent.document);
      if (!check.success) return fail(friendlyIssue(check.error.issues));
    }
    const payload = isGuided ? { document: sent.document, theme: sent.theme } : { html: sent.html };
    let result = await saveWebSiteContentAction(site.id, { ...payload, expectedUpdatedAt: version });
    if (!result.success && result.error.includes(CONFLICT_MARKER)) {
      // Guardar ajustes, publicar o cambiar el dominio también mueve la versión del sitio sin tocar el contenido:
      // si el contenido del servidor sigue siendo el que cargamos, no hubo edición ajena y se reintenta.
      const latest = await getWebSiteAction(site.id);
      if (latest.success && JSON.stringify(latest.data.document) === baseline.document && JSON.stringify(latest.data.theme) === baseline.theme && latest.data.html === baseline.html) {
        result = await saveWebSiteContentAction(site.id, { ...payload, expectedUpdatedAt: latest.data.version });
      }
    }
    if (!result.success) {
      if (result.error.includes(CONFLICT_MARKER)) {
        setConflict(true);
        return false;
      }
      return fail(result.error);
    }
    setVersion(result.data.version);
    setBaseline(snapshotOf(sent));
    setSaved(sent);
    setSaveError(null);
    setFailedFor(null);
    setLastSavedAt(Date.now());
    setNow(Date.now());
    if (status === 'PUBLISHED') setPendingChanges(true);
    return true;
  }

  async function saveSettings(): Promise<boolean> {
    const slug = slugify(settings.slug);
    const name = settings.name.trim();
    const problem = name.length < 2 ? 'Ponle un nombre al sitio (mínimo 2 caracteres).' : siteSlugProblem(slug);
    if (problem) {
      toast.error(problem);
      setTab('settings');
      return false;
    }
    const sent: SettingsDraft = { ...settings, name, slug, seoTitle: settings.seoTitle.trim(), seoDescription: settings.seoDescription.trim() };
    const result = await updateWebSiteSettingsAction(site.id, {
      name: sent.name,
      slug: sent.slug,
      seoTitle: sent.seoTitle,
      seoDescription: sent.seoDescription,
      indexable: sent.indexable,
      logoUrl: sent.logoUrl,
      ogImageUrl: sent.ogImageUrl,
      faviconUrl: sent.faviconUrl,
      contactId: sent.contactId,
    });
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    const savedNow: SettingsDraft = { ...sent, slug: result.data.slug };
    setSavedSettings(savedNow);
    setSettings((current) => (settingsEqual(current, settings) ? savedNow : current));
    return true;
  }

  /** Guarda el borrador. `auto` (el guardado solo) únicamente toca el contenido y no avisa si sale bien. */
  async function saveAll(mode: SaveMode = 'manual'): Promise<boolean> {
    if (readOnly || busy || conflict) return false;
    if (mode === 'auto' ? !contentDirty : !anyDirty) return mode === 'manual';
    setBusy('saving');
    try {
      if (contentDirty && !(await saveContent(mode))) return false;
      if (mode === 'manual') {
        if (settingsDirty && !(await saveSettings())) return false;
        toast.success(settingsDirty && !contentDirty ? 'Ajustes guardados' : 'Borrador guardado');
      }
      return true;
    } catch {
      toast.error(NETWORK_ERROR, { id: 'ws-save-error' });
      setSaveError(NETWORK_ERROR);
      setFailedFor({ document: contentRef.current.document, theme: contentRef.current.theme, html });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveSettingsOnly() {
    if (readOnly || busy || !settingsDirty) return;
    setBusy('settings');
    try {
      if (await saveSettings()) toast.success('Ajustes guardados');
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  // Ctrl/Cmd+S guarda el borrador (el manejador siempre llama a la versión más reciente de `saveAll`).
  const saveRef = useRef(saveAll);
  useEffect(() => {
    saveRef.current = saveAll;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current('manual');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Guardado solo: 4 s después del último cambio. Nunca publica. Si falló, no insiste hasta que haya un cambio nuevo.
  const failedHere = failedFor !== null && failedFor.document === document && failedFor.theme === theme && failedFor.html === html;
  useEffect(() => {
    if (!contentDirty || readOnly || conflict || busy !== null || failedHere) return;
    const timer = window.setTimeout(() => void saveRef.current('auto'), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [document, theme, html, contentDirty, readOnly, conflict, busy, failedHere]);

  // "Guardado · hace 3 min" se va actualizando.
  useEffect(() => {
    if (lastSavedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [lastSavedAt]);

  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!anyDirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (reloading.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  // -------------------------------------------------------------------------
  // Publicar / despublicar
  // -------------------------------------------------------------------------

  function openPublish() {
    setPublishReport(evaluateReadiness({ kind: site.kind, mode: site.mode, seoTitle: settings.seoTitle, seoDescription: settings.seoDescription, logoUrl: settings.logoUrl, theme, document, html }));
    setPublishOpen(true);
  }

  async function confirmPublish() {
    if (busy || conflict) return;
    setBusy('publishing');
    try {
      if (contentDirty && !(await saveContent('manual'))) {
        setPublishOpen(false);
        return;
      }
      if (settingsDirty && !(await saveSettings())) {
        setPublishOpen(false);
        return;
      }
      const result = await publishWebSiteAction(site.id);
      if (!result.success) {
        toast.error(result.error, { duration: 8000 });
        return;
      }
      setStatus('PUBLISHED');
      setPublishedAt(result.data.publishedAt);
      setPendingChanges(false);
      setPublishOpen(false);
      toast.success(result.message ?? 'Sitio publicado');
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function unpublish() {
    const ok = await confirm({
      title: '¿Despublicar el sitio?',
      description: 'Dejará de verse en internet: quien abra el enlace verá un error. Tu borrador se conserva y puedes volver a publicarlo cuando quieras.',
      confirmLabel: 'Despublicar',
    });
    if (!ok) return;
    setBusy('unpublishing');
    try {
      const result = await unpublishWebSiteAction(site.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setStatus('DRAFT');
      setPendingChanges(false);
      toast.success(result.message ?? 'Sitio despublicado');
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    if (anyDirty) {
      const ok = await confirm({ title: '¿Recargar la página?', description: 'Se perderán los cambios que no alcanzaste a guardar.', confirmLabel: 'Recargar' });
      if (!ok) return;
    }
    reloading.current = true;
    window.location.reload();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const idPrefix = `ws-${site.id}`;
  const tabs: EditorTabDef[] = [
    { id: 'content', label: 'Contenido' },
    ...(isGuided ? ([{ id: 'pages', label: 'Páginas' }, { id: 'layout', label: 'Encabezado y pie' }] satisfies EditorTabDef[]) : []),
    { id: 'design', label: 'Diseño' },
    { id: 'images', label: 'Imágenes' },
    { id: 'settings', label: 'Ajustes' },
    { id: 'readiness', label: 'Qué le falta', badge: report.blockers > 0 ? { text: String(report.blockers), tone: 'danger', description: ` (${report.blockers} pendiente${report.blockers === 1 ? '' : 's'} obligatorio${report.blockers === 1 ? '' : 's'})` } : null },
    { id: 'messages', label: 'Mensajes', badge: unread > 0 ? { text: String(unread), tone: 'info', description: ` (${unread} sin leer)` } : null },
  ];

  const canSaveDraft = canWrite && !archived;
  const nothingToPublish = status === 'PUBLISHED' && !pendingChanges && !contentDirty;

  // Estado del guardado, discreto y siempre visible.
  let saveNote: { text: string; tone: 'warning' | 'danger' | 'muted'; title?: string; spinner?: boolean } | null = null;
  if (busy === 'saving') saveNote = { text: 'Guardando…', tone: 'muted', spinner: true };
  else if (saveError && contentDirty) saveNote = { text: 'No se pudo guardar', tone: 'danger', title: saveError };
  else if (anyDirty) saveNote = { text: 'Cambios sin guardar', tone: 'warning', title: contentDirty && !readOnly && !conflict ? 'Se guardan solos unos segundos después del último cambio.' : undefined };
  else if (lastSavedAt !== null) saveNote = { text: `Guardado · ${agoLabel(Math.max(0, now - lastSavedAt))}`, tone: 'muted' };

  const preview = (
    <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      {isGuided ? (
        <PreviewPane
          mode="GUIDED"
          device={device}
          onDeviceChange={setDevice}
          name={debounced.name || site.name}
          logoUrl={debounced.logoUrl || null}
          theme={debounced.theme}
          document={debounced.document}
          pageId={debounced.pageId}
          slug={savedSettings.slug}
          onPageChange={selectPage}
          onNavigate={previewNavigate}
          onSelectBlock={previewSelectBlock}
          selectedBlockId={openId}
          scrollRequest={scrollRequest}
        />
      ) : (
        <PreviewPane mode="HTML" device={device} onDeviceChange={setDevice} srcDoc={srcDoc} />
      )}
    </div>
  );

  return (
    <EditorAssetsContext.Provider value={assetsContext}>
      <div className="space-y-6">
        <Link href="/dashboard/web-sites" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Sitios web
        </Link>

        <PageHeader
          eyebrow={`Sitios web · ${KIND_INFO[site.kind].label} · ${isGuided ? 'Modo guiado' : 'HTML propio'}`}
          title={savedSettings.name}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={status === 'PUBLISHED' ? 'success' : 'neutral'}>{status === 'PUBLISHED' ? 'Publicado' : status === 'ARCHIVED' ? 'Archivado' : 'Borrador'}</StatusBadge>
              {status === 'PUBLISHED' && (pendingChanges || contentDirty) ? <StatusBadge tone="warning">Cambios sin publicar</StatusBadge> : null}
              {status === 'PUBLISHED' && publishedAt ? <span>Publicado el {formatMoment(publishedAt)}</span> : null}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span aria-live="polite" title={saveNote?.title} className={`flex items-center gap-1.5 text-xs font-medium ${saveNote?.tone === 'warning' ? 'text-warning' : saveNote?.tone === 'danger' ? 'text-danger' : 'text-muted-foreground'}`}>
                {saveNote ? (
                  <>
                    {saveNote.spinner ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <span className={`size-1.5 rounded-full ${saveNote.tone === 'warning' ? 'bg-warning' : saveNote.tone === 'danger' ? 'bg-danger' : 'bg-success'}`} aria-hidden="true" />}
                    {saveNote.text}
                  </>
                ) : null}
              </span>
              {isGuided && canSaveDraft ? (
                <div role="group" aria-label="Deshacer y rehacer" className="flex items-center gap-0.5">
                  <Button type="button" variant="ghost" size="icon" disabled={!historyFlags.undo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer" onClick={undo}>
                    <Undo2 aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={!historyFlags.redo} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" onClick={redo}>
                    <Redo2 aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {canSaveDraft ? (
                <Button type="button" variant="outline" disabled={!anyDirty || busy !== null || conflict} title="Guardar ahora (Ctrl+S)" onClick={() => void saveAll('manual')}>
                  {busy === 'saving' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Guardar borrador
                </Button>
              ) : null}
              {status === 'PUBLISHED' ? (
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline' })}>
                  <ExternalLink aria-hidden="true" /> Ver sitio<span className="sr-only"> (se abre en otra pestaña)</span>
                </a>
              ) : null}
              {canPublish && status === 'PUBLISHED' ? (
                <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void unpublish()}>
                  {busy === 'unpublishing' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Despublicar
                </Button>
              ) : null}
              {canPublish && !archived ? (
                <Button type="button" disabled={busy !== null || conflict || nothingToPublish} title={nothingToPublish ? 'No hay cambios por publicar' : undefined} onClick={openPublish}>
                  <Globe aria-hidden="true" /> {status === 'PUBLISHED' ? 'Publicar cambios' : 'Publicar'}
                </Button>
              ) : null}
            </div>
          }
        />

        {conflict ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            <p className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold">Otra persona guardó cambios en este sitio mientras lo editabas.</span> Para no pisar su trabajo no se guardó lo tuyo. Recarga para ver la última versión
                {anyDirty ? ' (lo que escribiste desde tu último guardado se perderá; cópialo antes si lo necesitas)' : ''}.
              </span>
            </p>
            <Button type="button" variant="outline" onClick={() => void reload()}>
              <RefreshCw aria-hidden="true" /> Recargar
            </Button>
          </div>
        ) : null}

        {readOnly ? (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {archived ? 'Este sitio está archivado: solo puedes mirarlo. Restáuralo desde la lista de sitios para poder editarlo.' : 'Tienes permiso para ver este sitio, pero no para editarlo. Pídele a un administrador el permiso de edición de sitios web.'}
          </p>
        ) : null}

        <EditorTabs tabs={tabs} active={activeTab} onChange={setTab} idPrefix={idPrefix} />

        <div role="tabpanel" id={tabPanelId(idPrefix)} aria-labelledby={tabId(idPrefix, activeTab)} tabIndex={0} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {activeTab === 'content' ? (
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0 space-y-4">
                {isGuided ? (
                  <>
                    {!readOnly ? <StartGuide onGoToTab={setTab} /> : null}
                    <PageSwitcher doc={document} pageId={pageId} onSelect={selectPage} onAddPage={() => setAddPageOpen(true)} onManagePages={() => setTab('pages')} readOnly={readOnly} />
                    <SiteDesignAssistant disabled={readOnly || busy !== null} context={{ target: 'web', resourceId: site.id, pageId, current: { blocks: currentPage.blocks, theme } }} onApply={(proposal) => {
                      if (proposal.target !== 'web') return;
                      const previous = contentRef.current;
                      const nextDocument = { ...previous.document, pages: previous.document.pages.map((p) => p.id === pageId ? { ...p, blocks: proposal.design.blocks } : p) };
                      const checked = siteDocumentSchema.safeParse(nextDocument);
                      if (!checked.success) { toast.error(checked.error.issues[0]?.message ?? 'La propuesta supera los límites del sitio'); return; }
                      commit({ document: checked.data, theme: proposal.design.theme }, 'document');
                      toast.success('Propuesta aplicada: puedes deshacerla con el historial');
                    }} />
                    <GuidedEditor kind={site.kind} document={document} pageId={pageId} onDocumentChange={updateDocument} openId={openId} onOpenChange={changeOpenSection} readOnly={readOnly} theme={theme} />
                    <AddPageDialog open={addPageOpen} onOpenChange={setAddPageOpen} document={document} onDocumentChange={updateDocument} onAdded={selectPage} />
                  </>
                ) : (
                  <HtmlEditor html={html} onChange={updateHtml} siteName={settings.name || site.name} removed={sanitized?.removed ?? []} hints={hints} readOnly={readOnly} />
                )}
              </div>
              {preview}
            </div>
          ) : null}

          {activeTab === 'pages' && isGuided ? (
            <PagesPanel
              doc={document}
              addressBase={addressBase}
              published={status === 'PUBLISHED'}
              siteName={settings.name || site.name}
              currentPageId={pageId}
              onDocumentChange={updateDocument}
              onSelectPage={selectPage}
              onEditPage={editPage}
              readOnly={readOnly}
            />
          ) : null}

          {activeTab === 'layout' && isGuided ? (
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0">
                <LayoutPanel doc={document} pageId={pageId} onDocumentChange={updateDocument} onFocusArea={focusArea} onGoToTab={setTab} disabled={readOnly} />
              </div>
              {preview}
            </div>
          ) : null}

          {activeTab === 'design' ? (
            isGuided ? (
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0">
                  <ThemePanel theme={theme} onChange={updateTheme} disabled={readOnly} />
                </div>
                {preview}
              </div>
            ) : (
              <div className="max-w-2xl space-y-3 rounded-lg border border-border bg-card p-5 shadow-card">
                <h2 className="text-sm font-semibold">El estilo va dentro de tu HTML</h2>
                <p className="text-sm text-muted-foreground">En el modo HTML propio los colores, la tipografía y los espacios los defines tú con CSS, dentro de una etiqueta {'<style>'} en tu HTML. Esta pestaña solo aplica a los sitios armados por secciones.</p>
                <Button type="button" variant="outline" onClick={() => setTab('content')}>
                  Ir al contenido
                </Button>
              </div>
            )
          ) : null}

          {activeTab === 'images' ? (
            <AssetLibrary
              isUsed={isUsed}
              onAltSaved={(assetId, alt) => setAssets((previous) => previous.map((asset) => (asset.id === assetId ? { ...asset, alt } : asset)))}
              onDeleted={(assetId) => setAssets((previous) => previous.filter((asset) => asset.id !== assetId))}
            />
          ) : null}

          {activeTab === 'settings' ? (
            <div className="max-w-3xl space-y-6">
              <SettingsPanel
                settings={settings}
                onChange={updateSettings}
                disabled={readOnly}
                savedSlug={savedSettings.slug}
                isPublished={status === 'PUBLISHED'}
                publicBase={publicBase}
                contacts={contacts}
                contactName={site.contactName}
                companyLogoUrl={site.companyLogoUrl}
                saving={busy === 'settings'}
                dirty={settingsDirty}
                onSave={() => void saveSettingsOnly()}
              />
              <WebSiteDomainPanel siteId={site.id} canPublish={canPublish && !archived} initialDomain={site.customDomain} platformUrl={platformUrl} />
            </div>
          ) : null}

          {activeTab === 'readiness' ? (
            <div className="max-w-3xl">
              <ReadinessPanel report={report} mode={site.mode} onGo={setTab} />
            </div>
          ) : null}

          {activeTab === 'messages' ? <WebSiteMessagesPanel siteId={site.id} canWrite={canWrite} onUnreadChange={setUnread} /> : null}
        </div>

        {publishReport ? (
          <PublishDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            report={publishReport}
            republish={status === 'PUBLISHED'}
            unsavedNote={anyDirty}
            publishing={busy === 'publishing'}
            onConfirm={() => void confirmPublish()}
            onSeeReadiness={() => {
              setPublishOpen(false);
              setTab('readiness');
            }}
          />
        ) : null}
      </div>
    </EditorAssetsContext.Provider>
  );
}
