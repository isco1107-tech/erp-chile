'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Invitation, Role } from '@prisma/client';
import type { TeamMember } from '@/lib/services/users.service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContactButtons } from '@/components/settings/ContactButtons';
import { getUserProfileAction, type UserProfile } from '@/lib/actions/profile';
import { ACTION_LABELS } from '@/lib/auth/audit-labels';
import { formatRelative } from '@/lib/format';
import {
  changeUserRoleAction,
  createUserDirectAction,
  deleteUserAction,
  finalizeOwnPasswordResetAction,
  inviteUserAction,
  listPendingInvitationsAction,
  listUsersAction,
  resendInvitationAction,
  resetUserPasswordAction,
  revokeInvitationAction,
  toggleUserStatusAction,
} from '@/lib/actions/users';
import {
  assignCustomRoleAction,
  getSeatUsageAction,
  listCustomRolesAction,
  type SeatUsage,
} from '@/modules/roles/actions/roles.actions';
import type { CustomRoleWithUsage } from '@/modules/roles/services/roles.service';
import { ROLES, ROLE_BADGE_CLASS, ROLE_LABELS } from '@/lib/auth/roles';

import { useConfirm } from '@/components/ui/confirm-provider';
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default function TeamClient() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<'users' | 'invitations'>('users');
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleWithUsage[]>([]);
  const [seats, setSeats] = useState<SeatUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<'email' | 'direct'>('email');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('SALES');
  const [inviteCustomRoleId, setInviteCustomRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [directName, setDirectName] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string | null>(null);
  const [isSelfReset, setIsSelfReset] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const router = useRouter();

  async function load() {
    setLoading(true);
    const [usersResult, invitationsResult, rolesResult, seatsResult] = await Promise.all([
      listUsersAction(),
      listPendingInvitationsAction(),
      listCustomRolesAction(),
      getSeatUsageAction(),
    ]);
    if (usersResult.success) setUsers(usersResult.data);
    else toast.error(usersResult.error);
    if (invitationsResult.success) setInvitations(invitationsResult.data);
    else toast.error(invitationsResult.error);
    if (rolesResult.success) setCustomRoles(rolesResult.data);
    if (seatsResult.success) setSeats(seatsResult.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetInviteForm() {
    setInviteEmail('');
    setInviteRole('SALES');
    setInviteCustomRoleId('');
    setDirectName('');
    setGeneratedPassword(null);
    setGeneratedFor(null);
    setIsSelfReset(false);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error('Ingrese un correo electrónico');
      return;
    }
    setInviting(true);
    try {
      const result = await inviteUserAction({
        email: inviteEmail.trim(),
        role: inviteRole,
        customRoleId: inviteCustomRoleId || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Invitación enviada');
      resetInviteForm();
      setInviteOpen(false);
      setTab('invitations');
      load();
    } finally {
      setInviting(false);
    }
  }

  async function handleCreateDirect() {
    if (!inviteEmail.trim() || !directName.trim()) {
      toast.error('Ingrese nombre y correo electrónico');
      return;
    }
    setInviting(true);
    try {
      const result = await createUserDirectAction({
        email: inviteEmail.trim(),
        name: directName.trim(),
        role: inviteRole,
        customRoleId: inviteCustomRoleId || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cuenta creada');
      // El diálogo no se cierra todavía: primero hay que mostrar la
      // contraseña temporal, que no vuelve a estar disponible después de
      // este momento.
      setGeneratedPassword(result.data.temporaryPassword);
      setGeneratedFor(result.data.user.email);
      setTab('users');
      load();
    } finally {
      setInviting(false);
    }
  }

  function copyGeneratedPassword() {
    if (!generatedPassword) return;
    navigator.clipboard.writeText(generatedPassword);
    toast.success('Contraseña copiada al portapapeles');
  }

  async function handleCustomRoleChange(userId: string, customRoleId: string) {
    const result = await assignCustomRoleAction({ userId, customRoleId: customRoleId || null });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Rol asignado');
    load();
  }

  async function handleRoleChange(userId: string, role: Role) {
    const result = await changeUserRoleAction(userId, role);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Rol actualizado');
    load();
  }

  async function handleToggleStatus(userId: string) {
    const result = await toggleUserStatusAction(userId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Estado actualizado');
    load();
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!await confirm(`¿Eliminar la cuenta de ${email}? Esto la borra por completo y libera el correo para invitarlo o crearlo de nuevo. No se puede deshacer.`)) return;
    const result = await deleteUserAction(userId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Usuario eliminado');
    load();
  }

  async function handleResetPassword(userId: string) {
    if (!await confirm('¿Generar una contraseña temporal nueva? La anterior deja de funcionar de inmediato.')) return;
    const result = await resetUserPasswordAction(userId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Contraseña restablecida');
    setGeneratedPassword(result.data.temporaryPassword);
    setGeneratedFor(result.data.user.email);
    setIsSelfReset(result.data.isSelf);
    setInviteOpen(true);
  }

  /**
   * Solo aplica cuando el reseteo fue sobre la propia cuenta: recién acá se
   * invalida la sesión activa, una vez que ya se confirmó haber copiado la
   * clave nueva (ver `finalizeOwnPasswordResetAction`).
   */
  async function handleConfirmSelfReset() {
    setLoggingOut(true);
    try {
      await finalizeOwnPasswordResetAction();
    } finally {
      setInviteOpen(false);
      resetInviteForm();
      router.push('/login');
    }
  }

  async function handleRevoke(id: string) {
    if (!await confirm('¿Revocar esta invitación?')) return;
    const result = await revokeInvitationAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Invitación revocada');
    load();
  }

  async function handleResend(id: string) {
    const result = await resendInvitationAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Invitación reenviada');
    load();
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/accept-invitation?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Enlace de invitación copiado al portapapeles');
  }

  async function handleViewProfile(userId: string) {
    setLoadingProfile(true);
    try {
      const result = await getUserProfileAction(userId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setViewingProfile(result.data);
    } finally {
      setLoadingProfile(false);
    }
  }

  return (
    <div className="space-y-4">
      {seats && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <div>
            <span className="font-medium">
              {seats.used} de {seats.max} licencias en uso
            </span>
            <span className="text-muted-foreground"> · Plan {seats.planName}</span>
            <p className="text-xs text-muted-foreground">
              Cuentan los usuarios activos y las invitaciones vigentes.
            </p>
          </div>
          {seats.used >= seats.max && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
              Sin cupos disponibles
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={tab === 'users' ? 'default' : 'outline'} onClick={() => setTab('users')}>
            Usuarios Activos
          </Button>
          <Button type="button" size="sm" variant={tab === 'invitations' ? 'default' : 'outline'} onClick={() => setTab('invitations')}>
            Invitaciones Pendientes{invitations.length > 0 ? ` (${invitations.length})` : ''}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/settings/roles"
            className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted"
          >
            Roles Personalizados
          </Link>
          <Button
            type="button"
            disabled={Boolean(seats && seats.used >= seats.max)}
            title={seats && seats.used >= seats.max ? 'Tu plan no tiene cupos disponibles' : undefined}
            onClick={() => setInviteOpen(true)}
          >
            + Agregar Colaborador
          </Button>
        </div>
      </div>

      {tab === 'users' && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Nombre</th>
                <th className="p-2 font-medium">Correo</th>
                <th className="p-2 font-medium">Rol Base</th>
                <th className="p-2 font-medium">Rol Personalizado</th>
                <th className="p-2 font-medium">Fecha de Ingreso</th>
                <th className="p-2 font-medium">Estado</th>
                <th className="p-2 font-medium">Contacto</th>
                <th className="p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="p-4 text-center text-muted-foreground" colSpan={8}>Cargando...</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td className="p-4 text-center text-muted-foreground" colSpan={8}>Sin usuarios</td></tr>
              )}
              {!loading && users.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="p-2">{user.name}</td>
                  <td className="p-2">{user.email}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                      <select
                        className="h-7 rounded-lg border border-input bg-transparent px-1.5 text-xs outline-none dark:bg-input/30"
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="p-2">
                    {user.role === 'OWNER' ? (
                      <span className="text-xs text-muted-foreground">
                        El Dueño siempre conserva acceso total
                      </span>
                    ) : (
                      <select
                        className="h-7 rounded-lg border border-input bg-transparent px-1.5 text-xs outline-none dark:bg-input/30"
                        value={user.customRoleId ?? ''}
                        onChange={(e) => handleCustomRoleChange(user.id, e.target.value)}
                      >
                        <option value="">— Usar rol base —</option>
                        {customRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-2">{new Date(user.createdAt).toLocaleDateString('es-CL')}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.isActive ? 'bg-green-600/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
                      {user.isActive ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col items-start gap-1.5">
                      <ContactButtons phone={user.phone} email={user.email} />
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={loadingProfile} onClick={() => handleViewProfile(user.id)}>
                        Ver perfil y actividad
                      </Button>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant={user.isActive ? 'destructive' : 'outline'} onClick={() => handleToggleStatus(user.id)}>
                        {user.isActive ? 'Suspender' : 'Reactivar'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleResetPassword(user.id)}>
                        Restablecer contraseña
                      </Button>
                      {user.role !== 'OWNER' && (
                        <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteUser(user.id, user.email)}>
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invitations' && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Correo</th>
                <th className="p-2 font-medium">Rol Asignado</th>
                <th className="p-2 font-medium">Expira</th>
                <th className="p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="p-4 text-center text-muted-foreground" colSpan={4}>Cargando...</td></tr>
              )}
              {!loading && invitations.length === 0 && (
                <tr><td className="p-4 text-center text-muted-foreground" colSpan={4}>Sin invitaciones pendientes</td></tr>
              )}
              {!loading && invitations.map((inv) => {
                const expired = new Date(inv.expiresAt) < new Date();
                return (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="p-2">{inv.email}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[inv.role]}`}>{ROLE_LABELS[inv.role]}</span>
                    </td>
                    <td className="p-2">
                      {expired ? <span className="text-destructive">Expirada</span> : new Date(inv.expiresAt).toLocaleDateString('es-CL')}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => copyInviteLink(inv.token)}>Copiar enlace</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleResend(inv.id)}>Reenviar</Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => handleRevoke(inv.id)}>Revocar</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          // Mientras haya una clave auto-generada pendiente de confirmar, no
          // se permite cerrar el diálogo con Escape/click afuera: hay que
          // pasar por "Ya la copié, cerrar sesión" para que la sesión
          // realmente se invalide (ver `handleConfirmSelfReset`).
          if (!open && isSelfReset && generatedPassword) return;
          setInviteOpen(open);
          if (!open) resetInviteForm();
        }}
      >
        <DialogContent>
          {generatedPassword ? (
            <>
              <DialogHeader>
                <DialogTitle>Contraseña temporal</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {isSelfReset ? (
                    <>Es tu propia cuenta (<span className="font-medium text-foreground">{generatedFor}</span>). Cópiala ahora —{' '}
                    <strong>no volverá a mostrarse</strong>. Al confirmar, tu sesión actual se cerrará y deberás
                    ingresar de nuevo con esta clave.</>
                  ) : (
                    <>Para <span className="font-medium text-foreground">{generatedFor}</span>. Cópiala y
                    entrégasela por otro medio (WhatsApp, en persona, teléfono) — <strong>no volverá a mostrarse</strong>. Si la
                    pierdes, usa &quot;Restablecer contraseña&quot; para generar una nueva.</>
                  )}
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 py-2">
                  <code className="flex-1 select-all font-mono text-base tracking-wide">{generatedPassword}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyGeneratedPassword}>Copiar</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isSelfReset
                    ? 'Al reingresar, el sistema te pedirá elegir tu propia contraseña antes de dejarte entrar al resto del ERP.'
                    : 'En su primer ingreso, el sistema le pedirá elegir su propia contraseña antes de dejarla entrar al resto del ERP.'}
                </p>
              </div>
              <DialogFooter>
                {isSelfReset ? (
                  <Button type="button" variant="destructive" disabled={loggingOut} onClick={handleConfirmSelfReset}>
                    {loggingOut ? 'Cerrando sesión...' : 'Ya la copié, cerrar sesión'}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => { setInviteOpen(false); resetInviteForm(); }}>Listo</Button>
                )}
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Agregar Colaborador</DialogTitle>
              </DialogHeader>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={inviteMode === 'email' ? 'default' : 'outline'} onClick={() => setInviteMode('email')}>
                  Invitar por correo
                </Button>
                <Button type="button" size="sm" variant={inviteMode === 'direct' ? 'default' : 'outline'} onClick={() => setInviteMode('direct')}>
                  Crear cuenta directamente
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {inviteMode === 'email'
                  ? 'Se envía un correo con un enlace para que la persona cree su propia contraseña.'
                  : 'La cuenta queda activa de inmediato con una contraseña temporal generada al azar, que se lo pide cambiar en su primer ingreso.'}
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="invite-email">Correo electrónico</Label>
                  <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                </div>
                {inviteMode === 'direct' && (
                  <div>
                    <Label htmlFor="direct-name">Nombre completo</Label>
                    <Input id="direct-name" value={directName} onChange={(e) => setDirectName(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label htmlFor="invite-role">Rol base</Label>
                  <select id="invite-role" className={selectClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="invite-custom-role">Rol personalizado (opcional)</Label>
                  <select
                    id="invite-custom-role"
                    className={selectClass}
                    value={inviteCustomRoleId}
                    onChange={(e) => setInviteCustomRoleId(e.target.value)}
                  >
                    <option value="">— Usar permisos del rol base —</option>
                    {customRoles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Si eliges uno, sus permisos reemplazan a los del rol base.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
                {inviteMode === 'email' ? (
                  <Button type="button" disabled={inviting} onClick={handleInvite}>
                    {inviting ? 'Enviando...' : 'Enviar Invitación'}
                  </Button>
                ) : (
                  <Button type="button" disabled={inviting} onClick={handleCreateDirect}>
                    {inviting ? 'Creando...' : 'Crear Cuenta'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingProfile} onOpenChange={(open) => !open && setViewingProfile(null)}>
        <DialogContent className="max-w-lg">
          {viewingProfile && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingProfile.name}</DialogTitle>
                <DialogDescription>
                  {viewingProfile.roleLabel}
                  {viewingProfile.customRoleName ? ` (${viewingProfile.customRoleName})` : ''} · {viewingProfile.email}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <ContactButtons phone={viewingProfile.phone} email={viewingProfile.email} />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Último inicio de sesión</p>
                    <p>{viewingProfile.activity.lastLoginAt ? formatRelative(new Date(viewingProfile.activity.lastLoginAt)) : 'Sin registro'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dispositivos activos</p>
                    <p>{viewingProfile.activity.activeSessionCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Visto por última vez</p>
                    <p>{viewingProfile.activity.lastSeenAt ? formatRelative(new Date(viewingProfile.activity.lastSeenAt)) : 'Sin sesión activa'}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Últimas acciones</p>
                  {viewingProfile.activity.recentActions.length === 0 && (
                    <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
                  )}
                  <ul className="space-y-1.5">
                    {viewingProfile.activity.recentActions.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{ACTION_LABELS[a.action]} · {a.entity}</span>
                        <span className="text-xs text-muted-foreground">{formatRelative(new Date(a.createdAt))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setViewingProfile(null)}>Cerrar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
