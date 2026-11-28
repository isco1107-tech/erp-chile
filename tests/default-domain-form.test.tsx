/**
 * Tarjeta «Dominio predeterminado de la empresa» (Configuración → Perfil de Empresa):
 * sin dominio solo ofrece guardarlo; con dominio muestra el único registro DNS que hay
 * que crear (el comodín) y cómo quedará una página nueva.
 */

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/actions/default-domain', () => ({
  setDefaultDomainAction: jest.fn(),
  removeDefaultDomainAction: jest.fn(),
  checkDefaultDomainAction: jest.fn(),
}));

import { renderToStaticMarkup } from 'react-dom/server';
import DefaultDomainForm from '@/components/settings/DefaultDomainForm';
import type { DefaultDomainView } from '@/lib/hosting/default-domain.service';

const SIN_DOMINIO: DefaultDomainView = { domain: null, record: null, example: null, automatic: true };
const CON_DOMINIO: DefaultDomainView = {
  domain: 'miempresa.cl',
  record: { type: 'CNAME', name: '*', value: 'cname.vercel-dns.com' },
  example: 'mi-pagina.miempresa.cl',
  automatic: true,
};

const render = (initial: DefaultDomainView) => renderToStaticMarkup(<DefaultDomainForm initial={initial} />);

describe('DefaultDomainForm', () => {
  it('sin dominio solo pide el dominio: no hay registro DNS ni botón para quitar', () => {
    const html = render(SIN_DOMINIO);
    expect(html).toContain('Dominio predeterminado de la empresa');
    expect(html).toContain('placeholder="miempresa.cl"');
    expect(html).toContain('Guardar dominio');
    expect(html).not.toContain('cname.vercel-dns.com');
    expect(html).not.toContain('Quitar dominio');
    expect(html).not.toContain('Revisar DNS');
  });

  it('con dominio muestra el comodín a crear una sola vez y la dirección que tendrá una página nueva', () => {
    const html = render(CON_DOMINIO);
    expect(html).toContain('value="miempresa.cl"');
    expect(html).toContain('cname.vercel-dns.com');
    expect(html).toContain('una sola vez');
    expect(html).toContain('mi-pagina.miempresa.cl');
    expect(html).toContain('Revisar DNS');
    expect(html).toContain('Quitar dominio');
    // El dominio ya guardado no se puede «guardar» otra vez sin cambiarlo.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Guardar dominio<\/button>/);
  });

  it('sin la conexión automática avisa que cada página nueva se agrega a mano en Vercel', () => {
    expect(render({ ...CON_DOMINIO, automatic: false })).toContain('Vercel');
    expect(render(CON_DOMINIO)).toContain('se registra sola');
  });
});
