'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROLES, ROLE_LABELS } from '@/lib/auth/roles';
import {
  grantCompanyMembershipAction,
  listTenantMembershipsAction,
  revokeCompanyMembershipAction,
  type TenantMembership,
} from '@/modules/platform/actions/platform.actions';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

/**
 * Vincular enciende `hasMultiCompany` en esta empresa (ver
 * `grantCompanyMembership`); si después se apaga el módulo desde
 * `TenantModulesForm`, las membresías quedan guardadas pero inactivas.
 */
export default function TenantMembershipsForm({ companyId }: { companyId: string }) {
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('ADMIN');
  const [saving, setSaving] = useState(false);

  function reload() {
    listTenantMembershipsAction(companyId).then((r) => {
      if (r.success) setMemberships(r.data);
      setLoading(false);
    });
  }

  useEffect(reload, [companyId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    const result = await grantCompanyMembershipAction(companyId, email, role);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Acceso otorgado');
    setEmail('');
    reload();
  }

  async function handleRevoke(membershipId: string) {
    const result = await revokeCompanyMembershipAction(companyId, membershipId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Acceso revocado');
    reload();
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <h2 className="mb-1 text-sm font-semibold">Administración multiempresa</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Vincula a un usuario que YA tiene cuenta en otra empresa para que también pueda administrar esta, cambiando de
        empresa activa — sin crear una cuenta nueva. Al vincular se activa el módulo &quot;Administración Multiempresa&quot; en
        esta empresa y, al iniciar sesión, esa persona elige en qué empresa trabajar.
      </p>

      {!loading && memberships.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {memberships.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
              <span>
                {m.userName} <span className="text-muted-foreground">({m.userEmail})</span> — {ROLE_LABELS[m.role as Role]}
              </span>
              <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRevoke(m.id)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor="member-email">Correo del usuario</Label>
          <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@otraempresa.cl" />
        </div>
        <div>
          <Label htmlFor="member-role">Rol en esta empresa</Label>
          <select id="member-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={saving}>{saving ? 'Vinculando...' : 'Vincular acceso'}</Button>
      </form>
    </div>
  );
}
