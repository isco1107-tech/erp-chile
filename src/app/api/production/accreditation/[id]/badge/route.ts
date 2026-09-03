import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import * as productionService from '@/modules/production/services/production.service';
import { renderBadgeElement, BADGE_WIDTH, BADGE_HEIGHT } from '@/modules/production/badge-render';

/**
 * PNG descargable/imprimible de la credencial, con el mismo diseño (plantilla
 * elegida o el estilo por defecto) que se ve en la página pública de
 * verificación. Autenticado (a diferencia del QR plano de
 * `/api/verify/accreditation/[token]/qr`, que es público): esta ruta expone
 * nombre completo, rol y empresa/proveedor, así que exige sesión + permiso
 * dentro del tenant dueño de la acreditación.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthWithPermission('production:read');
    const { id } = await params;
    const record = await productionService.getStaffAccreditationById(session.companyId, id);

    const verifyUrl = `${getAppUrl()}/verify/accreditation/${record.qrToken}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 520, margin: 1 });

    return new ImageResponse(
      renderBadgeElement({
        template: record.template,
        companyName: session.companyName,
        projectName: record.project.name,
        fullName: record.fullName,
        role: record.role,
        organization: record.organization,
        accessLevel: record.accessLevel,
        badgeCode: record.badgeCode,
        qrDataUrl,
      }),
      {
        width: BADGE_WIDTH,
        height: BADGE_HEIGHT,
        headers: { 'Content-Disposition': `inline; filename="credencial-${record.badgeCode}.png"` },
      }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Badge PNG generation failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo generar la credencial' }, { status: 500 });
  }
}
