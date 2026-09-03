import { buildInvitationEmail, buildPasswordResetEmail } from '@/lib/email/templates';

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
