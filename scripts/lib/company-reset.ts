import type { Prisma } from '@prisma/client';
import { rutKey } from '../../src/lib/chile/rut';

/**
 * Núcleo del reseteo de datos de UNA empresa (`scripts/reset-company-data.ts`).
 *
 * Deja la empresa con su cuenta, sus usuarios y roles y sus módulos contratados,
 * y borra todo lo demás que guardó (ventas, inventario, contabilidad, contactos,
 * bodegas, cajas, sitios…). Sirve para sacar los datos de prueba antes de operar
 * de verdad, sin tener que crear la empresa de nuevo.
 *
 * El plan de borrado NO es una lista escrita a mano: sale de lo que la base de
 * datos declara (toda tabla con `companyId` y las llaves foráneas entre ellas).
 * Un modelo nuevo entra solo, y si algo no se puede borrar con seguridad, el
 * plan falla ANTES de tocar nada. La única lista escrita a mano es la de lo que
 * se conserva (`KEPT_TENANT_TABLES`): lo desconocido se trata como dato.
 */

export type Tx = Prisma.TransactionClient;

/**
 * Tablas con `companyId` que el reseteo NO toca. `CompanySettings` queda porque
 * guarda giro, año fiscal, credenciales de correo/Khipu y lista de IPs: es
 * configuración de la empresa, no datos de prueba. `PlatformAuditLog` es la
 * bitácora de la plataforma (órdenes de la Supersuite, este mismo reseteo).
 */
export const KEPT_TENANT_TABLES: readonly string[] = [
  'CompanyFeatures',
  'CompanySettings',
  'CustomRole',
  'User',
  'UserSession',
  'PushSubscription',
  'Invitation',
  'CompanyMembership',
  'McpPersonalToken',
  'PlatformAuditLog',
];

/**
 * Tablas SIN `companyId` que dependen de algo que se borra y que está bien que
 * se vayan con ello por cascada (los participantes de las conversaciones).
 */
export const ALLOWED_CASCADE_INTO: readonly string[] = ['ConversationParticipant'];

/** Fila de `pg_constraint` de una llave foránea. `onDelete` es el código de una letra de Postgres. */
export interface ForeignKey {
  name: string;
  child: string;
  parent: string;
  columns: string[];
  /** a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT. */
  onDelete: string;
  nullable: boolean;
}

export interface ResetPlan {
  /** Tablas a vaciar, de las hijas a las madres. */
  deleteOrder: string[];
  /** Autorreferencias que se ponen en NULL antes de borrar (Account.parentId…). */
  selfReferences: Array<{ table: string; columns: string[] }>;
}

export class ResetPlanError extends Error {}

export function buildResetPlan(input: {
  tenantTables: readonly string[];
  foreignKeys: readonly ForeignKey[];
  keptTables?: readonly string[];
  allowedCascadeInto?: readonly string[];
}): ResetPlan {
  const kept = new Set(input.keptTables ?? KEPT_TENANT_TABLES);
  const allowedCascade = new Set(input.allowedCascadeInto ?? ALLOWED_CASCADE_INTO);
  const toDelete = new Set(input.tenantTables.filter((table) => !kept.has(table)));

  // Lo que se conserva no puede quedar bloqueando el borrado ni perder filas por cascada.
  for (const fk of input.foreignKeys) {
    if (!toDelete.has(fk.parent) || toDelete.has(fk.child)) continue;
    if (fk.onDelete === 'n' || fk.onDelete === 'd') continue;
    if (fk.onDelete === 'c' && allowedCascade.has(fk.child)) continue;
    throw new ResetPlanError(
      fk.onDelete === 'c'
        ? `Borrar "${fk.parent}" arrastraría por cascada filas de "${fk.child}", que se conserva (${fk.name}).`
        : `La tabla "${fk.child}", que se conserva, apunta a "${fk.parent}" (${fk.name}) y bloquearía el borrado.`
    );
  }

  const selfReferences: ResetPlan['selfReferences'] = [];
  const childrenOf = new Map<string, Set<string>>();
  for (const table of toDelete) childrenOf.set(table, new Set());
  for (const fk of input.foreignKeys) {
    if (!toDelete.has(fk.child) || !toDelete.has(fk.parent)) continue;
    // Solo RESTRICT y NO ACTION frenan el borrado de la madre: SET NULL suelta a la hija
    // y CASCADE se la lleva, así que no imponen ningún orden (ni forman ciclos).
    if (fk.onDelete !== 'r' && fk.onDelete !== 'a') continue;
    if (fk.child === fk.parent) {
      if (!fk.nullable) throw new ResetPlanError(`"${fk.child}" se referencia a sí misma con una columna obligatoria (${fk.name}).`);
      selfReferences.push({ table: fk.child, columns: fk.columns });
    } else {
      childrenOf.get(fk.parent)?.add(fk.child);
    }
  }

  // Una tabla se puede borrar cuando ya no queda ninguna tabla hija por borrar.
  const remaining = new Set(toDelete);
  const deleteOrder: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((table) => [...(childrenOf.get(table) ?? [])].every((child) => !remaining.has(child))).sort();
    if (ready.length === 0) {
      throw new ResetPlanError(`Hay un ciclo de llaves foráneas entre: ${[...remaining].sort().join(', ')}. Hay que romperlo a mano en el script.`);
    }
    for (const table of ready) {
      deleteOrder.push(table);
      remaining.delete(table);
    }
  }
  selfReferences.sort((a, b) => a.table.localeCompare(b.table));
  return { deleteOrder, selfReferences };
}

export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export interface UserTrigger {
  table: string;
  name: string;
}

export interface SchemaFacts {
  tenantTables: string[];
  foreignKeys: ForeignKey[];
  /** Triggers de la aplicación (inmutabilidad contable…), no los internos de las llaves foráneas. */
  userTriggers: UserTrigger[];
}

export async function loadSchemaFacts(db: Tx): Promise<SchemaFacts> {
  const tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT c.table_name::text AS table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'companyId'
      ORDER BY 1`
  );
  const foreignKeys = await db.$queryRawUnsafe<Array<{ name: string; child: string; parent: string; on_delete: string; columns: string[]; nullable: boolean }>>(
    `SELECT con.conname::text AS name,
            child.relname::text AS child,
            parent.relname::text AS parent,
            con.confdeltype::text AS on_delete,
            array_agg(att.attname::text ORDER BY k.ord) AS columns,
            bool_and(NOT att.attnotnull) AS nullable
       FROM pg_constraint con
       JOIN pg_class child ON child.oid = con.conrelid
       JOIN pg_class parent ON parent.oid = con.confrelid
       JOIN pg_namespace ns ON ns.oid = child.relnamespace AND ns.nspname = 'public'
      CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      WHERE con.contype = 'f'
      GROUP BY con.conname, child.relname, parent.relname, con.confdeltype`
  );
  const userTriggers = await db.$queryRawUnsafe<Array<{ table_name: string; name: string }>>(
    `SELECT c.relname::text AS table_name, t.tgname::text AS name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE NOT t.tgisinternal AND t.tgenabled = 'O'
      ORDER BY 1, 2`
  );
  return {
    tenantTables: tables.map((row) => row.table_name),
    foreignKeys: foreignKeys.map((row) => ({
      name: row.name, child: row.child, parent: row.parent, onDelete: row.on_delete, columns: row.columns, nullable: row.nullable,
    })),
    userTriggers: userTriggers.map((row) => ({ table: row.table_name, name: row.name })),
  };
}

/** Filas de la empresa por tabla (solo las que tienen alguna). Una consulta, no ciento sesenta. */
export async function countRows(db: Tx, tables: readonly string[], companyId: string): Promise<Record<string, number>> {
  if (tables.length === 0) return {};
  const sql = tables
    .map((table) => `SELECT '${table.replace(/'/g, "''")}'::text AS t, count(*)::int AS n FROM ${quoteIdent(table)} WHERE "companyId" = $1`)
    .join(' UNION ALL ');
  const rows = await db.$queryRawUnsafe<Array<{ t: string; n: number }>>(sql, companyId);
  const result: Record<string, number> = {};
  for (const row of rows) if (row.n > 0) result[row.t] = row.n;
  return result;
}

export interface RealDataSignal {
  label: string;
  count: number;
}

/**
 * Cosas que no parecen de prueba: folios autorizados por el SII, documentos ya
 * enviados al SII y dinero cobrado por una pasarela. Si hay alguna, el reseteo
 * exige una bandera explícita: es lo que no se puede reponer escribiéndolo de nuevo.
 */
export async function collectRealDataSignals(db: Tx, companyId: string): Promise<RealDataSignal[]> {
  const [caf, sentToSii, installments, storeOrders] = await Promise.all([
    db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "DteCaf" WHERE "companyId" = $1`, companyId),
    db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM "SalesDocument" WHERE "companyId" = $1 AND "siiStatus" IS NOT NULL AND "siiStatus"::text <> 'PENDING'`,
      companyId
    ),
    db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "InstallmentPaymentOrder" WHERE "companyId" = $1 AND "status"::text = 'PAID'`, companyId),
    db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "StoreOrder" WHERE "companyId" = $1 AND "paymentStatus"::text = 'PAID'`, companyId),
  ]);
  const signals: RealDataSignal[] = [
    { label: 'CAF cargados (folios autorizados por el SII)', count: caf[0]?.n ?? 0 },
    { label: 'documentos ya enviados al SII', count: sentToSii[0]?.n ?? 0 },
    { label: 'cuotas pagadas en línea por Khipu', count: installments[0]?.n ?? 0 },
    { label: 'pedidos de la tienda en línea con pago confirmado', count: storeOrders[0]?.n ?? 0 },
  ];
  return signals.filter((signal) => signal.count > 0);
}

export interface ResetOutcome {
  deleted: Record<string, number>;
  totalRows: number;
  keptBefore: Record<string, number>;
  keptAfter: Record<string, number>;
}

/**
 * Ejecuta el plan DENTRO de la transacción que recibe. Si algo no cuadra
 * (quedó una fila, cambió una tabla que se conserva) lanza, y quien llamó hace
 * rollback: nunca se confirma un reseteo a medias.
 *
 * `afterDelete` corre en la misma transacción, con la empresa ya vacía, y es
 * donde se vuelve a dejar lo mínimo para operar (bodega principal, plan de cuentas).
 */
export async function runReset(
  tx: Tx,
  input: {
    companyId: string;
    plan: ResetPlan;
    facts: SchemaFacts;
    keptTables?: readonly string[];
    afterDelete?: (tx: Tx) => Promise<void>;
  }
): Promise<ResetOutcome> {
  const { companyId, plan, facts } = input;
  const kept = input.keptTables ?? KEPT_TENANT_TABLES;
  const keptPresent = kept.filter((table) => facts.tenantTables.includes(table));

  const before = await countRows(tx, plan.deleteOrder, companyId);
  const keptBefore = await countRows(tx, keptPresent, companyId);

  // Solo se suspenden los triggers de las tablas donde esta empresa tiene filas
  // (el candado de ALTER TABLE frena las escrituras de las demás un instante).
  const triggers = facts.userTriggers.filter((trigger) => plan.deleteOrder.includes(trigger.table) && (before[trigger.table] ?? 0) > 0);
  for (const trigger of triggers) {
    await tx.$executeRawUnsafe(`ALTER TABLE ${quoteIdent(trigger.table)} DISABLE TRIGGER ${quoteIdent(trigger.name)}`);
  }

  const sellerPeople = await tx.$queryRawUnsafe<Array<{ personId: string }>>(
    `SELECT DISTINCT "personId" FROM "SupplierPortalMembership" WHERE "companyId" = $1`,
    companyId
  );

  for (const { table, columns } of plan.selfReferences) {
    if ((before[table] ?? 0) === 0) continue;
    const assignments = columns.map((column) => `${quoteIdent(column)} = NULL`).join(', ');
    await tx.$executeRawUnsafe(`UPDATE ${quoteIdent(table)} SET ${assignments} WHERE "companyId" = $1`, companyId);
  }
  for (const table of plan.deleteOrder) {
    if ((before[table] ?? 0) === 0) continue;
    await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdent(table)} WHERE "companyId" = $1`, companyId);
  }

  // Las personas del Seller Center son de la plataforma: solo se van las que se quedaron sin acceso a ninguna empresa.
  if (sellerPeople.length > 0) {
    await tx.$executeRawUnsafe(
      `DELETE FROM "SupplierPortalPerson" p
        WHERE p."id" = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM "SupplierPortalMembership" m WHERE m."personId" = p."id")`,
      sellerPeople.map((row) => row.personId)
    );
  }

  for (const trigger of triggers) {
    await tx.$executeRawUnsafe(`ALTER TABLE ${quoteIdent(trigger.table)} ENABLE TRIGGER ${quoteIdent(trigger.name)}`);
  }

  const left = await countRows(tx, plan.deleteOrder, companyId);
  if (Object.keys(left).length > 0) {
    throw new Error(`Quedaron filas sin borrar: ${Object.entries(left).map(([table, n]) => `${table} (${n})`).join(', ')}.`);
  }
  const keptAfter = await countRows(tx, keptPresent, companyId);
  const changed = keptPresent.filter((table) => (keptBefore[table] ?? 0) !== (keptAfter[table] ?? 0));
  if (changed.length > 0) {
    throw new Error(`Cambió una tabla que debía conservarse: ${changed.join(', ')}.`);
  }

  if (input.afterDelete) await input.afterDelete(tx);

  const totalRows = Object.values(before).reduce((sum, n) => sum + n, 0);
  return { deleted: before, totalRows, keptBefore, keptAfter };
}

export interface CompanyRef {
  id: string;
  rut: string;
  businessName: string;
}

/** Busca por id, por RUT (con o sin puntos y guion) o por razón social exacta. */
export function matchCompanies<T extends CompanyRef>(companies: readonly T[], query: string): T[] {
  const text = query.trim();
  if (!text) return [];
  const byId = companies.filter((company) => company.id === text);
  if (byId.length > 0) return byId;
  const key = rutKey(text);
  const byRut = key.length >= 2 ? companies.filter((company) => rutKey(company.rut) === key) : [];
  if (byRut.length > 0) return byRut;
  const lower = text.toLocaleLowerCase('es-CL');
  return companies.filter((company) => company.businessName.trim().toLocaleLowerCase('es-CL') === lower);
}

export interface ResetArgs {
  company: string | null;
  commit: boolean;
  confirm: string | null;
  acceptRealData: boolean;
  help: boolean;
}

export function parseResetArgs(argv: readonly string[]): ResetArgs {
  const args: ResetArgs = { company: null, commit: false, confirm: null, acceptRealData: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--commit') args.commit = true;
    else if (arg === '--acepto-perder-datos-reales') args.acceptRealData = true;
    else if (arg === '--ayuda' || arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--empresa' || arg === '--confirmar') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Falta el valor de ${arg}.`);
      if (arg === '--empresa') args.company = value;
      else args.confirm = value;
      index += 1;
    } else {
      throw new Error(`Opción desconocida: ${arg}. Usa --ayuda.`);
    }
  }
  return args;
}

/** La confirmación escrita debe repetir la razón social tal cual (sin distinguir mayúsculas ni espacios de más). */
export function confirmationMatches(businessName: string, typed: string | null): boolean {
  if (!typed) return false;
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
  return normalize(typed) === normalize(businessName);
}
