import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { getDocumentStatus } from '@/lib/zapsign/client';
import {
  findCandidateDocumentByZapsignToken,
  markContractSignedByZapsignToken,
} from '@/modules/candidates/services/documents.service';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildContractSignedNoticeEmail } from '@/lib/email/templates';
import { captureException } from '@/lib/observability';

/**
 * Webhook de ZapSign — dedicado, no pasa por el `/api/webhooks` genérico
 * porque ese exige `companyId` en el body/headers y ZapSign no tiene forma de
 * mandarlo. ZapSign no firma sus webhooks con HMAC (confirmado en su
 * documentación), así que este endpoint NUNCA marca nada como firmado a
 * partir del body recibido: solo lo usa para saber qué documento reconsultar,
 * y reconsulta el estado real contra la API de ZapSign con nuestro propio
 * token antes de tocar la base de datos.
 *
 * SEG-12: el orden importa. Primero se comprueba, sin I/O remoto, que el
 * token corresponde a un `CandidateDocument` local pendiente de firma — un
 * token desconocido o ya procesado responde 200 (idempotente) sin llamar a
 * ZapSign ni tocar storage. Solo después se consulta a ZapSign, se descarga
 * el PDF firmado y se sube. Las fallas de esa etapa remota (red, 5xx del
 * proveedor, storage) responden 5xx para que ZapSign reintente en vez de
 * darlas por perdidas con un 200 que oculta el error.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const docToken = body?.token;
  if (typeof docToken !== 'string' || !docToken) {
    return NextResponse.json({ success: false, error: 'Falta el token del documento' }, { status: 400 });
  }

  let localDoc;
  try {
    localDoc = await findCandidateDocumentByZapsignToken(docToken);
  } catch (error) {
    captureException(error, { module: 'candidates', extra: { reason: 'zapsign-webhook-lookup' } });
    return NextResponse.json({ success: false, error: 'No se pudo verificar el documento localmente' }, { status: 500 });
  }

  if (!localDoc) {
    // Token válido en ZapSign pero no corresponde a ningún documento nuestro
    // — no se hace nada más, y sobre todo no se consulta a ZapSign ni se
    // descarga/sube nada por un token ajeno.
    return NextResponse.json({ success: true, message: 'Token no corresponde a ningún documento registrado' });
  }
  if (localDoc.signedAt) {
    // Evento ya procesado (reintento de ZapSign) — idempotente, sin I/O remoto.
    return NextResponse.json({ success: true, message: 'Documento ya estaba firmado — evento ya procesado' });
  }

  let status;
  try {
    status = await getDocumentStatus(docToken);
  } catch (error) {
    captureException(error, { module: 'candidates', companyId: localDoc.companyId, extra: { reason: 'zapsign-webhook-status', candidateId: localDoc.candidateId } });
    return NextResponse.json({ success: false, error: 'No se pudo consultar el estado del documento en ZapSign' }, { status: 502 });
  }

  if (status.status !== 'signed' || !status.signedFileUrl) {
    return NextResponse.json({ success: true, message: 'Documento aún no está firmado según ZapSign — nada que hacer' });
  }

  let blobUrl: string;
  try {
    const fileResponse = await fetch(status.signedFileUrl);
    if (!fileResponse.ok) {
      throw new Error(`No se pudo descargar el PDF firmado desde ZapSign (${fileResponse.status})`);
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    const pathname = `candidates/zapsign-signed/${docToken}.pdf`;
    const blob = await put(pathname, fileBuffer, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false });
    blobUrl = blob.url;
  } catch (error) {
    captureException(error, { module: 'candidates', companyId: localDoc.companyId, extra: { reason: 'zapsign-webhook-download-upload', candidateId: localDoc.candidateId } });
    return NextResponse.json({ success: false, error: 'No se pudo descargar o subir el PDF firmado' }, { status: 502 });
  }

  try {
    const result = await markContractSignedByZapsignToken(docToken, blobUrl);
    if (!result) {
      // El documento se borró entre la comprobación local y este punto.
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
    // reintento o una entrega concurrente del mismo evento (`justSigned:
    // false`) no debe reenviarlo.
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
              captureException(error, { module: 'candidates', companyId: document.companyId, extra: { reason: 'zapsign-signed-notice', recipient: r.email } })
            )
          )
        );
      }
    }

    return NextResponse.json({ success: true, message: 'Firma confirmada y contrato actualizado' });
  } catch (error) {
    captureException(error, { module: 'candidates', companyId: localDoc.companyId, extra: { reason: 'zapsign-webhook-persist', candidateId: localDoc.candidateId } });
    // El PDF ya se subió y ZapSign confirma la firma: esto es una falla de
    // persistencia local (BD, notificación), no un evento inválido —
    // responder 5xx para que el webhook se reintente y no se pierda.
    return NextResponse.json({ success: false, error: 'No se pudo guardar la confirmación de firma' }, { status: 500 });
  }
}
