import { Prisma } from '@prisma/client';
import { listExportableModels, backupFileName, BACKUP_FORMAT_VERSION } from '@/modules/backup/services/company-backup.service';

/**
 * El respaldo se deriva del modelo de datos, no de una lista escrita a mano.
 * Estos tests protegen las dos propiedades que hacen confiable ese enfoque:
 * que no se escape ninguna tabla del tenant, y que no salga nada sensible.
 */

describe('Selección de tablas del respaldo', () => {
  const modelos = listExportableModels();
  const nombres = new Set(modelos.map((modelo) => modelo.name));

  it('incluye toda tabla con companyId, salvo las excluidas a propósito', () => {
    const conCompanyId = Prisma.dmmf.datamodel.models
      .filter((modelo) => modelo.fields.some((campo) => campo.name === 'companyId'))
      .map((modelo) => modelo.name);

    const excluidas = ['UserSession', 'TotpBackupCode', 'ProcessedWebhookEvent', 'PlatformAuditLog'];
    const esperadas = conCompanyId.filter((nombre) => !excluidas.includes(nombre));

    // Si alguien agrega un modelo nuevo con companyId, entra solo. Ese es el
    // punto: un respaldo incompleto no se nota hasta que se necesita.
    for (const nombre of esperadas) {
      expect(nombres.has(nombre)).toBe(true);
    }
  });

  it('cubre las tablas centrales del negocio', () => {
    for (const tabla of ['Contact', 'Product', 'SalesDocument', 'SalesDocumentItem', 'InventoryMovement', 'Payment', 'AuditLog']) {
      expect(nombres.has(tabla)).toBe(true);
    }
  });

  it('excluye sesiones vivas, códigos de 2FA y ruido de infraestructura', () => {
    for (const tabla of ['UserSession', 'TotpBackupCode', 'ProcessedWebhookEvent', 'PlatformAuditLog']) {
      expect(nombres.has(tabla)).toBe(false);
    }
  });

  it('no exporta ningún campo de credenciales', () => {
    // La regla es por patrón y no por lista: un modelo nuevo con `algoSecret`
    // queda cubierto sin que nadie tenga que acordarse.
    const patronSensible = /password|secret|token|hash|salt|credential|privatekey/i;

    for (const modelo of modelos) {
      for (const campo of modelo.fields) {
        expect(campo).not.toMatch(patronSensible);
      }
    }
  });

  it('deja fuera el passwordHash del usuario pero conserva sus datos de identidad', () => {
    const usuario = modelos.find((modelo) => modelo.name === 'User');
    expect(usuario).toBeDefined();
    expect(usuario?.fields).not.toContain('passwordHash');
    expect(usuario?.fields).toContain('email');
    expect(usuario?.fields).toContain('name');
  });

  it('no incluye relaciones, solo escalares y enums', () => {
    // Las filas relacionadas ya viajan en su propia tabla; anidarlas duplicaría
    // el archivo completo.
    const ventas = modelos.find((modelo) => modelo.name === 'SalesDocument');
    expect(ventas?.fields).toContain('totalAmount');
    expect(ventas?.fields).toContain('dteType');
    expect(ventas?.fields).not.toContain('items');
    expect(ventas?.fields).not.toContain('company');
  });

  it('entrega las tablas en orden estable', () => {
    const ordenadas = [...nombres].sort((a, b) => a.localeCompare(b));
    expect(modelos.map((modelo) => modelo.name)).toEqual(ordenadas);
  });
});

describe('Nombre del archivo de respaldo', () => {
  it('usa el RUT sin formato y la fecha, para que ordene solo', () => {
    const nombre = backupFileName(
      { id: 'cmp_1', businessName: 'Empresa Demo', rut: '76.192.083-9' },
      new Date('2026-09-10T12:00:00Z')
    );
    expect(nombre).toBe('respaldo-761920839-2026-09-10.json');
  });

  it('cae al id de la empresa si el RUT no tiene dígitos utilizables', () => {
    const nombre = backupFileName({ id: 'cmp_1', businessName: 'X', rut: '---' }, new Date('2026-09-10T12:00:00Z'));
    expect(nombre).toBe('respaldo-cmp_1-2026-09-10.json');
  });
});

describe('Formato del respaldo', () => {
  it('declara una versión, para que un lector futuro sepa qué esperar', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(1);
  });
});
