import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { checkInByQrToken } from '@/modules/production/services/production.service';
import { createAuditLog } from '@/lib/auth/audit';
import { ACCREDITATION_LEVEL_LABELS } from '@/modules/production/schema';

export const metadata = { title: 'Verificación de acreditación' };

const DEFAULT_ACCENT = '#1e3a5f';
const DEFAULT_TEXT = '#0f172a';

export default async function AccreditationVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await checkInByQrToken(token);

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 size-10 text-red-500" />
          <p className="text-lg font-semibold text-red-700">Credencial no válida</p>
          <p className="mt-1 text-sm text-slate-500">Este código no corresponde a ninguna acreditación registrada.</p>
        </div>
      </div>
    );
  }

  const { data: record, justCheckedIn } = result;
  const template = record.template;
  const hasImage = template?.backgroundMode === 'IMAGE' && !!template.backgroundImageUrl;
  const isWatermark = hasImage && template?.imageDisplayMode === 'WATERMARK';
  const watermarkOpacity = template ? Math.max(0, Math.min(1, template.watermarkOpacityBps / 10000)) : 1;
  const accentColor = template?.accentColor ?? DEFAULT_ACCENT;
  const cardBackgroundColor = hasImage ? undefined : (template?.backgroundColor ?? DEFAULT_ACCENT);

  if (justCheckedIn) {
    await createAuditLog({
      companyId: result.companyId,
      userEmail: `qr-scan:${record.badgeCode}`,
      action: 'UPDATE',
      entity: 'StaffAccreditation',
      entityId: result.accreditationId,
      metadata: { checkedInViaQr: true, fullName: record.fullName },
    });
  }

  const textColor = template?.textColor ?? DEFAULT_TEXT;
  const contentPanelOpacity = hasImage ? (isWatermark ? 0.96 : 0.88) : 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
        style={{ backgroundColor: cardBackgroundColor }}
      >
        {hasImage && template?.backgroundImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={template.backgroundImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: isWatermark ? watermarkOpacity : 1 }}
          />
        )}

        <div className="relative">
          <div className="px-6 py-4 text-white" style={{ backgroundColor: accentColor }}>
            <p className="text-xs uppercase tracking-wide text-white/80">{record.companyName}</p>
            <p className="text-lg font-bold">{record.projectName}</p>
          </div>

          {justCheckedIn && (
            <div className="flex items-center gap-2 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="size-4 shrink-0" />
              Ingreso registrado ahora
            </div>
          )}

          <div className="space-y-4 p-6" style={{ backgroundColor: `rgba(255,255,255,${contentPanelOpacity})` }}>
            <div>
              <p className="text-xs font-medium uppercase text-slate-400">Nombre</p>
              <p className="text-xl font-bold" style={{ color: textColor }}>{record.fullName}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Rol</p>
                <p className="font-semibold" style={{ color: textColor }}>{record.role}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Empresa/Proveedor</p>
                <p className="font-semibold" style={{ color: textColor }}>{record.organization || '—'}</p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-400">Nivel de acceso</p>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
                style={{ backgroundColor: accentColor }}
              >
                {ACCREDITATION_LEVEL_LABELS[record.accessLevel]}
              </span>
            </div>
            <div className="border-t border-slate-100 pt-4">
              {record.checkedInAt ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  {justCheckedIn ? 'Ingreso registrado el ' : 'Ya había ingresado el '}
                  {record.checkedInAt.toLocaleString('es-CL')}
                </p>
              ) : (
                <p className="text-sm text-slate-500">Aún sin ingreso registrado.</p>
              )}
              <p className="mt-2 font-mono text-xs text-slate-400">{record.badgeCode}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
