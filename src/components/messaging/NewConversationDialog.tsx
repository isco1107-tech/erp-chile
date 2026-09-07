'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  listCompanyUsersForChatAction,
  startDirectConversationAction,
  startGroupConversationAction,
} from '@/modules/messaging/actions/messaging.actions';
import type { CompanyChatUser } from '@/modules/messaging/services/messaging.service';

export default function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}) {
  const [users, setUsers] = useState<CompanyChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsGroup(false);
    setGroupName('');
    setSelectedIds([]);
    setLoading(true);
    listCompanyUsersForChatAction().then((result) => {
      if (result.success) setUsers(result.data);
      setLoading(false);
    });
  }, [open]);

  function toggleSelected(userId: string) {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleStartDirect(userId: string) {
    setSubmitting(true);
    setError(null);
    const result = await startDirectConversationAction({ otherUserId: userId });
    setSubmitting(false);
    if (!result.success) return setError(result.error);
    onCreated(result.data.id);
    onOpenChange(false);
  }

  async function handleCreateGroup() {
    setSubmitting(true);
    setError(null);
    const result = await startGroupConversationAction({ name: groupName, participantIds: selectedIds });
    setSubmitting(false);
    if (!result.success) return setError(result.error);
    onCreated(result.data.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
          <DialogDescription>Escribe a una persona de tu equipo, o crea un grupo.</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setIsGroup(false)}
            className={cn('flex-1 rounded-md py-1.5 text-sm font-medium transition-colors', !isGroup ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            Directo
          </button>
          <button
            type="button"
            onClick={() => setIsGroup(true)}
            className={cn('flex-1 rounded-md py-1.5 text-sm font-medium transition-colors', isGroup ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            Grupo
          </button>
        </div>

        {isGroup && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nombre del grupo"
            className="mb-3 h-10 w-full rounded-xl border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        )}

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {loading && <p className="p-4 text-center text-sm text-muted-foreground">Cargando equipo...</p>}
          {!loading && users.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No hay otras personas en tu equipo todavía</p>
          )}
          {!loading &&
            users.map((u) => {
              const selected = selectedIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => (isGroup ? toggleSelected(u.id) : handleStartDirect(u.id))}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50',
                    isGroup && selected && 'bg-accent/10'
                  )}
                >
                  {isGroup && (
                    <input type="checkbox" checked={selected} onChange={() => toggleSelected(u.id)} className="size-4 shrink-0" />
                  )}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                </button>
              );
            })}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {isGroup && (
          <DialogFooter>
            <DialogClose className="rounded-xl border border-input px-4 py-2 text-sm hover:bg-muted">Cancelar</DialogClose>
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={submitting || !groupName.trim() || selectedIds.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Users className="size-4" />
              Crear grupo
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
