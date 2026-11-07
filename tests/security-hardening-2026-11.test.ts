import { grantProblem, manageProblem, uncoveredPermissions, type TeamActor } from '@/lib/auth/team-access';
import { permissionsForRole } from '@/lib/auth/permissions';
import { sniffAllowedUpload, sniffUploadType, type SniffedUploadType } from '@/lib/security/file-signature';
import { readTextWithLimit } from '@/lib/security/body-limit';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

/**
 * Endurecimiento 2026-11: escalada por roles base, subidas validadas por firma
 * binaria y cuerpos de webhooks firmados con tope real.
 */

// Todas las funcionalidades encendidas: el recorte por módulo no esconde nada.
const allFeatures = new Proxy({}, { get: () => true }) as CompanyFeatureFlags;

const adminActor: TeamActor = { role: 'ADMIN', permissions: permissionsForRole('ADMIN'), features: allFeatures };
const ownerActor: TeamActor = { role: 'OWNER', permissions: permissionsForRole('OWNER'), features: allFeatures };

describe('regla de equipo: nadie otorga ni administra permisos que no tiene', () => {
  it('un Administrador no puede crear ni convertir a alguien en Contador (cierre contable y de remuneraciones)', () => {
    expect(uncoveredPermissions(adminActor, { role: 'ACCOUNTANT', customRolePermissions: null })).toEqual(
      expect.arrayContaining(['accounting:close_period', 'payroll:close'])
    );
    expect(grantProblem(adminActor, { role: 'ACCOUNTANT', customRolePermissions: null })).toMatch(/Dueño/);
  });

  it('un Administrador sí puede otorgar Ventas, Bodega y otro Administrador', () => {
    for (const role of ['SALES', 'WAREHOUSE', 'ADMIN'] as const) {
      expect(grantProblem(adminActor, { role, customRolePermissions: null })).toBeNull();
    }
  });

  it('un Administrador no puede administrar (reiniciar contraseña, suspender) a un Contador', () => {
    expect(manageProblem(adminActor, { role: 'ACCOUNTANT', customRolePermissions: null })).toMatch(/solo un Dueño/);
  });

  it('un Contador con un rol personalizado acotado sí lo puede administrar el Administrador', () => {
    expect(manageProblem(adminActor, { role: 'ACCOUNTANT', customRolePermissions: ['sales:read', 'contacts:read'] })).toBeNull();
  });

  it('con un rol personalizado limitado no se puede subir a nadie a Administrador ni tocar a un Administrador', () => {
    const limited: TeamActor = { role: 'SALES', permissions: ['settings:users', 'contacts:read'], features: allFeatures };
    expect(grantProblem(limited, { role: 'ADMIN', customRolePermissions: null })).not.toBeNull();
    expect(manageProblem(limited, { role: 'ADMIN', customRolePermissions: null })).not.toBeNull();
    // Quitarle a un colega su rol restrictivo lo dejaría con la matriz completa de su rol base.
    expect(grantProblem(limited, { role: 'SALES', customRolePermissions: null })).not.toBeNull();
  });

  it('el Dueño puede todo', () => {
    expect(grantProblem(ownerActor, { role: 'ACCOUNTANT', customRolePermissions: null })).toBeNull();
    expect(manageProblem(ownerActor, { role: 'ADMIN', customRolePermissions: null })).toBeNull();
  });
});

function bytes(...values: number[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(16));
  out.set(values);
  return out;
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const PDF = bytes(0x25, 0x50, 0x44, 0x46);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
const HTML = '<!doctype html><script>alert(1)</script>';

describe('subidas: el tipo sale de la firma binaria, nunca de file.type', () => {
  it('reconoce PNG, GIF y PDF por sus bytes', () => {
    expect(sniffUploadType(PNG)).toBe('image/png');
    expect(sniffUploadType(GIF)).toBe('image/gif');
    expect(sniffUploadType(PDF)).toBe('application/pdf');
  });

  it('rechaza SVG y HTML aunque el navegador los declare como imagen', async () => {
    const images: ReadonlySet<SniffedUploadType> = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    expect(await sniffAllowedUpload(new Blob([SVG], { type: 'image/svg+xml' }), images)).toBeNull();
    expect(await sniffAllowedUpload(new Blob([HTML], { type: 'image/png' }), images)).toBeNull();
  });

  it('un PDF no pasa donde solo se aceptan imágenes, y la extensión sale del tipo real', async () => {
    const images: ReadonlySet<SniffedUploadType> = new Set(['image/png']);
    expect(await sniffAllowedUpload(new Blob([PDF], { type: 'image/png' }), images)).toBeNull();
    expect(await sniffAllowedUpload(new Blob([PNG], { type: 'image/jpeg' }), images)).toEqual({ contentType: 'image/png', extension: 'png' });
  });
});

describe('readTextWithLimit', () => {
  it('lee un cuerpo dentro del tope', async () => {
    const req = new Request('https://example.test', { method: 'POST', body: '{"ok":true}' });
    expect(await readTextWithLimit(req, 1024)).toBe('{"ok":true}');
  });

  it('corta un cuerpo que supera el tope aunque no declare content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i += 1) controller.enqueue(new Uint8Array(1024));
        controller.close();
      },
    });
    const req = new Request('https://example.test', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await readTextWithLimit(req, 4096)).toBeNull();
  });

  it('rechaza de inmediato un content-length declarado mayor al tope', async () => {
    const req = new Request('https://example.test', { method: 'POST', body: 'x', headers: { 'content-length': '999999' } });
    expect(await readTextWithLimit(req, 1024)).toBeNull();
  });
});


describe('llavero de cifrado por módulo', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('configurar la llave propia no deja ilegible lo cifrado con la compartida, y lo nuevo usa la propia', async () => {
    delete process.env.DTE_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = 'llave-compartida-de-pruebas-0123456789';
    const { encryptCafXml, decryptCafXml } = await import('@/lib/chile/dte/crypto');
    const old = encryptCafXml('<AUTORIZACION>viejo</AUTORIZACION>');

    process.env.DTE_ENCRYPTION_KEY = 'llave-propia-del-caf-0123456789abcdef';
    expect(decryptCafXml(old)).toBe('<AUTORIZACION>viejo</AUTORIZACION>');
    const fresh = encryptCafXml('<AUTORIZACION>nuevo</AUTORIZACION>');

    // Lo nuevo ya no depende de la llave compartida.
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(decryptCafXml(fresh)).toBe('<AUTORIZACION>nuevo</AUTORIZACION>');
    expect(() => decryptCafXml(old)).toThrow();
  });

  it('un dato alterado no se descifra con ninguna llave', async () => {
    process.env.TOTP_ENCRYPTION_KEY = 'llave-compartida-de-pruebas-0123456789';
    process.env.PAYMENTS_ENCRYPTION_KEY = 'llave-propia-de-pagos-0123456789abcd';
    const { encryptPaymentCredential, decryptPaymentCredential } = await import('@/lib/payments/crypto');
    const [iv, tag, data] = encryptPaymentCredential('api-key-secreta').split('.');
    const tampered = [iv, tag, Buffer.from('otra-cosa').toString('base64')].join('.');
    expect(() => decryptPaymentCredential(tampered)).toThrow();
    expect(data).toBeDefined();
  });
});
