'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Role } from '@prisma/client';
import type { CompanyMember } from '@/lib/services/users.service';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { changeMemberRoleAction, listMembersAction, removeMemberAction } from '@/lib/actions/users';
import { ROLES, ROLE_BADGE_CLASS, ROLE_LABELS } from '@/lib/auth/roles';

/**
 * Personas de otras empresas que trabajan en esta con membresía
 * (Multiempresa): su cuenta vive en su empresa hogar, acá solo se decide con
 * qué rol entran y si siguen teniendo acceso.
 */
export function CompanyMembersTable({ multiCompanyEnabled }: { multiCompanyEnabled: boolean }) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<CompanyMember[] | null>(null);

  async function load() {
    const result = await listMembersAction();
    if (result.success) setMembers(result.data);
    else {
      toast.error(result.error);
      setMembers([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRoleChange(member: CompanyMember, role: Role) {
    const result = await changeMemberRoleAction({ membershipId: member.membershipId, role });
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Rol actualizado');
    await load();
  }

  async function handleRemove(member: CompanyMember) {
    const ok = await confirm({
      title: `Quitar a ${member.name} de esta empresa`,
      description: 'Pierde el acceso a esta empresa de inmediato y se cierran sus sesiones, avisos y conectores de IA de aquí. Su cuenta y su acceso a su propia empresa no cambian.',
      confirmLabel: 'Quitar acceso',
      destructive: true,
    });
    if (!ok) return;
    const result = await removeMemberAction(member.membershipId);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Acceso retirado');
    await load();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {multiCompanyEnabled
          ? 'Personas que ya tienen cuenta en otra empresa y trabajan también en esta. Para sumar a alguien, invítalo con su correo de siempre: al aceptar, entra con su misma contraseña.'
          : 'Con el módulo Multiempresa puedes sumar a personas que ya tienen cuenta en otra empresa (una contadora externa, un socio con dos empresas) sin crearles otra cuenta.'}
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[680px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Nombre</th>
              <th className="p-2 font-medium">Correo</th>
              <th className="p-2 font-medium">Rol aquí</th>
              <th className="p-2 font-medium">Estado</th>
              <th className="p-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {members === null && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Cargando...</td></tr>
            )}
            {members?.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Nadie de otra empresa trabaja aquí todavía</td></tr>
            )}
            {members?.map((member) => (
              <tr key={member.membershipId} className="border-t border-border">
                <td className="p-2">{member.name}</td>
                <td className="p-2">{member.email}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[member.role]}`}>
                      {member.customRoleName ?? ROLE_LABELS[member.role]}
                    </span>
                    <select
                      aria-label={`Rol de ${member.name} en esta empresa`}
                      className="h-7 rounded-lg border border-input bg-transparent px-1.5 text-xs outline-none dark:bg-input/30"
                      value={member.role}
                      onChange={(event) => handleRoleChange(member, event.target.value as Role)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${member.isActive ? 'bg-success-soft text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {member.isActive ? 'Activo' : 'Suspendido en su empresa'}
                  </span>
                </td>
                <td className="p-2">
                  <Button type="button" size="sm" variant="destructive" onClick={() => handleRemove(member)}>
                    Quitar acceso
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
