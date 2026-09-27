'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { updateMcpConnectorEnabledAction } from '@/modules/mcp/actions/mcp-settings.actions';

interface Props {
  initialEnabled: boolean;
}

/**
 * Interruptor de empresa: deja que cualquier usuario se genere un token
 * personal (Configuración → Mi Perfil) para conectar su propio Claude o
 * ChatGPT al ERP. Apagado por defecto — ver `mcp-settings.actions.ts`.
 */
export default function McpConnectorForm({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setEnabled(next);
    setSaving(true);
    try {
      const result = await updateMcpConnectorEnabledAction({ enabled: next });
      if (!result.success) {
        toast.error(result.error);
        setEnabled(!next);
        return;
      }
      toast.success(result.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Conector MCP (IA personal)</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Deja que cada persona del equipo conecte su propio Claude o ChatGPT al ERP (con su propio token, desde su perfil) para consultar datos y pedir ayuda para navegar el sistema — de solo lectura, nunca puede crear ni editar nada. Al activarlo, lo que cada persona le pregunte a su IA sale de la empresa hacia la cuenta personal de Anthropic u OpenAI de esa persona, fuera del control de la empresa.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} label="Activar conector MCP" />
      </div>
    </div>
  );
}
