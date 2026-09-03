'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteCustomRoleAction } from '@/modules/roles/actions/roles.actions';

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  permissionLabels: string[];
}

export default function RolesTable({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(role: RoleRow) {
    if (!confirm(`¿Eliminar el rol "${role.name}"?`)) return;
    setDeleting(role.id);
    try {
      const result = await deleteCustomRoleAction(role.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Rol eliminado');
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (roles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Todavía no has creado roles personalizados. Tus colaboradores usan los roles base (Vendedor, Bodeguero,
          Contador).
        </p>
        <Link href="/dashboard/settings/roles/new" className="mt-2 inline-block text-sm underline underline-offset-4">
          Crear el primero
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] table-auto text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2 font-medium">Rol</th>
            <th className="p-2 font-medium">Permisos</th>
            <th className="p-2 font-medium">Colaboradores</th>
            <th className="p-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-t border-border align-top">
              <td className="p-2">
                <p className="font-medium">{role.name}</p>
                {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {role.permissionLabels.map((label) => (
                    <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-xs">{label}</span>
                  ))}
                </div>
              </td>
              <td className="p-2">{role.userCount}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/settings/roles/${role.id}`}
                    className="rounded-lg border border-input px-2 py-1 text-xs hover:bg-muted"
                  >
                    Editar
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={deleting === role.id}
                    onClick={() => handleDelete(role)}
                  >
                    Eliminar
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
