'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bot, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatRelative } from '@/lib/format';
import { publicUrl } from '@/lib/public-url';
import { createMcpTokenAction, revokeMcpTokenAction } from '@/modules/mcp/actions/mcp-tokens.actions';
import type { McpTokenSummary } from '@/modules/mcp/services/tokens.service';

interface Props {
  connectorEnabled: boolean;
  initialTokens: McpTokenSummary[];
}

/**
 * "Mis conectores de IA": cada quien genera y revoca sus propios tokens para
 * conectar un Claude o ChatGPT personal al ERP — autoservicio, sin permiso
 * especial (ver `mcp-tokens.actions.ts`). Solo visible/usable si la empresa
 * activó el conector en Configuración → Empresa.
 */
export default function McpTokensCard({ connectorEnabled, initialTokens }: Props) {
  const confirm = useConfirm();
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ id: string; token: string } | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Ponle un nombre para reconocerlo');
      return;
    }
    setCreating(true);
    try {
      const result = await createMcpTokenAction({ name: name.trim() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRevealed(result.data);
      setTokens((prev) => [{ id: result.data.id, name: name.trim(), createdAt: new Date(), lastUsedAt: null }, ...prev]);
      setName('');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, tokenName: string) {
    if (!(await confirm({ title: '¿Revocar este token?', description: `"${tokenName}" dejará de poder conectarse — la IA que lo use perderá el acceso de inmediato.`, confirmLabel: 'Revocar', destructive: true }))) return;
    const result = await revokeMcpTokenAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTokens((prev) => prev.filter((t) => t.id !== id));
    if (revealed?.id === id) setRevealed(null);
    toast.success(result.message);
  }

  if (!connectorEnabled) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Conectores de IA personales</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Tu empresa no ha activado esto todavía. Pídele al Dueño o a un Administrador que lo active en Configuración → Empresa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Conectores de IA personales</h2>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Genera un token para conectar tu Claude o ChatGPT personal a Aether: puede consultar datos que tú ya puedes ver y ayudarte a navegar el sistema, pero nunca puede crear, editar ni borrar nada. Servidor MCP: <code className="rounded bg-muted px-1 py-0.5 text-xs">{publicUrl('/api/mcp')}</code>
        </p>
      </div>

      {revealed && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-accent/40 p-3">
          <p className="text-xs font-medium text-foreground">Cópialo ahora — no se puede volver a mostrar.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate text-xs">{revealed.token}</code>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(revealed.token);
                toast.success('Token copiado');
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" /> Copiar
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="mcp-token-name">Nombre</Label>
          <Input id="mcp-token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude personal" maxLength={60} />
        </div>
        <Button type="button" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creando…' : 'Crear token'}
        </Button>
      </div>

      {tokens.length > 0 && (
        <ul className="divide-y divide-border">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  Creado {formatRelative(token.createdAt)} · {token.lastUsedAt ? `usado ${formatRelative(token.lastUsedAt)}` : 'nunca usado'}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => handleRevoke(token.id, token.name)}>
                <Trash2 className="size-3.5" aria-hidden="true" /> Revocar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
