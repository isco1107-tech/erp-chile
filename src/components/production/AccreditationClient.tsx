'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AccreditationLevel, BadgeBackgroundMode, BadgeImageDisplayMode, BadgeTemplate, StaffAccreditation } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { Trash2, CheckCircle2, Mail, Download, Palette, Star, Loader2 } from 'lucide-react';
import {
  checkInStaffAction,
  createBadgeTemplateAction,
  createStaffAccreditationAction,
  deleteBadgeTemplateAction,
  deleteStaffAccreditationAction,
  listBadgeTemplatesAction,
  listProductionProjectOptionsAction,
  listStaffAccreditationsAction,
  resendAccreditationQrAction,
  updateBadgeTemplateAction,
} from '@/modules/production/actions/production.actions';
import type { ProductionProjectOption } from '@/modules/production/services/production.service';
import {
  ACCREDITATION_LEVELS,
  ACCREDITATION_LEVEL_LABELS,
  BADGE_BACKGROUND_MODES,
  BADGE_BACKGROUND_MODE_LABELS,
  BADGE_IMAGE_DISPLAY_MODES,
  BADGE_IMAGE_DISPLAY_MODE_LABELS,
} from '@/modules/production/schema';

const LEVEL_TONE: Record<AccreditationLevel, Tone> = { GENERAL: 'neutral', BACKSTAGE: 'info', VIP: 'accent', STAFF: 'success' };

/** Poll cada 5s: la puerta de acceso necesita ver check-ins de otras terminales sin refrescar manualmente. */
const POLL_MS = 5000;

const EMPTY_TEMPLATE_FORM = {
  name: '',
  backgroundMode: 'COLOR' as BadgeBackgroundMode,
  backgroundColor: '#1e3a5f',
  backgroundImageUrl: '',
  imageDisplayMode: 'SOLID' as BadgeImageDisplayMode,
  watermarkOpacityBps: 2000,
  accentColor: '#1e3a5f',
  textColor: '#0f172a',
  isDefault: false,
};

interface BadgeBackgroundUploadResponse {
  success: boolean;
  data?: { url: string };
  error?: string;
}

async function uploadBadgeBackground(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/production/badge-templates/background-upload', { method: 'POST', body: form });
  const json = (await res.json()) as BadgeBackgroundUploadResponse;
  if (!json.success || !json.data) throw new Error(json.error ?? 'No se pudo subir la imagen');
  return json.data.url;
}

export default function AccreditationClient({ canWrite, canDesign }: { canWrite: boolean; canDesign: boolean }) {
  const [projects, setProjects] = useState<ProductionProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<StaffAccreditation[]>([]);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccreditationLevel>('GENERAL');
  const [badgeCode, setBadgeCode] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<BadgeTemplate[]>([]);
  const [showDesign, setShowDesign] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    listProductionProjectOptionsAction().then((result) => {
      if (result.success) {
        setProjects(result.data);
        if (result.data.length > 0) setProjectId(result.data[0]!.id);
      }
    });
  }, []);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const result = await listStaffAccreditationsAction(projectId);
    if (result.success) setItems(result.data);
  }, [projectId]);

  const reloadTemplates = useCallback(async () => {
    if (!projectId) return;
    const result = await listBadgeTemplatesAction(projectId);
    if (result.success) {
      setTemplates(result.data);
      setTemplateId((current) => (current && result.data.some((t) => t.id === current) ? current : (result.data.find((t) => t.isDefault)?.id ?? '')));
    }
  }, [projectId]);

  useEffect(() => {
    reload();
    reloadTemplates();
  }, [projectId, reload, reloadTemplates]);

  useEffect(() => {
    if (!projectId) return;
    const interval = setInterval(reload, POLL_MS);
    return () => clearInterval(interval);
  }, [projectId, reload]);

  async function handleAdd() {
    if (!fullName.trim() || !role.trim() || !badgeCode.trim()) {
      toast.error('Nombre, rol y código de acreditación son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const result = await createStaffAccreditationAction({
        projectId,
        fullName,
        role,
        organization: organization || undefined,
        email: email || undefined,
        accessLevel,
        badgeCode,
        templateId: templateId || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      setFullName('');
      setRole('');
      setOrganization('');
      setEmail('');
      setBadgeCode('');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  function startEditTemplate(t: BadgeTemplate | null) {
    if (t) {
      setEditingTemplateId(t.id);
      setTemplateForm({
        name: t.name,
        backgroundMode: t.backgroundMode,
        backgroundColor: t.backgroundColor,
        backgroundImageUrl: t.backgroundImageUrl ?? '',
        imageDisplayMode: t.imageDisplayMode,
        watermarkOpacityBps: t.watermarkOpacityBps,
        accentColor: t.accentColor,
        textColor: t.textColor,
        isDefault: t.isDefault,
      });
    } else {
      setEditingTemplateId(null);
      setTemplateForm(EMPTY_TEMPLATE_FORM);
    }
  }

  async function handleTemplateBackgroundChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      const url = await uploadBadgeBackground(file);
      setTemplateForm((f) => ({ ...f, backgroundImageUrl: url }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen');
    } finally {
      setUploadingBg(false);
      e.target.value = '';
    }
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim()) {
      toast.error('El nombre de la plantilla es obligatorio');
      return;
    }
    if (templateForm.backgroundMode === 'IMAGE' && !templateForm.backgroundImageUrl) {
      toast.error('Suba una imagen de fondo o cambie a color sólido');
      return;
    }
    setSavingTemplate(true);
    try {
      // En creación, un `backgroundImageUrl` vacío debe omitirse (el schema de creación exige URL válida u `undefined`).
      // En edición, en cambio, sí debe mandarse `''` para limpiar una imagen previa al volver a color sólido — `undefined` ahí significa "no tocar" y dejaría la URL vieja huérfana en la fila.
      const clearedImageUrl = editingTemplateId ? '' : undefined;
      const payload = {
        ...templateForm,
        backgroundImageUrl: templateForm.backgroundMode === 'IMAGE' ? templateForm.backgroundImageUrl || undefined : clearedImageUrl,
      };
      const result = editingTemplateId
        ? await updateBadgeTemplateAction(editingTemplateId, payload)
        : await createBadgeTemplateAction({ projectId, ...payload });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Plantilla guardada');
      startEditTemplate(null);
      await reloadTemplates();
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    const result = await deleteBadgeTemplateAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    if (editingTemplateId === id) startEditTemplate(null);
    await reloadTemplates();
  }

  async function handleResendQr(id: string) {
    setBusyId(id);
    try {
      const result = await resendAccreditationQrAction(id);
      if (!result.success) toast.error(result.error);
      else if (result.message) toast.success(result.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCheckIn(id: string) {
    setBusyId(id);
    try {
      const result = await checkInStaffAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const result = await deleteStaffAccreditationAction(id);
      if (!result.success) toast.error(result.error);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<StaffAccreditation>[] = [
    { id: 'name', header: 'Nombre', cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { id: 'role', header: 'Rol', cell: (r) => r.role },
    { id: 'org', header: 'Empresa/Proveedor', cell: (r) => r.organization || '—' },
    { id: 'level', header: 'Nivel', cell: (r) => <StatusBadge tone={LEVEL_TONE[r.accessLevel]}>{ACCREDITATION_LEVEL_LABELS[r.accessLevel]}</StatusBadge> },
    { id: 'badge', header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.badgeCode}</span> },
    {
      id: 'checkin',
      header: 'Ingreso',
      cell: (r) =>
        r.checkedInAt ? (
          <StatusBadge tone="success">{new Date(r.checkedInAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</StatusBadge>
        ) : canWrite ? (
          <Button type="button" size="xs" variant="outline" disabled={busyId === r.id} onClick={() => handleCheckIn(r.id)}>
            <CheckCircle2 className="mr-1 size-3.5" /> Check-in
          </Button>
        ) : (
          <StatusBadge tone="neutral">Sin ingreso</StatusBadge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label htmlFor="accred-project">Certamen</Label>
          <select
            id="accred-project"
            className="h-10 w-full max-w-sm rounded-xl border border-input bg-muted px-3 text-sm text-foreground"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
        </div>
        {canDesign && projectId && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowDesign((v) => !v)}>
            <Palette /> Diseño de credencial
          </Button>
        )}
      </div>

      {showDesign && canDesign && projectId && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => startEditTemplate(t)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${editingTemplateId === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted'}`}
              >
                {t.isDefault && <Star className="size-3 fill-current" />}
                {t.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => startEditTemplate(null)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${editingTemplateId === null ? 'border-primary bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted'}`}
            >
              + Nueva plantilla
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <Label htmlFor="tpl-name">Nombre</Label>
              <Input id="tpl-name" value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} placeholder="VIP, General..." />
            </div>
            <div>
              <Label htmlFor="tpl-bg-mode">Fondo</Label>
              <select
                id="tpl-bg-mode"
                className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground"
                value={templateForm.backgroundMode}
                onChange={(e) => setTemplateForm((f) => ({ ...f, backgroundMode: e.target.value as BadgeBackgroundMode }))}
              >
                {BADGE_BACKGROUND_MODES.map((m) => (
                  <option key={m} value={m}>{BADGE_BACKGROUND_MODE_LABELS[m]}</option>
                ))}
              </select>
            </div>

            {templateForm.backgroundMode === 'COLOR' ? (
              <div>
                <Label htmlFor="tpl-bg-color">Color de fondo</Label>
                <input
                  id="tpl-bg-color"
                  type="color"
                  className="h-10 w-full rounded-xl border border-input bg-muted"
                  value={templateForm.backgroundColor}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, backgroundColor: e.target.value }))}
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="tpl-bg-image">Imagen de fondo</Label>
                  <input id="tpl-bg-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleTemplateBackgroundChange} disabled={uploadingBg} className="text-xs" />
                  {uploadingBg && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />}
                  {templateForm.backgroundImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={templateForm.backgroundImageUrl} alt="" className="mt-2 h-16 w-full rounded-lg border border-border object-cover" />
                  )}
                </div>
                <div>
                  <Label htmlFor="tpl-display-mode">Modo de imagen</Label>
                  <select
                    id="tpl-display-mode"
                    className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground"
                    value={templateForm.imageDisplayMode}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, imageDisplayMode: e.target.value as BadgeImageDisplayMode }))}
                  >
                    {BADGE_IMAGE_DISPLAY_MODES.map((m) => (
                      <option key={m} value={m}>{BADGE_IMAGE_DISPLAY_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
                {templateForm.imageDisplayMode === 'WATERMARK' && (
                  <div>
                    <Label htmlFor="tpl-opacity">Opacidad ({Math.round(templateForm.watermarkOpacityBps / 100)}%)</Label>
                    <input
                      id="tpl-opacity"
                      type="range"
                      min={0}
                      max={10000}
                      step={500}
                      value={templateForm.watermarkOpacityBps}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, watermarkOpacityBps: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <Label htmlFor="tpl-accent">Color de acento</Label>
              <input id="tpl-accent" type="color" className="h-10 w-full rounded-xl border border-input bg-muted" value={templateForm.accentColor} onChange={(e) => setTemplateForm((f) => ({ ...f, accentColor: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tpl-text">Color de texto</Label>
              <input id="tpl-text" type="color" className="h-10 w-full rounded-xl border border-input bg-muted" value={templateForm.textColor} onChange={(e) => setTemplateForm((f) => ({ ...f, textColor: e.target.value }))} />
            </div>

            <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-4">
              <input type="checkbox" checked={templateForm.isDefault} onChange={(e) => setTemplateForm((f) => ({ ...f, isDefault: e.target.checked }))} />
              Usar como plantilla por defecto de este certamen
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleSaveTemplate} disabled={savingTemplate}>
              {savingTemplate ? 'Guardando...' : editingTemplateId ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
            {editingTemplateId && (
              <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteTemplate(editingTemplateId)}>
                <Trash2 /> Eliminar
              </Button>
            )}
          </div>
        </div>
      )}

      {canWrite && projectId && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-6 sm:items-end">
          <div>
            <Label htmlFor="acc-name">Nombre</Label>
            <Input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="acc-role">Rol</Label>
            <Input id="acc-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Camarógrafo" />
          </div>
          <div>
            <Label htmlFor="acc-org">Empresa/Proveedor</Label>
            <Input id="acc-org" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="acc-email">Correo (envía QR)</Label>
            <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.cl" />
          </div>
          <div>
            <Label htmlFor="acc-level">Nivel de acceso</Label>
            <select id="acc-level" className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground" value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as AccreditationLevel)}>
              {ACCREDITATION_LEVELS.map((level) => (
                <option key={level} value={level}>{ACCREDITATION_LEVEL_LABELS[level]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="acc-badge">Código de acreditación</Label>
            <Input id="acc-badge" value={badgeCode} onChange={(e) => setBadgeCode(e.target.value)} placeholder="STAFF-042" />
          </div>
          {templates.length > 0 && (
            <div>
              <Label htmlFor="acc-template">Diseño de credencial</Label>
              <select id="acc-template" className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Predeterminado del certamen</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving} className="sm:col-span-6 sm:w-fit">
            {saving ? 'Creando...' : 'Acreditar'}
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={items}
        getRowId={(r) => r.id}
        emptyTitle="Sin acreditaciones todavía"
        rowActions={(row) => (
          <div className="flex items-center gap-1">
            <a
              href={`/api/production/accreditation/${row.id}/badge`}
              target="_blank"
              rel="noopener noreferrer"
              title="Descargar credencial"
              className="inline-flex size-6 items-center justify-center rounded-[min(var(--radius-md),10px)] border border-border bg-foreground/[0.04] text-foreground hover:border-primary/40 hover:bg-primary/[0.08] hover:text-primary [&_svg]:size-3"
            >
              <Download />
            </a>
            {canWrite && row.email && (
              <Button type="button" size="icon-xs" variant="outline" title={`Reenviar QR a ${row.email}`} disabled={busyId === row.id} onClick={() => handleResendQr(row.id)}>
                <Mail />
              </Button>
            )}
            {canWrite && (
              <Button type="button" size="icon-xs" variant="destructive" disabled={busyId === row.id} onClick={() => handleDelete(row.id)}>
                <Trash2 />
              </Button>
            )}
          </div>
        )}
      />
    </div>
  );
}
