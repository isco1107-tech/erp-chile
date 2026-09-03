'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getUserProfileAction,
  listJobPositionsForSelfAction,
  updateMyJobPositionAction,
  updateMyPhoneAction,
  type UserProfile,
} from '@/lib/actions/profile';
import type { JobPositionWithUsage } from '@/modules/org-chart/services/org-chart.service';
import { ACTION_LABELS } from '@/lib/auth/audit-labels';
import { phoneSchema } from '@/lib/phone';
import { formatRelative } from '@/lib/format';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

async function uploadMyPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/org-chart/photo-upload', { method: 'POST', body: form });
  const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
  if (!json.success || !json.data) throw new Error(json.error ?? 'No se pudo subir la foto');
  return json.data.url;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function ProfileClient() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [jobPositions, setJobPositions] = useState<JobPositionWithUsage[]>([]);
  const [jobPositionId, setJobPositionId] = useState('');
  const [savingJobPosition, setSavingJobPosition] = useState(false);

  async function load() {
    setLoading(true);
    const result = await getUserProfileAction();
    if (result.success) {
      setProfile(result.data);
      setPhone(result.data.phone ?? '');
      setPhotoUrl(result.data.photoUrl);
      setJobPositionId(result.data.jobPositionId ?? '');
      if (result.data.orgChartEnabled) {
        const positionsResult = await listJobPositionsForSelfAction();
        if (positionsResult.success) setJobPositions(positionsResult.data);
      }
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadMyPhoto(file);
      setPhotoUrl(url);
      toast.success('Foto actualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function handleSaveJobPosition() {
    setSavingJobPosition(true);
    try {
      const result = await updateMyJobPositionAction({ jobPositionId: jobPositionId || null });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cargo actualizado');
      load();
    } finally {
      setSavingJobPosition(false);
    }
  }

  const phoneCheck = phoneSchema.safeParse(phone);
  const phoneError = !phoneCheck.success ? phoneCheck.error.issues[0]?.message : null;

  async function handleSavePhone() {
    if (!phoneCheck.success) return;
    setSaving(true);
    try {
      const result = await updateMyPhoneAction({ phone });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Teléfono actualizado');
      load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>;
  if (!profile) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border p-4">
        <div>
          <h2 className="font-semibold">Identificación</h2>
          <p className="text-sm text-muted-foreground">
            {profile.name} · {profile.roleLabel}
            {profile.customRoleName ? ` (${profile.customRoleName})` : ''}
          </p>
          <p className="text-sm text-muted-foreground">{profile.companyName}</p>
          <p className="text-xs text-muted-foreground">
            En la plataforma desde {new Date(profile.createdAt).toLocaleDateString('es-CL')}
          </p>
        </div>

        <div>
          <Label>Correo electrónico</Label>
          <p className="text-sm">{profile.email}</p>
        </div>

        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="phone"
              placeholder="+56912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={Boolean(phoneError)}
            />
            <Button
              type="button"
              size="sm"
              disabled={saving || !phoneCheck.success || phone === (profile.phone ?? '')}
              onClick={handleSavePhone}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
          {phoneError ? (
            <p className="mt-1 text-xs text-destructive">{phoneError}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Con código de país (ej: +56912345678). Se usa para que el Dueño o un Administrador pueda contactarte por WhatsApp.
            </p>
          )}
        </div>

        {profile.orgChartEnabled && (
          <>
            <div>
              <Label>Mi foto</Label>
              <div className="mt-1 flex items-center gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt={profile.name} className="size-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">{initials(profile.name)}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {uploadingPhoto ? 'Subiendo...' : photoUrl ? 'Cambiar foto' : 'Subir foto'}
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG, JPG o WEBP, hasta 5 MB.</p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="jobPosition">Mi cargo</Label>
              <div className="mt-1 flex gap-2">
                <select
                  id="jobPosition"
                  className={selectClass}
                  value={jobPositionId}
                  onChange={(e) => setJobPositionId(e.target.value)}
                >
                  <option value="">— Sin cargo —</option>
                  {jobPositions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingJobPosition || jobPositionId === (profile.jobPositionId ?? '')}
                  onClick={handleSaveJobPosition}
                >
                  {savingJobPosition ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Elige tu cargo del catálogo de tu empresa. Se muestra en el organigrama.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Actividad reciente</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Último inicio de sesión</p>
            <p>{profile.activity.lastLoginAt ? formatRelative(new Date(profile.activity.lastLoginAt)) : 'Sin registro'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dispositivos activos</p>
            <p className="flex items-center gap-1"><Laptop className="size-3.5" /> {profile.activity.activeSessionCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Visto por última vez</p>
            <p>{profile.activity.lastSeenAt ? formatRelative(new Date(profile.activity.lastSeenAt)) : 'Sin sesión activa'}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Últimas acciones</p>
          {profile.activity.recentActions.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
          )}
          <ul className="space-y-1.5">
            {profile.activity.recentActions.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{ACTION_LABELS[a.action]} · {a.entity}</span>
                <span className="text-xs text-muted-foreground">{formatRelative(new Date(a.createdAt))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
