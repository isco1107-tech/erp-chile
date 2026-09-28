'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ExternalLink, Globe, Loader2, Lock, RefreshCw, Save } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { parseBlocks, type WebSiteBlock, blockImageUrls } from '@/lib/web-sites/blocks';
import { htmlHints, sanitizeHtml, wrapHtmlDocument } from '@/lib/web-sites/html';
import { evaluateReadiness, type ReadinessReport } from '@/lib/web-sites/readiness';
import { KIND_INFO } from '@/lib/web-sites/templates';
import { parseTheme, type WebSiteTheme } from '@/lib/web-sites/theme';
import { siteSlugProblem, slugify } from '@/lib/web-sites/urls';
import { getWebSiteAction, publishWebSiteAction, saveWebSiteContentAction, unpublishWebSiteAction, updateWebSiteSettingsAction } from '@/modules/web-sites/actions/web-sites.actions';
import type { WebSiteDetail } from '@/modules/web-sites/services/web-sites.service';
import { AssetLibrary } from './AssetLibrary';
import { EditorTabs, tabId, tabPanelId, type EditorTabDef } from './EditorTabs';
import { GuidedEditor } from './GuidedEditor';
import { HtmlEditor } from './HtmlEditor';
import { PreviewPane } from './PreviewPane';
import { PublishDialog } from './PublishDialog';
import { ReadinessPanel } from './ReadinessPanel';
import { SettingsPanel } from './SettingsPanel';
import { ThemePanel } from './ThemePanel';
import WebSiteDomainPanel from './WebSiteDomainPanel';
import WebSiteMessagesPanel from './WebSiteMessagesPanel';
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

type Busy = 'saving' | 'publishing' | 'unpublishing' | 'settings' | null;

interface ContentSnapshot {
  blocks: string;
  theme: string;
  html: string;
}

/** Contenido tal como lo deja el servidor tras normalizarlo (mismo esquema): sirve para comparar sin ruido. */
function snapshotOf(content: { blocks: WebSiteBlock[]; theme: WebSiteTheme; html: string }): ContentSnapshot {
  return { blocks: JSON.stringify(parseBlocks(content.blocks)), theme: JSON.stringify(parseTheme(content.theme)), html: content.html };
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
    contactId: site.contactId,
  };
}

function formatMoment(value: Date | string): string {
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });
}

const NETWORK_ERROR = 'No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.';

export default function WebSiteEditor({ site, contacts, canWrite, canPublish, initialTab }: WebSiteEditorProps) {
  const confirm = useConfirm();
  const isGuided = site.mode === 'GUIDED';

  const [tab, setTab] = useState<EditorTab>(isEditorTab(initialTab) ? initialTab : 'content');
  const [status, setStatus] = useState(site.status);
  const [publishedAt, setPublishedAt] = useState<Date | string | null>(site.publishedAt);
  const [pendingChanges, setPendingChanges] = useState(site.pendingChanges);
  const [blocks, setBlocks] = useState<WebSiteBlock[]>(site.blocks);
  const [theme, setTheme] = useState<WebSiteTheme>(site.theme);
  const [html, setHtml] = useState(site.html);
  const [settings, setSettings] = useState<SettingsDraft>(() => draftOf(site));
  const [savedSettings, setSavedSettings] = useState<SettingsDraft>(() => draftOf(site));
  const [assets, setAssets] = useState<EditorAsset[]>(() => site.assets.map(({ id, url, fileName, mimeType, sizeBytes, alt }) => ({ id, url, fileName, mimeType, sizeBytes, alt })));
  const [version, setVersion] = useState(site.version);
  const [baseline, setBaseline] = useState<ContentSnapshot>(() => snapshotOf({ blocks: site.blocks, theme: site.theme, html: site.html }));
  const [contentDirty, setContentDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [conflict, setConflict] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [openId, setOpenId] = useState<string | null>(site.blocks[0]?.id ?? null);
  const [unread, setUnread] = useState(site.unreadMessages);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishReport, setPublishReport] = useState<ReadinessReport | null>(null);

  // Cada edición suma 1: si el usuario sigue escribiendo mientras se guarda, "sin guardar" no se apaga.
  const editSeq = useRef(0);
  const reloading = useRef(false);

  const archived = status === 'ARCHIVED';
  const readOnly = !canWrite || archived;
  const settingsDirty = !settingsEqual(settings, savedSettings);
  const anyDirty = contentDirty || settingsDirty;
  const publicBase = site.publicUrl.slice(0, Math.max(site.publicUrl.length - site.slug.length, 0));
  const publicUrl = `${publicBase}${savedSettings.slug}`;
  const platformUrl = useMemo(() => {
    try {
      return new URL(site.publicUrl).origin;
    } catch {
      return site.publicUrl;
    }
  }, [site.publicUrl]);

  // -------------------------------------------------------------------------
  // Edición
  // -------------------------------------------------------------------------

  const updateBlocks = useCallback((updater: (previous: WebSiteBlock[]) => WebSiteBlock[]) => {
    editSeq.current += 1;
    setBlocks(updater);
    setContentDirty(true);
  }, []);

  const updateTheme = useCallback((patch: Partial<WebSiteTheme>) => {
    editSeq.current += 1;
    setTheme((previous) => ({ ...previous, ...patch }));
    setContentDirty(true);
  }, []);

  const updateHtml = useCallback((next: string) => {
    editSeq.current += 1;
    setHtml(next);
    setContentDirty(true);
  }, []);

  const updateSettings = useCallback((patch: Partial<SettingsDraft>) => setSettings((previous) => ({ ...previous, ...patch })), []);

  const addAsset = useCallback((asset: EditorAsset) => setAssets((previous) => (previous.some((item) => item.id === asset.id) ? previous : [asset, ...previous])), []);

  const assetsContext = useMemo<EditorAssetsContextValue>(() => ({ siteId: site.id, assets, readOnly, addAsset }), [site.id, assets, readOnly, addAsset]);

  // -------------------------------------------------------------------------
  // Vista previa y "qué le falta" (con retraso: no se recalculan en cada tecla)
  // -------------------------------------------------------------------------

  const live = useMemo(
    () => ({ blocks, theme, html, name: settings.name, seoTitle: settings.seoTitle, seoDescription: settings.seoDescription, logoUrl: settings.logoUrl }),
    [blocks, theme, html, settings.name, settings.seoTitle, settings.seoDescription, settings.logoUrl]
  );
  const debounced = useDebouncedValue(live, 150);

  const report = useMemo(
    () => evaluateReadiness({ kind: site.kind, mode: site.mode, seoTitle: debounced.seoTitle, seoDescription: debounced.seoDescription, logoUrl: debounced.logoUrl, theme: debounced.theme, blocks: debounced.blocks, html: debounced.html }),
    [debounced, site.kind, site.mode]
  );
  const sanitized = useMemo(() => (isGuided ? null : sanitizeHtml(debounced.html)), [isGuided, debounced.html]);
  const hints = useMemo(() => (isGuided ? [] : htmlHints(debounced.html)), [isGuided, debounced.html]);
  const srcDoc = useMemo(
    () => (sanitized ? wrapHtmlDocument(sanitized.html, { title: debounced.seoTitle.trim() || debounced.name.trim() || site.name, description: debounced.seoDescription.trim() || null }) : ''),
    [sanitized, debounced.seoTitle, debounced.name, debounced.seoDescription, site.name]
  );

  // Imágenes en uso (con el contenido actual, guardado o no): no se dejan eliminar desde la biblioteca.
  const usedUrls = useMemo(() => new Set([...blocks.flatMap(blockImageUrls), settings.logoUrl, settings.ogImageUrl].filter(Boolean)), [blocks, settings.logoUrl, settings.ogImageUrl]);
  const isUsed = useCallback((url: string) => usedUrls.has(url) || (!isGuided && html.includes(url)), [usedUrls, isGuided, html]);

  // -------------------------------------------------------------------------
  // Guardar
  // -------------------------------------------------------------------------

  async function saveContent(): Promise<boolean> {
    const seq = editSeq.current;
    const payload = isGuided ? { blocks, theme } : { html };
    let result = await saveWebSiteContentAction(site.id, { ...payload, expectedUpdatedAt: version });
    if (!result.success && result.error.includes(CONFLICT_MARKER)) {
      // Guardar ajustes, publicar o cambiar el dominio también mueve la versión del sitio sin tocar el contenido:
      // si el contenido del servidor sigue siendo el que cargamos, no hubo edición ajena y se reintenta.
      const latest = await getWebSiteAction(site.id);
      if (latest.success && JSON.stringify(latest.data.blocks) === baseline.blocks && JSON.stringify(latest.data.theme) === baseline.theme && latest.data.html === baseline.html) {
        result = await saveWebSiteContentAction(site.id, { ...payload, expectedUpdatedAt: latest.data.version });
      }
    }
    if (!result.success) {
      if (result.error.includes(CONFLICT_MARKER)) setConflict(true);
      else toast.error(result.error);
      return false;
    }
    setVersion(result.data.version);
    setBaseline(snapshotOf({ blocks, theme, html }));
    if (editSeq.current === seq) setContentDirty(false);
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
      contactId: sent.contactId,
    });
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    const saved: SettingsDraft = { ...sent, slug: result.data.slug };
    setSavedSettings(saved);
    setSettings((current) => (settingsEqual(current, settings) ? saved : current));
    return true;
  }

  async function saveAll(): Promise<boolean> {
    if (readOnly || busy || conflict) return false;
    if (!anyDirty) return true;
    setBusy('saving');
    try {
      if (contentDirty && !(await saveContent())) return false;
      if (settingsDirty && !(await saveSettings())) return false;
      toast.success(settingsDirty && !contentDirty ? 'Ajustes guardados' : 'Borrador guardado');
      return true;
    } catch {
      toast.error(NETWORK_ERROR);
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
        void saveRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    setPublishReport(evaluateReadiness({ kind: site.kind, mode: site.mode, seoTitle: settings.seoTitle, seoDescription: settings.seoDescription, logoUrl: settings.logoUrl, theme, blocks, html }));
    setPublishOpen(true);
  }

  async function confirmPublish() {
    if (busy || conflict) return;
    setBusy('publishing');
    try {
      if (contentDirty && !(await saveContent())) {
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
    { id: 'design', label: 'Diseño' },
    { id: 'images', label: 'Imágenes' },
    { id: 'settings', label: 'Ajustes' },
    { id: 'readiness', label: 'Qué le falta', badge: report.blockers > 0 ? { text: String(report.blockers), tone: 'danger', description: ` (${report.blockers} pendiente${report.blockers === 1 ? '' : 's'} obligatorio${report.blockers === 1 ? '' : 's'})` } : null },
    { id: 'messages', label: 'Mensajes', badge: unread > 0 ? { text: String(unread), tone: 'info', description: ` (${unread} sin leer)` } : null },
  ];

  const canSaveDraft = canWrite && !archived;
  const nothingToPublish = status === 'PUBLISHED' && !pendingChanges && !contentDirty;

  const preview = (
    <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      {isGuided ? (
        <PreviewPane mode="GUIDED" device={device} onDeviceChange={setDevice} name={debounced.name || site.name} logoUrl={debounced.logoUrl || null} theme={debounced.theme} blocks={debounced.blocks} slug={savedSettings.slug} />
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
              <span aria-live="polite" className="flex items-center gap-1.5 text-xs font-medium text-warning">
                {anyDirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" /> Cambios sin guardar
                  </>
                ) : null}
              </span>
              {canSaveDraft ? (
                <Button type="button" variant="outline" disabled={!anyDirty || busy !== null || conflict} title="Guardar (Ctrl+S)" onClick={() => void saveAll()}>
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

        <EditorTabs tabs={tabs} active={tab} onChange={setTab} idPrefix={idPrefix} />

        <div role="tabpanel" id={tabPanelId(idPrefix)} aria-labelledby={tabId(idPrefix, tab)} tabIndex={0} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {tab === 'content' ? (
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0">
                {isGuided ? (
                  <GuidedEditor kind={site.kind} blocks={blocks} onBlocksChange={updateBlocks} openId={openId} onOpenChange={setOpenId} readOnly={readOnly} />
                ) : (
                  <HtmlEditor html={html} onChange={updateHtml} siteName={settings.name || site.name} removed={sanitized?.removed ?? []} hints={hints} readOnly={readOnly} />
                )}
              </div>
              {preview}
            </div>
          ) : null}

          {tab === 'design' ? (
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

          {tab === 'images' ? (
            <AssetLibrary
              isUsed={isUsed}
              onAltSaved={(assetId, alt) => setAssets((previous) => previous.map((asset) => (asset.id === assetId ? { ...asset, alt } : asset)))}
              onDeleted={(assetId) => setAssets((previous) => previous.filter((asset) => asset.id !== assetId))}
            />
          ) : null}

          {tab === 'settings' ? (
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

          {tab === 'readiness' ? (
            <div className="max-w-3xl">
              <ReadinessPanel report={report} mode={site.mode} onGo={setTab} />
            </div>
          ) : null}

          {tab === 'messages' ? <WebSiteMessagesPanel siteId={site.id} canWrite={canWrite} onUnreadChange={setUnread} /> : null}
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
