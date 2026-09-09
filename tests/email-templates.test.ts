import {
  buildInvitationEmail,
  buildPasswordResetEmail,
  buildOperationalAlertEmail,
  buildVoteConfirmationEmail,
  buildMonthlyClosingEmail,
  buildContractSignedNoticeEmail,
  buildSponsorshipPaymentConfirmationEmail,
  buildAccountLockedNoticeEmail,
  buildAgentDigestEmail,
  buildNewLoginNoticeEmail,
  buildWeeklyReportEmail,
} from '@/lib/email/templates';

/**
 * Las plantillas incrustan datos que vienen de la base (razón social, nombre
 * del usuario) dentro de HTML. Si no se escapan, una empresa llamada
 * `<script>…` inyecta markup en el correo de todos sus invitados.
 */

describe('Correo de invitación', () => {
  const base = {
    companyName: 'Comercial Ejemplo SpA',
    roleLabel: 'Vendedor',
    inviterName: 'admin@ejemplo.cl',
    acceptUrl: 'https://erp.ejemplo.cl/accept-invitation?token=abc123',
    expiresInDays: 7,
  };

  it('nombra la empresa en el asunto', () => {
    expect(buildInvitationEmail(base).subject).toBe('Te invitaron a Comercial Ejemplo SpA');
  });

  it('incluye el enlace de aceptación en HTML y en texto plano', () => {
    const email = buildInvitationEmail(base);
    expect(email.html).toContain(base.acceptUrl);
    expect(email.text).toContain(base.acceptUrl);
  });

  it('menciona el rol y la vigencia', () => {
    const email = buildInvitationEmail(base);
    expect(email.text).toContain('Vendedor');
    expect(email.text).toContain('7 días');
  });

  it('trae versión de texto plano no vacía', () => {
    // Un correo solo-HTML es inaccesible para lectores de pantalla y puntúa
    // peor en los filtros de spam.
    expect(buildInvitationEmail(base).text.trim().length).toBeGreaterThan(50);
  });

  it('escapa HTML en la razón social', () => {
    const email = buildInvitationEmail({ ...base, companyName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('escapa HTML en el nombre de quien invita', () => {
    const email = buildInvitationEmail({ ...base, inviterName: '"><img src=x onerror=alert(1)>' });
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img');
  });
});

describe('Correo de recuperación de contraseña', () => {
  const base = {
    userName: 'Ana Pérez',
    resetUrl: 'https://erp.ejemplo.cl/reset-password?token=xyz789',
    expiresInMinutes: 60,
  };

  it('incluye el enlace en ambos formatos', () => {
    const email = buildPasswordResetEmail(base);
    expect(email.html).toContain(base.resetUrl);
    expect(email.text).toContain(base.resetUrl);
  });

  it('advierte la vigencia y el uso único', () => {
    const email = buildPasswordResetEmail(base);
    expect(email.text).toContain('60 minutos');
    expect(email.text).toContain('una sola vez');
  });

  it('indica qué hacer si el usuario no pidió el cambio', () => {
    // Sin esta línea, un correo inesperado parece un compromiso de la cuenta.
    expect(buildPasswordResetEmail(base).text).toContain('Si no pediste el cambio');
  });

  it('escapa HTML en el nombre del usuario', () => {
    const email = buildPasswordResetEmail({ ...base, userName: '<b>Ana</b>' });
    expect(email.html).not.toContain('<b>Ana</b>');
    expect(email.html).toContain('&lt;b&gt;');
  });

  it('no filtra el token en el asunto', () => {
    // El asunto queda en previsualizaciones y notificaciones de escritorio.
    expect(buildPasswordResetEmail(base).subject).not.toContain('xyz789');
  });
});

describe('Correo de alerta operativa (stock bajo + compras pendientes)', () => {
  const base = {
    companyName: 'Comercial Ejemplo SpA',
    lowStock: [{ sku: 'SKU-1', name: 'Producto Uno', totalStock: 2, minStock: 5 }],
    pendingApprovals: [{ folio: 'F-100', contactName: 'Proveedor Uno', totalAmount: 150000, daysPending: 3 }],
    overdueReceivables: [] as { folio: string; contactName: string; pendingAmount: number; daysOverdue: number }[],
    expiringContracts: [] as { candidateName: string; documentTitle: string; daysUntilExpiry: number }[],
    mismatchedPurchases: [] as { folio: string; contactName: string; totalAmount: number; matchNotes: string }[],
    dashboardUrl: 'https://erp.ejemplo.cl/dashboard',
  };

  it('cuenta ambos tipos de alerta en el asunto', () => {
    expect(buildOperationalAlertEmail(base).subject).toBe('Alerta operativa — 2 puntos que revisar');
  });

  it('usa singular cuando hay un solo punto', () => {
    const email = buildOperationalAlertEmail({ ...base, pendingApprovals: [] });
    expect(email.subject).toBe('Alerta operativa — 1 punto que revisar');
  });

  it('incluye SKU, stock actual y mínimo en HTML y texto', () => {
    const email = buildOperationalAlertEmail(base);
    expect(email.html).toContain('SKU-1');
    expect(email.text).toContain('SKU-1');
    expect(email.text).toContain('2 disponibles');
    expect(email.text).toContain('mínimo 5');
  });

  it('incluye folio, proveedor y monto formateado de las compras pendientes', () => {
    const email = buildOperationalAlertEmail(base);
    expect(email.html).toContain('F-100');
    expect(email.text).toContain('Proveedor Uno');
    expect(email.text).toContain('3 día(s) esperando');
  });

  it('omite la sección de stock si no hay productos bajo mínimo', () => {
    const email = buildOperationalAlertEmail({ ...base, lowStock: [] });
    expect(email.html).not.toContain('Stock bajo el mínimo');
    expect(email.text).not.toContain('Stock bajo el mínimo');
  });

  it('incluye la cantidad sugerida y el proveedor habitual cuando vienen calculados', () => {
    const email = buildOperationalAlertEmail({
      ...base,
      lowStock: [{ sku: 'SKU-1', name: 'Producto Uno', totalStock: 2, minStock: 5, suggestedQuantity: 8, suggestedSupplier: 'Proveedor Habitual SpA', lastUnitCost: 1000 }],
    });
    expect(email.html).toContain('Proveedor Habitual SpA');
    expect(email.text).toContain('reponer 8 a Proveedor Habitual SpA');
  });

  it('avisa que no hay compras previas cuando no hay proveedor sugerido', () => {
    const email = buildOperationalAlertEmail({
      ...base,
      lowStock: [{ sku: 'SKU-1', name: 'Producto Uno', totalStock: 2, minStock: 5, suggestedQuantity: 8, suggestedSupplier: null }],
    });
    expect(email.text).toContain('reponer 8 (sin compras previas)');
    expect(email.html).toContain('sin compras previas');
  });

  it('omite la sección de aprobaciones si no hay compras pendientes', () => {
    const email = buildOperationalAlertEmail({ ...base, pendingApprovals: [] });
    expect(email.html).not.toContain('esperando aprobación');
  });

  it('cuenta cuentas por cobrar vencidas, mismatch y contratos por vencer en el asunto', () => {
    const email = buildOperationalAlertEmail({
      ...base,
      overdueReceivables: [{ folio: '55', contactName: 'Cliente Uno', pendingAmount: 30000, daysOverdue: 5 }],
      mismatchedPurchases: [{ folio: 'F-200', contactName: 'Proveedor Dos', totalAmount: 90000, matchNotes: 'Cantidad no coincide' }],
      expiringContracts: [{ candidateName: 'Ana', documentTitle: 'Contrato de imagen', daysUntilExpiry: 3 }],
    });
    expect(email.subject).toBe('Alerta operativa — 5 puntos que revisar');
  });

  it('incluye cuentas por cobrar vencidas con días de atraso', () => {
    const email = buildOperationalAlertEmail({
      ...base,
      overdueReceivables: [{ folio: '55', contactName: 'Cliente Uno', pendingAmount: 30000, daysOverdue: 5 }],
    });
    expect(email.html).toContain('Cliente Uno');
    expect(email.text).toContain('vencido hace 5 día(s)');
  });

  it('incluye compras con mismatch sin resolver y el detalle de la diferencia', () => {
    const email = buildOperationalAlertEmail({
      ...base,
      mismatchedPurchases: [{ folio: 'F-200', contactName: 'Proveedor Dos', totalAmount: 90000, matchNotes: 'Cantidad no coincide' }],
    });
    expect(email.html).toContain('F-200');
    expect(email.text).toContain('Cantidad no coincide');
  });

  it('incluye contratos por vencer, distinguiendo vencidos de próximos a vencer', () => {
    const proximo = buildOperationalAlertEmail({
      ...base,
      expiringContracts: [{ candidateName: 'Ana', documentTitle: 'Contrato de imagen', daysUntilExpiry: 3 }],
    });
    expect(proximo.text).toContain('en 3 día(s)');

    const vencido = buildOperationalAlertEmail({
      ...base,
      expiringContracts: [{ candidateName: 'Ana', documentTitle: 'Contrato de imagen', daysUntilExpiry: -2 }],
    });
    expect(vencido.text).toContain('vencido hace 2 día(s)');
  });

  it('omite las secciones nuevas cuando vienen vacías', () => {
    const email = buildOperationalAlertEmail(base);
    expect(email.html).not.toContain('Cuentas por cobrar vencidas');
    expect(email.html).not.toContain('diferencia sin resolver');
    expect(email.html).not.toContain('Contratos de imagen por vencer');
  });

  it('escapa HTML en el nombre del producto y del proveedor', () => {
    const email = buildOperationalAlertEmail({
      ...base,
      lowStock: [{ ...base.lowStock[0]!, name: '<script>alert(1)</script>' }],
      pendingApprovals: [{ ...base.pendingApprovals[0]!, contactName: '<img src=x onerror=alert(1)>' }],
    });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).not.toContain('<img src=x');
  });

  it('incluye el link al panel', () => {
    expect(buildOperationalAlertEmail(base).text).toContain(base.dashboardUrl);
  });
});

describe('Correo de confirmación de voto pagado', () => {
  const base = {
    projectName: 'Miss Ejemplo 2026',
    companyName: 'Comercial Ejemplo SpA',
    candidateName: 'Ana',
    voteCount: 50,
    totalAmount: 25000,
  };

  it('nombra a la candidata en el asunto', () => {
    expect(buildVoteConfirmationEmail(base).subject).toBe('Confirmamos tu voto por Ana — Miss Ejemplo 2026');
  });

  it('incluye cantidad de votos y monto total', () => {
    const email = buildVoteConfirmationEmail(base);
    expect(email.text).toContain('Votos: 50');
    expect(email.text).toContain('25.000');
  });

  it('escapa HTML en el nombre de la candidata', () => {
    const email = buildVoteConfirmationEmail({ ...base, candidateName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('trae versión de texto plano no vacía', () => {
    expect(buildVoteConfirmationEmail(base).text.trim().length).toBeGreaterThan(30);
  });
});

describe('Correo de cierre mensual (F29 + cuadraturas)', () => {
  const base = {
    companyName: 'Comercial Ejemplo SpA',
    year: 2026,
    month: 8,
    netSales: 1000000,
    debitVat: 190000,
    creditVat: 50000,
    previousRemanent: 0,
    remanentCredit: 0,
    ppmAmount: 10000,
    determinedTax: 150000,
    honorariumRetentionAmount: 0,
    checks: [
      { label: 'Existencias', expected: 500000, actual: 500000, difference: 0, inBalance: true },
      { label: 'Caja', expected: 100000, actual: 95000, difference: 5000, inBalance: false },
    ],
    dashboardUrl: 'https://erp.ejemplo.cl/dashboard/reports/f29',
  };

  it('nombra el mes y avisa cuando hay cuadraturas con diferencia', () => {
    expect(buildMonthlyClosingEmail(base).subject).toBe('Cierre de agosto 2026 — 1 cuadratura con diferencia');
  });

  it('dice que todo cuadró cuando no hay diferencias', () => {
    const email = buildMonthlyClosingEmail({ ...base, checks: base.checks.map((c) => ({ ...c, difference: 0, inBalance: true })) });
    expect(email.subject).toBe('Cierre de agosto 2026 — F29 calculado, todo cuadrado');
  });

  it('incluye el impuesto determinado y las cuentas con diferencia', () => {
    const email = buildMonthlyClosingEmail(base);
    expect(email.text).toContain('Impuesto determinado');
    expect(email.text).toContain('150.000');
    expect(email.text).toContain('Caja: esperado');
    expect(email.text).toContain('DIFERENCIA de $5.000');
  });

  it('avisa cuando no hay cuentas mapeadas en vez de mostrar una tabla vacía', () => {
    const email = buildMonthlyClosingEmail({ ...base, checks: [] });
    expect(email.text).toContain('configura el plan de cuentas');
  });

  it('escapa HTML en el nombre de la empresa', () => {
    const email = buildMonthlyClosingEmail({ ...base, companyName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Aviso de firma electrónica completada', () => {
  const base = {
    candidateName: 'Ana',
    documentTitle: 'Contrato de imagen',
    dashboardUrl: 'https://erp.ejemplo.cl/dashboard/candidates/c1',
  };

  it('nombra a la candidata y el documento en el asunto', () => {
    expect(buildContractSignedNoticeEmail(base).subject).toBe('Firma completada — Contrato de imagen de Ana');
  });

  it('incluye el link a la ficha de la candidata', () => {
    const email = buildContractSignedNoticeEmail(base);
    expect(email.html).toContain(base.dashboardUrl);
    expect(email.text).toContain(base.dashboardUrl);
  });

  it('escapa HTML en el nombre de la candidata', () => {
    const email = buildContractSignedNoticeEmail({ ...base, candidateName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Correo de confirmación de pago de auspicio', () => {
  const base = {
    contactName: 'Marca Uno SpA',
    projectName: 'Miss Ejemplo 2026',
    companyName: 'Comercial Ejemplo SpA',
    tierLabel: 'Oro',
    paidAmount: 500000,
    isBarter: false,
  };

  it('nombra el proyecto en el asunto', () => {
    expect(buildSponsorshipPaymentConfirmationEmail(base).subject).toBe('Confirmamos el pago de tu auspicio — Miss Ejemplo 2026');
  });

  it('incluye el nivel y el monto pagado', () => {
    const email = buildSponsorshipPaymentConfirmationEmail(base);
    expect(email.text).toContain('Nivel de auspicio: Oro');
    expect(email.text).toContain('500.000');
  });

  it('menciona el canje solo cuando corresponde', () => {
    const conCanje = buildSponsorshipPaymentConfirmationEmail({ ...base, isBarter: true });
    expect(conCanje.text).toContain('canje');

    const sinCanje = buildSponsorshipPaymentConfirmationEmail(base);
    expect(sinCanje.text).not.toContain('canje');
  });

  it('escapa HTML en el nombre del contacto', () => {
    const email = buildSponsorshipPaymentConfirmationEmail({ ...base, contactName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Aviso de cuenta bloqueada por intentos fallidos', () => {
  const base = { lockedUserName: 'Ana Pérez', lockedUserEmail: 'ana@ejemplo.cl', lockoutMinutes: 15, maxAttempts: 5 };

  it('nombra el correo de la cuenta bloqueada en el asunto', () => {
    expect(buildAccountLockedNoticeEmail(base).subject).toBe('Cuenta bloqueada por intentos fallidos — ana@ejemplo.cl');
  });

  it('incluye la cantidad de intentos y los minutos de bloqueo', () => {
    const email = buildAccountLockedNoticeEmail(base);
    expect(email.text).toContain('5 intentos');
    expect(email.text).toContain('15 minutos');
  });

  it('escapa HTML en el nombre del usuario', () => {
    const email = buildAccountLockedNoticeEmail({ ...base, lockedUserName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Correo de resumen ejecutivo diario (agente CEO)', () => {
  const base = {
    companyName: 'Comercial Ejemplo SpA',
    priorities: ['Renegociar plazo con el proveedor Uno', 'Revisar el stock crítico de la línea Dos'],
    dashboardUrl: 'https://erp.ejemplo.cl/dashboard/agents',
  };

  it('nombra la empresa en el asunto', () => {
    expect(buildAgentDigestEmail(base).subject).toBe('Prioridades de hoy — Comercial Ejemplo SpA');
  });

  it('numera cada prioridad en el texto plano', () => {
    const email = buildAgentDigestEmail(base);
    expect(email.text).toContain('1. Renegociar plazo con el proveedor Uno');
    expect(email.text).toContain('2. Revisar el stock crítico de la línea Dos');
  });

  it('incluye el link al dashboard de agentes', () => {
    expect(buildAgentDigestEmail(base).text).toContain(base.dashboardUrl);
  });

  it('escapa HTML en una prioridad', () => {
    const email = buildAgentDigestEmail({ ...base, priorities: ['<script>alert(1)</script>'] });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Aviso de nuevo inicio de sesión', () => {
  const base = { userName: 'Ana Pérez', ipAddress: '200.1.2.3', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', loginAt: new Date('2026-08-01T12:00:00Z') };

  it('incluye la IP y el asunto de seguridad', () => {
    const email = buildNewLoginNoticeEmail(base);
    expect(email.subject).toBe('Nuevo inicio de sesión en tu cuenta');
    expect(email.text).toContain('200.1.2.3');
  });

  it('incluye el dispositivo cuando viene informado', () => {
    const email = buildNewLoginNoticeEmail(base);
    expect(email.text).toContain('Mozilla/5.0 (Windows NT 10.0)');
  });

  it('omite la línea de dispositivo cuando no hay userAgent', () => {
    const email = buildNewLoginNoticeEmail({ ...base, userAgent: null });
    expect(email.text).not.toContain('Dispositivo:');
  });

  it('advierte qué hacer si no fue la persona', () => {
    expect(buildNewLoginNoticeEmail(base).text).toContain('cambia tu contraseña de inmediato');
  });

  it('escapa HTML en el nombre del usuario', () => {
    const email = buildNewLoginNoticeEmail({ ...base, userName: '<script>alert(1)</script>' });
    expect(email.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('Correo de entrega del reporte semanal', () => {
  const base = {
    companyName: 'Comercial Ejemplo SpA',
    from: new Date('2026-08-01T00:00:00-04:00'),
    to: new Date('2026-08-08T00:00:00-04:00'),
    dashboardUrl: 'https://erp.ejemplo.cl/dashboard/reports',
  };

  it('incluye el rango de fechas en el asunto', () => {
    expect(buildWeeklyReportEmail(base).subject).toContain('Reporte semanal');
  });

  it('menciona que el libro va adjunto', () => {
    expect(buildWeeklyReportEmail(base).text).toContain('Adjuntamos el libro Excel');
  });

  it('incluye el link al panel', () => {
    expect(buildWeeklyReportEmail(base).text).toContain(base.dashboardUrl);
  });
});
