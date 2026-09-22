import { NextResponse, type NextRequest } from 'next/server';
import type { AgentRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runAgent } from '@/modules/agents/engine';
import { runCeoAgent } from '@/modules/agents/roles/ceo';
import { runCfoAgent } from '@/modules/agents/roles/cfo';
import { runCooAgent } from '@/modules/agents/roles/coo';
import { runSalesAgent } from '@/modules/agents/roles/sales';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildAgentDigestEmail } from '@/lib/email/templates';
import { captureException } from '@/lib/observability';

/**
 * Cron de agentes de inteligencia de negocio, invocado por Vercel Cron (ver
 * vercel.json).
 *
 * Horarios en vercel.json están en UTC, en este orden: CFO, COO, SALES
 * corren primero (8:00/8:15/8:30 UTC) y CEO corre último (9:00 UTC) para leer
 * las recomendaciones que los otros tres ya dejaron ese ciclo — es el único
 * rol que "lee" el trabajo de los demás (ver roles/ceo.ts). Chile continental
 * usa UTC-4 en horario de verano y UTC-3 en invierno, así que esto cae
 * ~05:00-06:00 en Chile — el margen entre roles se puede correr un poco según
 * la época del año, no es crítico para este caso de uso (recomendaciones
 * internas, no documentos con hora legal).
 *
 * Es multi-tenant a propósito: una sola invocación por rol recorre TODAS las
 * empresas con `CompanyFeatures.hasCrm = true`, en secuencia (nunca en
 * paralelo) para no saturar el rate limit ~10 req/min de Gemini entre
 * empresas distintas (ver src/modules/agents/services/gemini-agent.ts).
 */

const ROLE_RUNNERS: Partial<Record<AgentRole, (companyId: string) => Promise<string>>> = {
  CEO: runCeoAgent,
  CFO: runCfoAgent,
  COO: runCooAgent,
  SALES: runSalesAgent,
};

function isSupportedRole(value: string): value is keyof typeof ROLE_RUNNERS {
  return Object.prototype.hasOwnProperty.call(ROLE_RUNNERS, value);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const roleParam = request.nextUrl.searchParams.get('role') ?? '';
  if (!isSupportedRole(roleParam)) {
    return NextResponse.json({ error: 'role inválido o no soportado por el cron de agentes' }, { status: 400 });
  }
  const role = roleParam;
  const runner = ROLE_RUNNERS[role];
  if (!runner) {
    return NextResponse.json({ error: 'role inválido o no soportado por el cron de agentes' }, { status: 400 });
  }

  const startedAt = new Date();
  const companies = await prisma.company.findMany({
    where: { features: { hasCrm: true } },
    select: { id: true, businessName: true },
  });

  // En secuencia, no en paralelo (ver comentario de cabecera).
  for (const company of companies) {
    const companyRunStartedAt = new Date();
    const result = await runAgent(company.id, role, () => runner(company.id));

    // Solo el CEO dispara el correo: es el único rol que lee y condensa el
    // trabajo de los otros tres (ver roles/ceo.ts) — antes de esto, las
    // recomendaciones de los 4 agentes solo se veían entrando al dashboard.
    if (role === 'CEO' && result.status === 'COMPLETED' && result.summary) {
      await sendCeoDigestEmail(company.id, company.businessName, companyRunStartedAt);
    }
  }

  const failedCount = await prisma.agentRun.count({
    where: { role, status: 'FAILED', startedAt: { gte: startedAt } },
  });

  return NextResponse.json({
    role,
    companiesProcessed: companies.length,
    failed: failedCount,
  });
}

/**
 * El `summary` que devuelve `runCeoAgent` es solo un meta-texto ("Se
 * generaron 3 prioridad(es) a partir de N recomendación(es)..."), no las
 * prioridades en sí — esas quedan como filas `AgentTask` (`role: 'CEO'`,
 * `title: 'Prioridad de la semana'`) creadas dentro de esa misma corrida.
 * Por eso el digest las relee desde ahí en vez de mandar el `summary` tal
 * cual. Si `runCeoAgent` no generó ninguna prioridad nueva (nada que
 * priorizar, o Gemini no está configurado), no manda correo — un correo
 * diario vacío entrena a la gente a ignorarlo.
 */
async function sendCeoDigestEmail(companyId: string, companyName: string, since: Date): Promise<void> {
  try {
    const priorities = await prisma.agentTask.findMany({
      where: { companyId, role: 'CEO', title: 'Prioridad de la semana', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { description: true },
    });
    if (priorities.length === 0) return;

    const recipients = await prisma.user.findMany({
      where: { companyId, role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
      select: { email: true },
    });
    if (recipients.length === 0) return;

    const email = buildAgentDigestEmail({
      companyName,
      priorities: priorities.map((p) => p.description),
      dashboardUrl: `${getAppUrl()}/dashboard/agents`,
    });

    await Promise.all(
      recipients.map((r) =>
        sendEmail({ to: r.email, subject: email.subject, html: email.html, text: email.text }).catch((error) =>
          captureException(error, { module: 'agents', companyId, extra: { reason: 'sendCeoDigestEmail', recipient: r.email } })
        )
      )
    );
  } catch (error) {
    captureException(error, { module: 'agents', companyId, extra: { reason: 'sendCeoDigestEmail' } });
  }
}
