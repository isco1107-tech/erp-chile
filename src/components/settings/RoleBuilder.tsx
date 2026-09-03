'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCustomRoleAction, updateCustomRoleAction } from '@/modules/roles/actions/roles.actions';
import type { PermissionGroup } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';

interface Props {
  groups: PermissionGroup[];
  planName: string;
  /** Presente al editar; ausente al crear. */
  role?: { id: string; name: string; description: string | null; permissions: string[] };
}

export default function RoleBuilder({ groups, planName, role }: Props) {
  const router = useRouter();

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);

  function toggle(permission: Permission) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const permission of group.permissions) {
        if (checked) next.add(permission.key);
        else next.delete(permission.key);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Ingrese un nombre para el rol');
      return;
    }
    if (selected.size === 0) {
      toast.error('Seleccione al menos un permiso');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      permissions: Array.from(selected),
    };

    setSaving(true);
    try {
      const result = role
        ? await updateCustomRoleAction(role.id, payload)
        : await createCustomRoleAction(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Rol guardado');
      router.push('/dashboard/settings/roles');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="role-name">Nombre del rol</Label>
          <Input
            id="role-name"
            value={name}
            placeholder="Ej: Vendedor Mostrador"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="role-description">Descripción (opcional)</Label>
          <Input
            id="role-description"
            value={description}
            placeholder="Qué hace esta persona en el día a día"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const allChecked = group.permissions.every((p) => selected.has(p.key));
          return (
            <div key={group.key} className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => toggleGroup(group, !allChecked)}
                >
                  {allChecked ? 'Quitar todos' : 'Marcar todos'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <label
                    key={permission.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(permission.key)}
                      onChange={() => toggle(permission.key)}
                    />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Solo se muestran los permisos de los módulos incluidos en tu plan {planName}. Si contratas un módulo nuevo,
        sus permisos aparecerán aquí automáticamente.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/settings/roles')}>
          Cancelar
        </Button>
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando...' : role ? 'Guardar cambios' : 'Crear Rol'}
        </Button>
      </div>
    </div>
  );
}
