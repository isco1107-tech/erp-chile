import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

/**
 * Regresión para el bug real: `hardDeleteTenant` es una lista escrita a mano
 * (a diferencia del respaldo, que se deriva del DMMF), y ~15 tablas de los
 * módulos de eventos/producción/agentes de IA se agregaron al schema sin que
 * nadie las sumara ahí — borrar cualquier empresa que las usara hacía
 * rollback completo contra la primera FK RESTRICT que encontrara.
 *
 * Este test no repite ese error de "lista a mano sin red de seguridad": para
 * cada modelo con `companyId` en el schema real, exige que esté cubierto por
 * UNO de dos caminos — un `deleteMany` explícito en `platform-delete.service.ts`,
 * o un `onDelete: Cascade` verificado a mano hasta `Company` (documentado
 * abajo, modelo por modelo). Un modelo nuevo que no calce en ninguno de los
 * dos falla este test — la falla es la señal para decidir conscientemente
 * cuál de los dos caminos le corresponde, en vez de que el gap quede en
 * silencio hasta que alguien intente borrar esa empresa en producción.
 */

const SERVICE_PATH = join(__dirname, '..', 'src', 'modules', 'platform', 'services', 'platform-delete.service.ts');

function explicitlyDeletedModelNames(): Set<string> {
  const source = readFileSync(SERVICE_PATH, 'utf-8');
  const delegateNames = new Set<string>();
  for (const match of source.matchAll(/tx\.(\w+)\.deleteMany/g)) {
    delegateNames.add(match[1]);
  }
  // delegate camelCase -> nombre de modelo PascalCase (mismo criterio que
  // `company-backup.service.ts`, a la inversa).
  return new Set([...delegateNames].map((name) => name.charAt(0).toUpperCase() + name.slice(1)));
}

/**
 * Modelos que NUNCA necesitan `deleteMany` propio porque cuelgan, directa o
 * transitivamente, de un `onDelete: Cascade` real (verificado leyendo
 * schema.prisma) hasta `Company` o hasta un modelo que SÍ se borra
 * explícito. Agrupados por el padre del que cascadean, para que quede claro
 * qué se rompe si algún día ese `Cascade` se saca del schema.
 */
const CASCADES_TO_COMPANY = new Set([
  // onDelete: Cascade directo hacia Company.
  'UserSession',
  'CompanyMembership',
  'Conversation',
  'Message',
  'MessageAttachment',
  'DteCaf',
  'WorkflowRule',
  'WorkflowExecution',
  'WorkflowNotification',
  'JobPosition',
]);

/** Cascadean desde `Project`, que se borra explícito en `hardDeleteTenant`. */
const CASCADES_FROM_PROJECT = new Set([
  'ScoreSheet',
  'RoundContestant',
  'JudgingCategory',
  'CompetitionRound',
  'JudgeAssignment',
  'StaffAccreditation',
  'StageTimelineItem',
  'WardrobeItem',
  'BadgeTemplate',
]);

/** Cascadean desde `Candidate`, que se borra explícito en `hardDeleteTenant`. */
const CASCADES_FROM_CANDIDATE = new Set(['CandidateAttendance', 'CandidateDocument']);

/** Cascadean desde `SponsorshipContract`/`Budget`, ambos explícitos. */
const CASCADES_FROM_OTHER_EXPLICIT = new Set(['SponsorshipDeliverable', 'BudgetLine']);

/**
 * Tienen `companyId` pero SIN relación FK real hacia `Company` en
 * schema.prisma (campo de texto/id plano, no `@relation`) — no pueden
 * bloquear `company.delete()` aunque queden filas huérfanas.
 * `PlatformAuditLog`: a propósito, es la bitácora del operador del SaaS y
 * debe sobrevivir al tenant para dejar constancia de que existió.
 * `ProcessedWebhookEvent`: deduplicación de webhooks entrantes, ya excluida
 * del respaldo como "ruido de infraestructura" — huérfana es inofensiva.
 */
const NO_FK_TO_COMPANY = new Set(['PlatformAuditLog', 'ProcessedWebhookEvent']);

describe('Cobertura de hardDeleteTenant', () => {
  it('cubre todo modelo con companyId — explícito, cascada verificada, o excluido a propósito', () => {
    const explicit = explicitlyDeletedModelNames();
    const covered = new Set([
      ...explicit,
      ...CASCADES_TO_COMPANY,
      ...CASCADES_FROM_PROJECT,
      ...CASCADES_FROM_CANDIDATE,
      ...CASCADES_FROM_OTHER_EXPLICIT,
      ...NO_FK_TO_COMPANY,
      'Company',
    ]);

    const modelosConCompanyId = Prisma.dmmf.datamodel.models
      .filter((modelo) => modelo.fields.some((campo) => campo.name === 'companyId'))
      .map((modelo) => modelo.name);

    const sinCubrir = modelosConCompanyId.filter((nombre) => !covered.has(nombre));

    expect(sinCubrir).toEqual([]);
  });

  it('sigue borrando explícitamente los módulos de eventos, producción y agentes de IA', () => {
    // Ancla el fix concreto de esta sesión: si alguien revierte el bloque
    // nuevo de `hardDeleteTenant` sin darse cuenta, este test lo dice por
    // nombre en vez de solo "faltan modelos".
    const explicit = explicitlyDeletedModelNames();
    for (const modelo of [
      'Project',
      'Candidate',
      'CandidateSession',
      'SponsorshipContract',
      'FeeDocument',
      'PromissoryNote',
      'PaymentPlan',
      'PaymentPlanInstallment',
      'TicketType',
      'TicketSale',
      'VoteOrder',
      'DocumentTemplate',
      'Budget',
      'AgentTask',
      'AgentRun',
    ]) {
      expect(explicit.has(modelo)).toBe(true);
    }
  });
});
