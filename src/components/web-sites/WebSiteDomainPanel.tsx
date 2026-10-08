'use client';

import DomainPanel from '@/components/hosting/DomainPanel';
import { getWebSiteDomainAction, removeWebSiteDomainAction, setWebSiteDomainAction } from '@/modules/web-sites/actions/web-sites.actions';

interface Props {
  siteId: string;
  /** Solo dueño y administradores (`websites:publish`) pueden cambiar el dominio. */
  canPublish: boolean;
  /** Dominio guardado al abrir la pantalla; se refresca al montar con el estado real. */
  initialDomain: string | null;
  /** Dirección pública del sitio en la plataforma (donde se ve mientras no haya dominio propio). */
  platformUrl: string;
}

/** «Dominio propio» de un sitio web: el panel común con las acciones de sitios web. */
export default function WebSiteDomainPanel({ siteId, canPublish, initialDomain, platformUrl }: Props) {
  return (
    <DomainPanel
      idPrefix={siteId}
      canPublish={canPublish}
      initialDomain={initialDomain}
      platformUrl={platformUrl}
      load={() => getWebSiteDomainAction(siteId)}
      save={(domain) => setWebSiteDomainAction(siteId, { domain })}
      remove={() => removeWebSiteDomainAction(siteId)}
    />
  );
}
