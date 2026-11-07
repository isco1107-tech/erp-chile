'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, FlaskConical, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { updateAnalyticsModulesAction } from '@/modules/analytics/actions';

export default function AnalyticsModuleSettings({ analytics, science }: { analytics: boolean; science: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState({ analytics, science });
  const [saved, setSaved] = useState({ analytics, science });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = enabled.analytics !== saved.analytics || enabled.science !== saved.science;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await updateAnalyticsModulesAction(enabled);
      if (!result.success) { setError(result.error); return; }
      setEnabled(result.data);
      setSaved(result.data);
      toast.success('Módulos de datos actualizados');
      router.refresh();
    } catch {
      setError('No se pudieron guardar los módulos. Intenta nuevamente.');
    } finally { setSaving(false); }
  }

  return <section className="rounded-lg border border-border bg-card shadow-card" aria-labelledby="analytics-module-settings">
    <div className="border-b border-border p-5">
      <h2 id="analytics-module-settings" className="text-base font-semibold">Módulos de datos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Activa cada módulo por separado para esta empresa. Solo administradores y dueños pueden activarlos y consultar sus datos. Al desactivar un módulo se bloquean sus consultas.</p>
    </div>
    <div className="divide-y divide-border">
      <div className="flex items-center gap-3 p-5"><BarChart3 className="size-5 shrink-0 text-primary" aria-hidden /><div className="min-w-0 flex-1"><p className="text-sm font-medium">Data Analytics</p><p className="mt-1 text-xs text-muted-foreground">Indicadores, gráficos y actividad con actualización automática cada 15 segundos.</p></div><Switch checked={enabled.analytics} onCheckedChange={(analytics) => setEnabled((current) => ({ ...current, analytics }))} disabled={saving} label="Activar Data Analytics" /></div>
      <div className="flex items-center gap-3 p-5"><FlaskConical className="size-5 shrink-0 text-primary" aria-hidden /><div className="min-w-0 flex-1"><p className="text-sm font-medium">Data Science</p><p className="mt-1 text-xs text-muted-foreground">Proyecciones y detección de ventas atípicas, con método, historial mínimo e incertidumbre visibles.</p></div><Switch checked={enabled.science} onCheckedChange={(science) => setEnabled((current) => ({ ...current, science }))} disabled={saving} label="Activar Data Science" /></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5"><p className="text-xs text-muted-foreground">Las fuentes operativas siguen requiriendo su módulo y sus permisos.</p><Button type="button" onClick={() => void save()} disabled={saving || !dirty}>{saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}Guardar módulos de datos</Button></div>
    {error && <p role="alert" className="px-5 pb-5 text-sm text-destructive">{error}</p>}
  </section>;
}
