'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getRegistrationSettingsAction,
  updateRegistrationSettingsAction,
} from '@/modules/candidates/actions/candidates.actions';
import { CANDIDATE_REGISTRATION_STATUSES, CANDIDATE_REGISTRATION_STATUS_LABELS } from '@/modules/candidates/schema';
import type { RegistrationSettings } from '@/modules/candidates/services/candidates.service';

const selectClass =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 16);
}

/**
 * Configuración de la ventana de postulación de una convocatoria (Sección 6:
 * "Gestión de convocatorias: crear, abrir, cerrar" + "contador de
 * postulaciones recibidas"). El `Project` cumple el rol de "convocatoria" —
 * ver nota de arquitectura en `candidates.service.ts`.
 */
export default function RegistrationSettingsButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    const result = await getRegistrationSettingsAction(projectId);
    if (!result.success) {
      toast.error(result.error);
      setOpen(false);
    } else {
      setSettings(result.data);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    const result = await updateRegistrationSettingsAction(projectId, {
      registrationStatus: settings.registrationStatus,
      registrationOpensAt: settings.registrationOpensAt,
      registrationClosesAt: settings.registrationClosesAt,
      minCandidateAge: settings.minCandidateAge,
      maxCandidates: settings.maxCandidates,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Convocatoria actualizada');
    setSettings(result.data);
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={handleOpen}>
        <Settings2 /> Convocatoria
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración de la convocatoria</DialogTitle>
        </DialogHeader>

        {loading || !settings ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {settings.applicationsReceived} postulación{settings.applicationsReceived === 1 ? '' : 'es'} recibida{settings.applicationsReceived === 1 ? '' : 's'}
              {settings.maxCandidates ? ` de ${settings.maxCandidates} cupos` : ''}.
            </p>

            <div>
              <Label htmlFor="reg-status">Estado de la convocatoria</Label>
              <select
                id="reg-status"
                className={selectClass}
                value={settings.registrationStatus}
                onChange={(e) => setSettings({ ...settings, registrationStatus: e.target.value as RegistrationSettings['registrationStatus'] })}
              >
                {CANDIDATE_REGISTRATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{CANDIDATE_REGISTRATION_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="reg-opens">Apertura</Label>
                <Input
                  id="reg-opens"
                  type="datetime-local"
                  value={toDateInputValue(settings.registrationOpensAt)}
                  onChange={(e) => setSettings({ ...settings, registrationOpensAt: e.target.value ? new Date(e.target.value) : null })}
                />
              </div>
              <div>
                <Label htmlFor="reg-closes">Cierre</Label>
                <Input
                  id="reg-closes"
                  type="datetime-local"
                  value={toDateInputValue(settings.registrationClosesAt)}
                  onChange={(e) => setSettings({ ...settings, registrationClosesAt: e.target.value ? new Date(e.target.value) : null })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="reg-min-age">Edad mínima</Label>
                <Input
                  id="reg-min-age"
                  type="number"
                  min={1}
                  max={99}
                  value={settings.minCandidateAge}
                  onChange={(e) => setSettings({ ...settings, minCandidateAge: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="reg-max">Cupo máximo (opcional)</Label>
                <Input
                  id="reg-max"
                  type="number"
                  min={1}
                  value={settings.maxCandidates ?? ''}
                  onChange={(e) => setSettings({ ...settings, maxCandidates: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading || !settings}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
