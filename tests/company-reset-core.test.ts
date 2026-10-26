import {
  KEPT_TENANT_TABLES,
  ResetPlanError,
  buildResetPlan,
  confirmationMatches,
  matchCompanies,
  parseResetArgs,
  quoteIdent,
  type ForeignKey,
} from '@/lib/company-erasure/core';

/**
 * Plan de borrado del reseteo de una empresa: orden de las tablas, lo que se
 * conserva y cuándo se niega a armar un plan inseguro. La corrida real contra
 * Postgres está en `company-reset-db.test.ts`.
 */

const fk = (child: string, parent: string, overrides: Partial<ForeignKey> = {}): ForeignKey => ({
  name: `${child}_${parent}_fkey`, child, parent, columns: [`${parent[0].toLowerCase()}${parent.slice(1)}Id`], onDelete: 'r', nullable: false, ...overrides,
});

describe('buildResetPlan', () => {
  const tenantTables = ['Sale', 'SaleItem', 'Product', 'Category', 'User', 'CompanyFeatures'];

  it('borra primero las hijas y después las madres, sin tocar lo que se conserva', () => {
    const plan = buildResetPlan({
      tenantTables,
      foreignKeys: [fk('SaleItem', 'Sale'), fk('SaleItem', 'Product'), fk('Product', 'Category'), fk('Sale', 'User'), fk('CompanyFeatures', 'User')],
      keptTables: ['User', 'CompanyFeatures'],
    });
    expect(plan.deleteOrder).toHaveLength(4);
    expect(plan.deleteOrder).not.toContain('User');
    expect(plan.deleteOrder).not.toContain('CompanyFeatures');
    const at = (table: string) => plan.deleteOrder.indexOf(table);
    expect(at('SaleItem')).toBeLessThan(at('Sale'));
    expect(at('SaleItem')).toBeLessThan(at('Product'));
    expect(at('Product')).toBeLessThan(at('Category'));
  });

  it('es determinista: el mismo esquema da siempre el mismo orden', () => {
    const input = { tenantTables, foreignKeys: [fk('SaleItem', 'Sale'), fk('Product', 'Category')], keptTables: ['User', 'CompanyFeatures'] };
    expect(buildResetPlan(input).deleteOrder).toEqual(buildResetPlan({ ...input, tenantTables: [...tenantTables].reverse() }).deleteOrder);
  });

  it('anula primero las autorreferencias (cuenta madre, asiento reversado)', () => {
    const plan = buildResetPlan({
      tenantTables: ['Account'],
      foreignKeys: [fk('Account', 'Account', { columns: ['parentId'], nullable: true })],
      keptTables: [],
    });
    expect(plan.deleteOrder).toEqual(['Account']);
    expect(plan.selfReferences).toEqual([{ table: 'Account', columns: ['parentId'] }]);
  });

  it('se niega si una autorreferencia es obligatoria', () => {
    expect(() => buildResetPlan({ tenantTables: ['Node'], foreignKeys: [fk('Node', 'Node', { nullable: false })], keptTables: [] })).toThrow(ResetPlanError);
  });

  it('se niega si dos tablas se apuntan en círculo con llaves que bloquean', () => {
    expect(() => buildResetPlan({ tenantTables: ['A', 'B'], foreignKeys: [fk('A', 'B'), fk('B', 'A')], keptTables: [] })).toThrow(/ciclo/);
    expect(() => buildResetPlan({ tenantTables: ['A', 'B'], foreignKeys: [fk('A', 'B', { onDelete: 'a' }), fk('B', 'A', { onDelete: 'r' })], keptTables: [] })).toThrow(/ciclo/);
  });

  it('las llaves SET NULL y CASCADE no imponen orden: un círculo hecho con ellas no es problema', () => {
    const plan = buildResetPlan({
      tenantTables: ['SalesDocument', 'SalesOrder'],
      foreignKeys: [fk('SalesDocument', 'SalesOrder', { onDelete: 'n', nullable: true }), fk('SalesOrder', 'SalesDocument', { onDelete: 'c' })],
      keptTables: [],
    });
    expect(plan.deleteOrder.sort()).toEqual(['SalesDocument', 'SalesOrder']);
    // Una autorreferencia que se suelta sola tampoco necesita anularse antes.
    expect(buildResetPlan({ tenantTables: ['Account'], foreignKeys: [fk('Account', 'Account', { onDelete: 'n', nullable: true })], keptTables: [] }).selfReferences).toEqual([]);
  });

  it('se niega si una tabla que se conserva bloquearía el borrado', () => {
    expect(() => buildResetPlan({
      tenantTables: ['User', 'Warehouse'], foreignKeys: [fk('User', 'Warehouse', { onDelete: 'r' })], keptTables: ['User'],
    })).toThrow(/bloquearía/);
    expect(() => buildResetPlan({
      tenantTables: ['User', 'Warehouse'], foreignKeys: [fk('User', 'Warehouse', { onDelete: 'a' })], keptTables: ['User'],
    })).toThrow(/bloquearía/);
  });

  it('se niega si borrar arrastraría por cascada filas de una tabla que se conserva', () => {
    expect(() => buildResetPlan({
      tenantTables: ['User', 'Warehouse'], foreignKeys: [fk('User', 'Warehouse', { onDelete: 'c' })], keptTables: ['User'],
    })).toThrow(/cascada/);
  });

  it('acepta lo conservado que solo queda sin vínculo (SET NULL) y la cascada permitida', () => {
    const plan = buildResetPlan({
      tenantTables: ['User', 'JobPosition', 'Conversation'],
      foreignKeys: [fk('User', 'JobPosition', { onDelete: 'n', nullable: true }), fk('ConversationParticipant', 'Conversation', { onDelete: 'c' })],
      keptTables: ['User'],
    });
    expect(plan.deleteOrder.sort()).toEqual(['Conversation', 'JobPosition']);
  });

  it('una tabla nueva con companyId entra sola al plan', () => {
    const plan = buildResetPlan({ tenantTables: [...tenantTables, 'BrandNewModule'], foreignKeys: [fk('BrandNewModule', 'Product')], keptTables: ['User', 'CompanyFeatures'] });
    expect(plan.deleteOrder).toContain('BrandNewModule');
    expect(plan.deleteOrder.indexOf('BrandNewModule')).toBeLessThan(plan.deleteOrder.indexOf('Product'));
  });
});

describe('qué se conserva', () => {
  it('son usuarios, roles, módulos, configuración y la bitácora de la plataforma', () => {
    expect([...KEPT_TENANT_TABLES].sort()).toEqual([
      'CompanyErasureRequest', 'CompanyFeatures', 'CompanyMembership', 'CompanySettings', 'CustomRole', 'Invitation', 'McpPersonalToken',
      'PlatformAuditLog', 'PushSubscription', 'User', 'UserSession',
    ]);
  });
});

describe('matchCompanies', () => {
  const companies = [
    { id: 'c1', rut: '76.123.456-7', businessName: 'Chakra SpA' },
    { id: 'c2', rut: '77.000.000-K', businessName: 'Otra Empresa Ltda' },
  ];

  it('encuentra por id, por RUT con o sin formato y por razón social exacta', () => {
    expect(matchCompanies(companies, 'c2').map((c) => c.id)).toEqual(['c2']);
    expect(matchCompanies(companies, '76.123.456-7').map((c) => c.id)).toEqual(['c1']);
    expect(matchCompanies(companies, '761234567').map((c) => c.id)).toEqual(['c1']);
    expect(matchCompanies(companies, '77000000k').map((c) => c.id)).toEqual(['c2']);
    expect(matchCompanies(companies, '  chakra spa ').map((c) => c.id)).toEqual(['c1']);
  });

  it('no adivina: un pedazo del nombre o una búsqueda vacía no coincide', () => {
    expect(matchCompanies(companies, 'Chakra')).toEqual([]);
    expect(matchCompanies(companies, '')).toEqual([]);
    expect(matchCompanies(companies, '   ')).toEqual([]);
  });
});

describe('parseResetArgs', () => {
  it('lee las opciones', () => {
    expect(parseResetArgs(['--empresa', '76.123.456-7', '--commit', '--confirmar', 'Chakra SpA', '--acepto-perder-datos-reales'])).toEqual({
      company: '76.123.456-7', commit: true, confirm: 'Chakra SpA', acceptRealData: true, help: false,
    });
    expect(parseResetArgs([])).toEqual({ company: null, commit: false, confirm: null, acceptRealData: false, help: false });
    expect(parseResetArgs(['--ayuda']).help).toBe(true);
  });

  it('rechaza lo desconocido y los valores que faltan', () => {
    expect(() => parseResetArgs(['--todo'])).toThrow(/desconocida/);
    expect(() => parseResetArgs(['--empresa'])).toThrow(/Falta/);
    expect(() => parseResetArgs(['--empresa', '--commit'])).toThrow(/Falta/);
  });
});

describe('confirmationMatches', () => {
  it('exige la razón social completa, sin importar mayúsculas ni espacios repetidos', () => {
    expect(confirmationMatches('Chakra SpA', 'Chakra SpA')).toBe(true);
    expect(confirmationMatches('Chakra SpA', '  chakra   spa ')).toBe(true);
    expect(confirmationMatches('Chakra SpA', 'Chakra')).toBe(false);
    expect(confirmationMatches('Chakra SpA', '')).toBe(false);
    expect(confirmationMatches('Chakra SpA', null)).toBe(false);
  });
});

describe('quoteIdent', () => {
  it('entrecomilla y escapa', () => {
    expect(quoteIdent('JournalEntry')).toBe('"JournalEntry"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});
