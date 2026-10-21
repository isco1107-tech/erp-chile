import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import type { Company, Role, TenantStatus } from '@prisma/client';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';
import { ensureChartOfAccounts } from '@/modules/accounting/services/chart-setup.service';
import { setDisabledNavItems } from '@/modules/workspace/services/workspace.service';
import type { CompanyCreateInput, CompanyPlanUpdateInput } from '../schema';

/**
 * Crea el tenant, sus feature flags, su bodega principal y su primer usuario
 * administrador en una sola transacción: una empresa a medio crear —sin usuario
 * o sin features— no sería accesible ni corregible desde la propia app.
 *
 * Si el correo del administrador ya tiene cuenta (dueño de otra empresa), no
 * se crea un usuario nuevo —el correo es único—: se lo vincula como Dueño vía
 * `CompanyMembership` y se activa `hasMultiCompany`, así entra con su misma
 * contraseña y al iniciar sesión elige en qué empresa trabajar.
 *
 * `mustChangePassword` obliga al administrador nuevo a elegir su propia clave en
 * el primer ingreso (la inicial la puso otra persona, no él).
 */
export async function createTenant(
  input: CompanyCreateInput,
  options: { mustChangePassword?: boolean } = {}
): Promise<{ company: Company; linkedExistingUser: boolean }> {
  const rutClean = cleanRut(input.rut);
  const rut = formatRut(rutClean);

  const existingCompany = await prisma.company.findUnique({ where: { rut } });
  if (existingCompany) throw new Error('Ya existe una empresa registrada con ese RUT');

  // Sin distinguir mayúsculas: "Ana@x.cl" y "ana@x.cl" son la misma persona, y
  // el índice único de la base sí los distingue (crearía una cuenta duplicada).
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: input.adminEmail.trim(), mode: 'insensitive' } },
    select: { id: true, companyId: true },
  });
  if (existingUser && !existingUser.companyId) {
    throw new Error('Ese correo es de una cuenta de plataforma sin empresa; usa otro correo para el administrador');
  }
  if (!existingUser && !input.adminPassword) throw new Error('Ingresa la contraseña inicial del administrador');

  const passwordHash = existingUser ? null : await bcrypt.hash(input.adminPassword!, 12);
  const features = existingUser ? { ...input.features, hasMultiCompany: true } : input.features;

  const created = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        rut,
        businessName: input.businessName,
        email: input.email || undefined,
        status: input.status,
        planName: input.planName,
        maxUsers: input.maxUsers,
        maxWarehouses: input.maxWarehouses,
        features: { create: features },
        // Sin esto, una empresa nueva quedaba sin `CompanySettings` hasta que
        // alguien guardara el formulario de Configuración por primera vez —
        // cualquier lectura que asumiera la fila existente (el wizard de
        // onboarding, `getCompanySettings`) fallaba o tenía que manejar el
        // caso nulo a mano. Todos los campos tienen default en el schema, así
        // que un `create: {}` basta.
        settings: { create: {} },
      },
    });

    await tx.warehouse.create({
      data: { companyId: company.id, name: 'Bodega Principal', code: 'PRINCIPAL', isDefault: true },
    });

    if (existingUser) {
      await tx.companyMembership.create({ data: { userId: existingUser.id, companyId: company.id, role: 'OWNER' } });
    } else {
      await tx.user.create({
        data: {
          email: input.adminEmail,
          passwordHash: passwordHash!,
          name: input.adminName,
          role: 'OWNER',
          companyId: company.id,
          mustChangePassword: options.mustChangePassword ?? false,
        },
      });
    }

    return company;
  });

  // Fuera de la transacción de alta a propósito: la siembra son ~50
  // escrituras con su propio timeout extendido. Si falla, la empresa ya
  // existe igual y el plan se puede crear después desde la pantalla contable.
  if (input.features.hasAccounting) await ensureChartOfAccounts(created.id);
  return { company: created, linkedExistingUser: Boolean(existingUser) };
}

export async function updateTenantPlan(companyId: string, input: CompanyPlanUpdateInput): Promise<Company> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Empresa no encontrada');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.companyFeatures.upsert({
      where: { companyId },
      update: input.features,
      create: { companyId, ...input.features },
    });

    return tx.company.update({
      where: { id: companyId },
      data: {
        planName: input.planName,
        maxUsers: input.maxUsers,
        maxWarehouses: input.maxWarehouses,
      },
    });
  });

  // Activar Contabilidad deja lista la contabilidad automática: siembra el
  // plan de cuentas si falta (no-op si ya existe). Apagarla no borra nada:
  // el plan y los asientos quedan, solo se dejan de generar asientos nuevos.
  if (input.features.hasAccounting) await ensureChartOfAccounts(companyId);
  // Pantallas del menú apagadas: la misma lista que la empresa edita en Configuración → Módulos y menú.
  if (input.disabledNavItems) await setDisabledNavItems(companyId, input.disabledNavItems);
  return updated;
}

export async function setTenantStatus(companyId: string, status: TenantStatus): Promise<Company> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Empresa no encontrada');
  return prisma.company.update({ where: { id: companyId }, data: { status } });
}

/**
 * Válvula de emergencia: si una empresa activa la lista de IPs sin agregar
 * la propia y queda bloqueada, nadie de adentro puede volver a entrar para
 * arreglarlo — solo la Supersuite (orden `seguridad.ip.liberar`) puede. Apaga la restricción sin borrar las
 * entradas ya configuradas, para que el cliente las revise y las corrija
 * antes de reactivarla.
 */
export async function disableTenantIpAllowlist(companyId: string): Promise<void> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId } });
  if (!settings) throw new Error('Esta empresa no tiene configuración inicializada');
  await prisma.companySettings.update({ where: { companyId }, data: { ipAllowlistEnabled: false } });
}

export interface TenantMembership {
  id: string;
  userEmail: string;
  userName: string;
  role: string;
  createdAt: Date;
}

/**
 * Vincula (módulo `hasMultiCompany`) a un usuario YA EXISTENTE de OTRA
 * empresa como miembro adicional de esta — no crea cuenta ni la mueve de su
 * empresa hogar (`User.companyId`), solo le da una identidad secundaria acá
 * (ver `CompanyMembership`, `switch-company.actions.ts`). Solo la Supersuite
 * (orden `acceso.otorgar`) puede hacerlo: es la única forma de que un login administre 2+ empresas,
 * no hay autoservicio para evitar que un OWNER se auto-invite a otra
 * empresa del SaaS.
 *
 * Vincular enciende `hasMultiCompany` en esta empresa: sin el módulo la
 * membresía no se puede usar (guards la ignora), y antes quedaba creada pero
 * inactiva sin que nada lo avisara. El correo se busca sin distinguir
 * mayúsculas, igual que se escribe en el formulario.
 */
export async function grantCompanyMembership(companyId: string, userEmail: string, role: Role): Promise<TenantMembership> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: userEmail.trim(), mode: 'insensitive' } },
    select: { id: true, name: true, email: true, companyId: true },
  });
  if (!user) throw new Error('No existe ningún usuario con ese correo');
  if (user.companyId === companyId) throw new Error('Este usuario ya pertenece a esta empresa como su empresa hogar');

  const membership = await prisma.$transaction(async (tx) => {
    const saved = await tx.companyMembership.upsert({
      where: { userId_companyId: { userId: user.id, companyId } },
      update: { role },
      create: { userId: user.id, companyId, role },
    });
    await tx.companyFeatures.upsert({
      where: { companyId },
      update: { hasMultiCompany: true },
      create: { companyId, ...DEFAULT_FEATURES, hasMultiCompany: true },
    });
    return saved;
  });
  return { id: membership.id, userEmail: user.email, userName: user.name, role: membership.role, createdAt: membership.createdAt };
}

export async function revokeCompanyMembership(companyId: string, membershipId: string): Promise<void> {
  const result = await prisma.companyMembership.deleteMany({ where: { id: membershipId, companyId } });
  if (result.count === 0) throw new Error('Membresía no encontrada');
}
