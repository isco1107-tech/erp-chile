'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { TenantStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { RutInput } from '@/components/ui/RutInput';
import {
  createTenantAction,
  listTenantsAction,
  setTenantStatusAction,
} from '@/modules/platform/actions/platform.actions';
import type { TenantListItem } from '@/modules/platform/services/platform.service';
import {
  PLAN_NAMES,
  PLAN_PRESETS,
  TENANT_STATUSES,
  TENANT_STATUS_BADGE_CLASS,
  TENANT_STATUS_LABELS,
} from '@/modules/platform/schema';
import { MODULES } from '@/lib/auth/modules';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

type PlanName = (typeof PLAN_NAMES)[number];

export default function TenantsClient() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    rut: '',
    businessName: '',
    email: '',
    planName: 'Starter' as PlanName,
    status: 'TRIAL' as TenantStatus,
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  async function load(search?: string) {
    setLoading(true);
    const result = await listTenantsAction(search);
    if (result.success) setTenants(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function toggleStatus(tenant: TenantListItem) {
    const next: TenantStatus = tenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const verb = next === 'SUSPENDED' ? 'suspender' : 'reactivar';
    if (
      next === 'SUSPENDED' &&
      !confirm(
        `Se cortará el acceso de los ${tenant.userCount} usuario(s) de ${tenant.businessName} de inmediato. ¿Continuar?`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await setTenantStatusAction(tenant.id, { status: next });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Empresa ${verb === 'suspender' ? 'suspendida' : 'reactivada'}`);
      load(query);
    });
  }

  async function handleCreate() {
    const preset = PLAN_PRESETS[form.planName];
    setSaving(true);
    try {
      const result = await createTenantAction({
        rut: form.rut,
        businessName: form.businessName,
        email: form.email,
        planName: form.planName,
        status: form.status,
        maxUsers: preset.maxUsers,
        maxWarehouses: preset.maxWarehouses,
        features: preset.features,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Empresa creada');
      setCreateOpen(false);
      setForm({
        rut: '',
        businessName: '',
        email: '',
        planName: 'Starter',
        status: 'TRIAL',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
      });
      load(query);
    } finally {
      setSaving(false);
    }
  }

  const preset = PLAN_PRESETS[form.planName];
  const includedModules = MODULES.filter((mod) => preset.features[mod.key]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load(query);
          }}
        >
          <Input
            placeholder="Buscar por RUT o razón social"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72"
          />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <Button type="button" onClick={() => setCreateOpen(true)}>+ Crear Nueva Empresa</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Empresa</th>
              <th className="p-2 font-medium">RUT</th>
              <th className="p-2 font-medium">Plan</th>
              <th className="p-2 font-medium">Módulos</th>
              <th className="p-2 font-medium">Usuarios</th>
              <th className="p-2 font-medium">Registro</th>
              <th className="p-2 font-medium">Estado</th>
              <th className="p-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={8}>Cargando...</td></tr>
            )}
            {!loading && tenants.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={8}>Sin empresas registradas</td></tr>
            )}
            {!loading && tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-border">
                <td className="p-2 font-medium">{tenant.businessName}</td>
                <td className="p-2">{tenant.rut}</td>
                <td className="p-2">{tenant.planName}</td>
                <td className="p-2">{tenant.enabledModules} / {MODULES.length}</td>
                <td className="p-2">
                  <span className={tenant.userCount > tenant.maxUsers ? 'text-destructive' : ''}>
                    {tenant.userCount} / {tenant.maxUsers}
                  </span>
                </td>
                <td className="p-2">{new Date(tenant.createdAt).toLocaleDateString('es-CL')}</td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TENANT_STATUS_BADGE_CLASS[tenant.status]}`}>
                    {TENANT_STATUS_LABELS[tenant.status]}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/superadmin/companies/${tenant.id}`}
                      className="rounded-lg border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      Configurar módulos
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      variant={tenant.status === 'SUSPENDED' ? 'outline' : 'destructive'}
                      onClick={() => toggleStatus(tenant)}
                    >
                      {tenant.status === 'SUSPENDED' ? 'Activar' : 'Suspender'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear Nueva Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rut">RUT de la empresa</Label>
                <RutInput id="rut" value={form.rut} onChange={(value) => setForm((f) => ({ ...f, rut: value }))} />
              </div>
              <div>
                <Label htmlFor="businessName">Razón social</Label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="companyEmail">Correo de contacto (opcional)</Label>
              <Input
                id="companyEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="planName">Plan contratado</Label>
                <select
                  id="planName"
                  className={selectClass}
                  value={form.planName}
                  onChange={(e) => setForm((f) => ({ ...f, planName: e.target.value as PlanName }))}
                >
                  {PLAN_NAMES.map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="status">Estado inicial</Label>
                <select
                  id="status"
                  className={selectClass}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TenantStatus }))}
                >
                  {TENANT_STATUSES.map((status) => (
                    <option key={status} value={status}>{TENANT_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <p className="font-medium">
                Incluye {preset.maxUsers} usuarios y {preset.maxWarehouses} bodega(s):
              </p>
              <p className="mt-1 text-muted-foreground">
                {includedModules.map((mod) => mod.label).join(' · ')}
              </p>
              <p className="mt-1 text-muted-foreground">
                Los módulos se pueden ajustar uno a uno después de crearla.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-sm font-semibold">Primer usuario administrador</p>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="adminName">Nombre</Label>
                    <Input
                      id="adminName"
                      value={form.adminName}
                      onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="adminEmail">Correo</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="adminPassword">Contraseña inicial</Label>
                  <PasswordInput
                    id="adminPassword"
                    value={form.adminPassword}
                    onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mínimo 8 caracteres. Entrégasela por un canal seguro; el usuario nace con rol Dueño.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={saving} onClick={handleCreate}>
              {saving ? 'Creando...' : 'Crear Empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
