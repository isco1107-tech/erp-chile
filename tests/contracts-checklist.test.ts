import {
  candidateChecklistItem,
  contractState,
  pickCurrentContract,
  sortChecklist,
  sponsorChecklistItem,
  summarizeByProject,
  summarizeContracts,
  type CandidateContractSource,
  type SponsorContractSource,
} from '@/lib/events/contracts-checklist';

const NOW = new Date('2026-09-25T15:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const project = { id: 'p1', name: 'Miss Temuco 2026' };

function candidate(overrides: Partial<CandidateContractSource> = {}): CandidateContractSource {
  return { id: 'c1', fullName: 'Ana Pérez', stageName: null, status: 'OFFICIAL_CANDIDATE', candidateNumber: 7, project, contracts: [], ...overrides };
}

function sponsor(overrides: Partial<SponsorContractSource> = {}): SponsorContractSource {
  return {
    id: 's1',
    status: 'CONFIRMED',
    tierLabel: 'Oro',
    cashAmount: 5_000_000,
    contactName: 'Marca SpA',
    project,
    agreementFileUrl: null,
    agreementGeneratedAt: null,
    agreementSignedAt: null,
    ...overrides,
  };
}

describe('estado de un contrato', () => {
  it('se deriva de las fechas, con vencido por sobre firmado', () => {
    expect(contractState(null, NOW)).toBe('NOT_GENERATED');
    expect(contractState({ createdAt: daysAgo(3), signedAt: null, expiresAt: null }, NOW)).toBe('PENDING_SIGNATURE');
    expect(contractState({ createdAt: daysAgo(3), signedAt: daysAgo(1), expiresAt: null }, NOW)).toBe('SIGNED');
    expect(contractState({ createdAt: daysAgo(400), signedAt: daysAgo(390), expiresAt: daysAgo(1) }, NOW)).toBe('EXPIRED');
  });

  it('entre varios contratos manda el firmado vigente, si no el más reciente', () => {
    const expired = { createdAt: daysAgo(400), signedAt: daysAgo(390), expiresAt: daysAgo(10) };
    const fresh = { createdAt: daysAgo(2), signedAt: null, expiresAt: null };
    expect(pickCurrentContract([expired, fresh], NOW)).toBe(fresh);
    const signed = { createdAt: daysAgo(5), signedAt: daysAgo(4), expiresAt: null };
    expect(pickCurrentContract([fresh, signed], NOW)).toBe(signed);
  });
});

describe('candidatas en el checklist', () => {
  it('una oficial sin contrato queda como sin generar', () => {
    const item = candidateChecklistItem(candidate(), NOW);
    expect(item?.state).toBe('NOT_GENERATED');
    expect(item?.partyDetail).toBe('N° 7 · Candidata oficial');
    expect(item?.href).toBe('/dashboard/candidates/c1');
  });

  it('una postulante sin contrato no entra; con contrato generado sí', () => {
    expect(candidateChecklistItem(candidate({ status: 'APPLICANT' }), NOW)).toBeNull();
    const withDoc = candidate({ status: 'APPLICANT', contracts: [{ createdAt: daysAgo(1), signedAt: null, expiresAt: null, zapsignSignUrl: 'https://zapsign/x' }] });
    expect(candidateChecklistItem(withDoc, NOW)?.state).toBe('PENDING_SIGNATURE');
  });

  it('retiradas y rechazadas nunca entran', () => {
    const doc = { createdAt: daysAgo(1), signedAt: null, expiresAt: null, zapsignSignUrl: null };
    expect(candidateChecklistItem(candidate({ status: 'WITHDRAWN', contracts: [doc] }), NOW)).toBeNull();
    expect(candidateChecklistItem(candidate({ status: 'REJECTED' }), NOW)).toBeNull();
  });

  it('marca como atrasado lo que espera firma hace más de 7 días y expone el link solo mientras está pendiente', () => {
    const late = candidateChecklistItem(candidate({ contracts: [{ createdAt: daysAgo(9), signedAt: null, expiresAt: null, zapsignSignUrl: 'https://zapsign/x' }] }), NOW);
    expect(late?.daysPending).toBe(9);
    expect(late?.stale).toBe(true);
    expect(late?.signUrl).toBe('https://zapsign/x');
    const signed = candidateChecklistItem(candidate({ contracts: [{ createdAt: daysAgo(9), signedAt: daysAgo(2), expiresAt: null, zapsignSignUrl: 'https://zapsign/x' }] }), NOW);
    expect(signed?.stale).toBe(false);
    expect(signed?.signUrl).toBeNull();
  });
});

describe('auspicios en el checklist', () => {
  it('confirmado sin carta queda sin generar; propuesta sin carta no entra; cancelado nunca', () => {
    expect(sponsorChecklistItem(sponsor(), NOW)?.state).toBe('NOT_GENERATED');
    expect(sponsorChecklistItem(sponsor({ status: 'PROPOSAL' }), NOW)).toBeNull();
    expect(sponsorChecklistItem(sponsor({ status: 'CANCELLED', agreementFileUrl: 'x', agreementGeneratedAt: daysAgo(1) }), NOW)).toBeNull();
  });

  it('carta generada queda pendiente y firmada queda firmada', () => {
    const pending = sponsorChecklistItem(sponsor({ status: 'PROPOSAL', agreementFileUrl: 'x', agreementGeneratedAt: daysAgo(3) }), NOW);
    expect(pending?.state).toBe('PENDING_SIGNATURE');
    expect(pending?.amount).toBe(5_000_000);
    const signed = sponsorChecklistItem(sponsor({ agreementFileUrl: 'x', agreementGeneratedAt: daysAgo(3), agreementSignedAt: daysAgo(1) }), NOW);
    expect(signed?.state).toBe('SIGNED');
  });

  it('canje puro no muestra monto en efectivo', () => {
    expect(sponsorChecklistItem(sponsor({ cashAmount: 0 }), NOW)?.amount).toBeNull();
  });
});

describe('resúmenes', () => {
  const items = [
    candidateChecklistItem(candidate({ id: 'a', contracts: [{ createdAt: daysAgo(3), signedAt: daysAgo(1), expiresAt: null, zapsignSignUrl: null }] }), NOW)!,
    candidateChecklistItem(candidate({ id: 'b', contracts: [{ createdAt: daysAgo(10), signedAt: null, expiresAt: null, zapsignSignUrl: null }] }), NOW)!,
    candidateChecklistItem(candidate({ id: 'c' }), NOW)!,
    sponsorChecklistItem(sponsor({ project: { id: 'p2', name: 'Reina Sur' }, agreementFileUrl: 'x', agreementGeneratedAt: daysAgo(3), agreementSignedAt: daysAgo(1) }), NOW)!,
  ];

  it('cuenta firmados, pendientes, sin generar y atrasados', () => {
    expect(summarizeContracts(items)).toEqual({ total: 4, signed: 2, pending: 1, notGenerated: 1, expired: 0, stale: 1, signedPercent: 50 });
    expect(summarizeContracts([]).signedPercent).toBeNull();
  });

  it('agrupa por certamen, primero el que tiene más por firmar', () => {
    const groups = summarizeByProject(items);
    expect(groups.map((g) => g.projectId)).toEqual(['p1', 'p2']);
    expect(groups[0]).toMatchObject({ total: 3, signed: 1 });
    expect(groups[1]).toMatchObject({ total: 1, signed: 1, signedPercent: 100 });
  });

  it('ordena lo que requiere acción primero y lo firmado al final', () => {
    const states = sortChecklist(items).map((item) => item.state);
    expect(states).toEqual(['NOT_GENERATED', 'PENDING_SIGNATURE', 'SIGNED', 'SIGNED']);
  });
});
