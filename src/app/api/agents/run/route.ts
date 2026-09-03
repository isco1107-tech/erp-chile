import { NextResponse, type NextRequest } from 'next/server';
import type { AgentRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runAgent } from '@/modules/agents/engine';
import { runCeoAgent } from '@/modules/agents/roles/ceo';
import { runCfoAgent } from '@/modules/agents/roles/cfo';
import { runCooAgent } from '@/modules/agents/roles/coo';
import { runSalesAgent } from '@/modules/agents/roles/sales';

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
    select: { id: true },
  });

  // En secuencia, no en paralelo (ver comentario de cabecera).
  for (const company of companies) {
    await runAgent(company.id, role, () => runner(company.id));
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
