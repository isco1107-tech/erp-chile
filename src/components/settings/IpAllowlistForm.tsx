'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMyCurrentIpAction, updateIpAllowlistAction } from '@/lib/actions/company';
import type { CompanySettingsView } from '@/lib/services/company.service';

interface IpAllowlistFormProps {
  settings: CompanySettingsView;
}

export default function IpAllowlistForm({ settings }: IpAllowlistFormProps) {
  const [enabled, setEnabled] = useState(settings.ipAllowlistEnabled);
  const [entries, setEntries] = useState<string[]>(settings.ipAllowlist);
  const [newEntry, setNewEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);

  function addEntry(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (entries.includes(trimmed)) {
      toast.error('Esa IP ya está en la lista');
      return;
    }
    setEntries((prev) => [...prev, trimmed]);
    setNewEntry('');
  }

  function removeEntry(entry: string) {
    setEntries((prev) => prev.filter((e) => e !== entry));
  }

  async function handleAddMyIp() {
    setDetectingIp(true);
    try {
      const result = await getMyCurrentIpAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (!result.data) {
        toast.error('No se pudo detectar tu IP actual');
        return;
      }
      addEntry(result.data);
      toast.success(`Agregada: ${result.data}`);
    } finally {
      setDetectingIp(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateIpAllowlistAction({ enabled, entries });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="font-semibold">Restricción de acceso por IP</h2>
        <p className="text-sm text-muted-foreground">
          Solo permite iniciar sesión desde las direcciones IP o rangos que agregues acá. Aplica a todo el equipo, incluido el Dueño.
        </p>
      </div>

      {enabled && entries.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Sin ninguna IP agregada, nadie va a poder entrar la próxima vez que inicie sesión. Agrega al menos la tuya antes de guardar.</span>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="203.0.113.5 o 203.0.113.0/24"
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(newEntry); } }}
          />
          <Button type="button" variant="outline" onClick={() => addEntry(newEntry)}>Agregar</Button>
          <Button type="button" variant="outline" disabled={detectingIp} onClick={handleAddMyIp}>
            {detectingIp ? 'Detectando...' : 'Agregar mi IP'}
          </Button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin IPs agregadas.</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <li key={entry} className="flex items-center justify-between rounded-lg border border-input bg-muted/40 px-3 py-1.5 font-mono text-sm">
                {entry}
                <button type="button" onClick={() => removeEntry(entry)} className="text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Activar restricción por IP
      </label>

      <Button type="button" disabled={saving} onClick={handleSave}>
        {saving ? 'Guardando...' : 'Guardar'}
      </Button>
    </div>
  );
}
