import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { getDocumentStatus } from '@/lib/zapsign/client';
import { markContractSignedByZapsignToken } from '@/modules/candidates/services/documents.service';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildContractSignedNoticeEmail } from '@/lib/email/templates';

/**
 * Webhook de ZapSign — dedicado, no pasa por el `/api/webhooks` genérico
 * porque ese exige `companyId` en el body/headers y ZapSign no tiene forma de
 * mandarlo. ZapSign no firma sus webhooks con HMAC (confirmado en su
 * documentación), así que este endpoint NUNCA marca nada como firmado a
 * partir del body recibido: solo lo usa para saber qué documento reconsultar,
 * y reconsulta el estado real contra la API de ZapSign con nuestro propio
 * token antes de tocar la base de datos. Idempotente: un documento ya
 * firmado no se vuelve a procesar, y un `token` desconocido responde 200 sin
 * hacer nada (no revela si existe o no, mismo criterio que los flujos
 * públicos por token del resto del sistema).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const docToken = body?.token;
    if (typeof docToken !== 'string' || !docToken) {
      return NextResponse.json({ success: false, error: 'Falta el token del documento' }, { status: 400 });
    }

    const status = await getDocumentStatus(docToken);
    if (status.status !== 'signed' || !status.signedFileUrl) {
      return NextResponse.json({ success: true, message: 'Documento aún no está firmado según ZapSign — nada que hacer' });
    }

    const fileResponse = await fetch(status.signedFileUrl);
    if (!fileResponse.ok) {
      throw new Error(`No se pudo descargar el PDF firmado desde ZapSign (${fileResponse.status})`);
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    const pathname = `candidates/zapsign-signed/${docToken}.pdf`;
    const blob = await put(pathname, fileBuffer, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false });

    const result = await markContractSignedByZapsignToken(docToken, blob.url);
    if (!result) {
      // Token válido en ZapSign pero no corresponde a ningún documento nuestro — no se hace nada más.
      return NextResponse.json({ success: true, message: 'Token no corresponde a ningún documento registrado' });
    }
    const { document, justSigned } = result;

    await createAuditLog({
      companyId: document.companyId,
      userEmail: 'webhook:zapsign',
      action: 'UPDATE',
      entity: 'CandidateDocument',
      entityId: document.id,
      metadata: { candidateId: document.candidateId, action: 'signature_confirmed', zapsignDocToken: docToken },
    });

    // Aviso al staff solo la primera vez que se confirma la firma — un
    // reintento del mismo evento (`justSigned: false`) no debe reenviarlo.
    if (justSigned) {
      const candidate = await prisma.candidate.findUnique({ where: { id: document.candidateId }, select: { fullName: true, stageName: true } });
      const recipients = await prisma.user.findMany({
        where: { companyId: document.companyId, role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
        select: { email: true },
      });
      if (candidate && recipients.length > 0) {
        const email = buildContractSignedNoticeEmail({
          candidateName: candidate.stageName ?? candidate.fullName,
          documentTitle: document.title,
          dashboardUrl: `${getAppUrl()}/dashboard/candidates/${document.candidateId}`,
        });
        await Promise.all(
          recipients.map((r) =>
            sendEmail({ to: r.email, subject: email.subject, html: email.html, text: email.text }).catch((error) =>
              console.error('zapsign webhook: fallo al enviar aviso de firma completada:', error)
            )
          )
        );
      }
    }

    return NextResponse.json({ success: true, message: 'Firma confirmada y contrato actualizado' });
  } catch (error) {
    console.error('ZapSign webhook processing failed:', error);
    // 200 a propósito: si devolvemos error, ZapSign reintenta indefinidamente
    // un evento que probablemente vamos a rechazar igual (ej. token inválido);
    // el error ya queda en los logs del servidor para investigar.
    return NextResponse.json({ success: false, error: 'Error interno procesando el webhook' }, { status: 200 });
  }
}
