/**
 * Checklist de contratos firmados de la productora: contratos de imagen de
 * candidatas (`CandidateDocument` con `documentType = CONTRACT_IMAGE`) y
 * cartas de compromiso de auspiciadores (`SponsorshipContract.agreement*`),
 * en una sola lista. Funciones puras: el servicio lee la base y esto decide
 * el estado de cada contrato, igual que `readiness.ts` para el centro de mando.
 *
 * El estado nunca se guarda: se deriva cada vez de las fechas, así un
 * contrato que vence hoy aparece vencido sin que nadie lo vuelva a guardar.
 */

export type ContractKind = 'CANDIDATE_IMAGE' | 'SPONSOR_AGREEMENT';
export type ContractState = 'NOT_GENERATED' | 'PENDING_SIGNATURE' | 'SIGNED' | 'EXPIRED';

/** Días pendiente de firma desde los que el contrato se marca como atrasado. */
export const STALE_SIGNATURE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Estados de candidata que obligan a tener contrato de imagen firmado. */
export const CANDIDATE_STATUSES_REQUIRING_CONTRACT = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'] as const;
/** Estados de candidata que nunca entran al checklist (salió del certamen). */
const CANDIDATE_STATUSES_EXCLUDED = new Set(['WITHDRAWN', 'REJECTED']);
/** Estados de auspicio que obligan a tener la carta firmada. */
const SPONSOR_STATUSES_REQUIRING_AGREEMENT = new Set(['CONFIRMED', 'COMPLETED']);

export interface ContractChecklistItem {
  /** Clave única en la lista (tipo + id de la contraparte). */
  key: string;
  kind: ContractKind;
  state: ContractState;
  /** Candidata o marca: quién tiene que firmar. */
  partyName: string;
  /** Detalle corto (estado en el certamen, nivel del auspicio). */
  partyDetail: string | null;
  projectId: string;
  projectName: string;
  /** Pantalla del panel donde se gestiona el contrato. */
  href: string;
  /** Cuándo se generó o envió a firma (null si no se ha generado). */
  generatedAt: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  /** Días que lleva esperando firma (solo en PENDING_SIGNATURE). */
  daysPending: number | null;
  /** Pendiente de firma hace más de `STALE_SIGNATURE_DAYS`. */
  stale: boolean;
  /** Link de firma electrónica (ZapSign), si se envió por esa vía. */
  signUrl: string | null;
  /** Monto comprometido (solo auspicios en efectivo). */
  amount: number | null;
}

export interface CandidateContractSource {
  id: string;
  fullName: string;
  stageName: string | null;
  status: string;
  candidateNumber: number | null;
  project: { id: string; name: string };
  contracts: Array<{ createdAt: Date; signedAt: Date | null; expiresAt: Date | null; zapsignSignUrl: string | null }>;
}

export interface SponsorContractSource {
  id: string;
  status: string;
  /** Nivel legible del auspicio ("Oro", "Auspiciador principal"…). */
  tierLabel: string;
  cashAmount: number;
  contactName: string;
  project: { id: string; name: string };
  agreementFileUrl: string | null;
  agreementGeneratedAt: Date | null;
  agreementSignedAt: Date | null;
}

type ContractFacts = { createdAt: Date | null; signedAt: Date | null; expiresAt: Date | null };

export function contractState(doc: ContractFacts | null, now: Date): ContractState {
  if (!doc) return 'NOT_GENERATED';
  if (doc.expiresAt && doc.expiresAt.getTime() < now.getTime()) return 'EXPIRED';
  if (doc.signedAt) return 'SIGNED';
  return 'PENDING_SIGNATURE';
}

/**
 * Con varias filas de contrato para la misma candidata (una vencida y otra
 * nueva, por ejemplo) manda la firmada vigente; si no hay, la más reciente.
 */
export function pickCurrentContract<T extends ContractFacts>(docs: readonly T[], now: Date): T | null {
  if (docs.length === 0) return null;
  const valid = docs.find((doc) => doc.signedAt && !(doc.expiresAt && doc.expiresAt.getTime() < now.getTime()));
  if (valid) return valid;
  return [...docs].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0] ?? null;
}

function pendingInfo(state: ContractState, generatedAt: Date | null, now: Date): { daysPending: number | null; stale: boolean } {
  if (state !== 'PENDING_SIGNATURE' || !generatedAt) return { daysPending: null, stale: false };
  const daysPending = Math.max(0, Math.floor((now.getTime() - generatedAt.getTime()) / DAY_MS));
  return { daysPending, stale: daysPending > STALE_SIGNATURE_DAYS };
}

const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  APPLICANT: 'Postulante',
  UNDER_REVIEW: 'En revisión',
  CALLED_TO_CASTING: 'Citada a casting',
  OFFICIAL_CANDIDATE: 'Candidata oficial',
  FINALIST: 'Finalista',
  WINNER: 'Ganadora',
};

/**
 * Una candidata entra al checklist si su estado exige contrato (oficial,
 * finalista, ganadora) o si ya se le generó uno antes de llegar ahí.
 */
export function candidateChecklistItem(source: CandidateContractSource, now: Date): ContractChecklistItem | null {
  if (CANDIDATE_STATUSES_EXCLUDED.has(source.status)) return null;
  const required = (CANDIDATE_STATUSES_REQUIRING_CONTRACT as readonly string[]).includes(source.status);
  const current = pickCurrentContract(source.contracts, now);
  if (!required && !current) return null;
  const state = contractState(current, now);
  const status = CANDIDATE_STATUS_LABEL[source.status] ?? null;
  return {
    key: `candidate:${source.id}`,
    kind: 'CANDIDATE_IMAGE',
    state,
    partyName: source.stageName ?? source.fullName,
    partyDetail: source.candidateNumber !== null && status ? `N° ${source.candidateNumber} · ${status}` : status,
    projectId: source.project.id,
    projectName: source.project.name,
    href: `/dashboard/candidates/${source.id}`,
    generatedAt: current?.createdAt.toISOString() ?? null,
    signedAt: current?.signedAt?.toISOString() ?? null,
    expiresAt: current?.expiresAt?.toISOString() ?? null,
    ...pendingInfo(state, current?.createdAt ?? null, now),
    signUrl: state === 'PENDING_SIGNATURE' ? (current?.zapsignSignUrl ?? null) : null,
    amount: null,
  };
}

/**
 * Un auspicio entra si está confirmado o completado (la carta es exigible) o
 * si, siendo propuesta, ya se le generó la carta. Los cancelados no entran.
 */
export function sponsorChecklistItem(source: SponsorContractSource, now: Date): ContractChecklistItem | null {
  if (source.status === 'CANCELLED') return null;
  const generated = Boolean(source.agreementFileUrl);
  if (!SPONSOR_STATUSES_REQUIRING_AGREEMENT.has(source.status) && !generated) return null;
  // Una carta marcada firmada cuenta aunque su archivo ya no esté.
  const facts =
    generated || source.agreementSignedAt
      ? { createdAt: source.agreementGeneratedAt, signedAt: source.agreementSignedAt, expiresAt: null }
      : null;
  const state = contractState(facts, now);
  return {
    key: `sponsor:${source.id}`,
    kind: 'SPONSOR_AGREEMENT',
    state,
    partyName: source.contactName,
    partyDetail: source.tierLabel,
    projectId: source.project.id,
    projectName: source.project.name,
    href: `/dashboard/sponsorships/${source.id}`,
    generatedAt: source.agreementGeneratedAt?.toISOString() ?? null,
    signedAt: source.agreementSignedAt?.toISOString() ?? null,
    expiresAt: null,
    ...pendingInfo(state, source.agreementGeneratedAt, now),
    signUrl: null,
    amount: source.cashAmount > 0 ? source.cashAmount : null,
  };
}

export interface ContractsSummary {
  total: number;
  signed: number;
  pending: number;
  notGenerated: number;
  expired: number;
  stale: number;
  /** % firmado (entero); null si no hay contratos exigibles. */
  signedPercent: number | null;
}

export function summarizeContracts(items: readonly ContractChecklistItem[]): ContractsSummary {
  const count = (state: ContractState) => items.filter((item) => item.state === state).length;
  const signed = count('SIGNED');
  return {
    total: items.length,
    signed,
    pending: count('PENDING_SIGNATURE'),
    notGenerated: count('NOT_GENERATED'),
    expired: count('EXPIRED'),
    stale: items.filter((item) => item.stale).length,
    signedPercent: items.length === 0 ? null : Math.round((signed / items.length) * 100),
  };
}

export interface ProjectContractsSummary extends ContractsSummary {
  projectId: string;
  projectName: string;
}

/** Resumen por certamen, primero los que tienen más contratos por firmar. */
export function summarizeByProject(items: readonly ContractChecklistItem[]): ProjectContractsSummary[] {
  const groups = new Map<string, ContractChecklistItem[]>();
  for (const item of items) {
    const list = groups.get(item.projectId);
    if (list) list.push(item);
    else groups.set(item.projectId, [item]);
  }
  return [...groups.values()]
    .map((list) => ({ projectId: list[0]!.projectId, projectName: list[0]!.projectName, ...summarizeContracts(list) }))
    .sort((a, b) => b.total - b.signed - (a.total - a.signed) || a.projectName.localeCompare(b.projectName, 'es'));
}

const STATE_ORDER: Record<ContractState, number> = { EXPIRED: 0, NOT_GENERATED: 1, PENDING_SIGNATURE: 2, SIGNED: 3 };

/** Orden del checklist: lo que requiere acción primero (vencidos, sin generar, atrasados). */
export function sortChecklist(items: readonly ContractChecklistItem[]): ContractChecklistItem[] {
  return [...items].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      Number(b.stale) - Number(a.stale) ||
      (b.daysPending ?? 0) - (a.daysPending ?? 0) ||
      a.projectName.localeCompare(b.projectName, 'es') ||
      a.partyName.localeCompare(b.partyName, 'es')
  );
}
