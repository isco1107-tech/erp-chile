/**
 * Vercel Web Analytics nunca debe recibir tokens secretos de una URL ni
 * visitas de los sitios de las empresas clientes.
 */
import { sanitizeAnalyticsUrl } from '@/lib/analytics/privacy';

const hosts = ['aether.cl', 'www.aether.cl'];

describe('sanitizeAnalyticsUrl', () => {
  it('mide la landing y el panel, sin consulta ni fragmento', () => {
    expect(sanitizeAnalyticsUrl('https://aether.cl/?utm_source=x#precios', hosts)).toBe('https://aether.cl/');
    expect(sanitizeAnalyticsUrl('https://aether.cl/dashboard/sales?folio=12', hosts)).toBe('https://aether.cl/dashboard/sales');
    expect(sanitizeAnalyticsUrl('https://aether.cl/aether/terminos', hosts)).toBe('https://aether.cl/aether/terminos');
  });

  it('reemplaza ids por :id y respeta los nombres de sección', () => {
    expect(sanitizeAnalyticsUrl('https://aether.cl/dashboard/candidates/cmuig3z6d0001abcdefghijk', hosts)).toBe('https://aether.cl/dashboard/candidates/:id');
    expect(sanitizeAnalyticsUrl('https://aether.cl/dashboard/projects/123/poster', hosts)).toBe('https://aether.cl/dashboard/projects/:id/poster');
    expect(sanitizeAnalyticsUrl('https://aether.cl/dashboard/settings/data-protection-requests', hosts)).toBe('https://aether.cl/dashboard/settings/data-protection-requests');
  });

  it('descarta las URLs con tokens y los flujos públicos de las empresas', () => {
    for (const path of [
      '/pagar/abcDEF1234567890xyz',
      '/tickets/abcDEF1234567890xyz',
      '/votar/abcDEF1234567890xyz',
      '/derechos/abcDEF1234567890xyz',
      '/accept-invitation?token=secreto',
      '/reset-password?token=secreto',
      '/certamen/miss-sur',
      '/web/panaderia',
      '/aviso-privacidad?flujo=cuotas&t=secreto',
    ]) {
      expect(sanitizeAnalyticsUrl(`https://aether.cl${path}`, hosts)).toBeNull();
    }
  });

  it('descarta todo lo que llega por el dominio propio de un cliente, incluida su portada', () => {
    expect(sanitizeAnalyticsUrl('https://missaraucania.cl/', hosts)).toBeNull();
    expect(sanitizeAnalyticsUrl('https://missaraucania.cl/dashboard', hosts)).toBeNull();
  });

  it('acepta las URLs de vista previa de Vercel y descarta lo ilegible', () => {
    expect(sanitizeAnalyticsUrl('https://erp-git-x.vercel.app/login', hosts)).toBe('https://erp-git-x.vercel.app/login');
    expect(sanitizeAnalyticsUrl('no es url', hosts)).toBeNull();
  });
});
