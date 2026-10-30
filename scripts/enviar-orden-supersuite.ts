import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { assertScriptCanRun } from './lib/guard-production';
import {
  buildSignedOrder,
  businessNameMatches,
  companySelector,
  confirmCommandHint,
  describeHttpFailure,
  formatMarketingReview,
  marketingReviewData,
  normalizeBaseUrl,
  orderType,
  parseOrderArgs,
  readRequestDetails,
  type AetherReply,
  type ErasureAction,
  type OrderArgs,
} from './lib/supersuite-orders';

/**
 * Firma y envía a Aether las órdenes de la Supersuite para REINICIAR o ELIMINAR una empresa, sin esperar a
 * que el panel de la Supersuite tenga los botones. Es el mismo camino que usará el panel: `POST
 * /api/supersuite/ordenes` con la firma `X-Supersuite-Firma`, así que valen TODAS sus protecciones (código
 * de un solo uso, razón social escrita, respaldo antes de borrar, empresa suspendida y 7 días de espera para
 * eliminar). El script no se las salta: solo habla con ellas.
 *
 * También envía las dos órdenes del marketing propio de Aether (`marketing.contexto` y `marketing.revisar`,
 * ADR 0015), que solo leen datos públicos y no tocan ninguna empresa.
 *
 * Qué necesita:
 *  - SUPERSUITE_WEBHOOK_SECRET: el mismo secreto que tiene Aether en Vercel. En el `.env` o como variable de
 *    entorno; nunca como argumento (quedaría en el historial del terminal).
 *  - APP_URL (o --url): la dirección de Aether, p. ej. https://aetherp.online
 *  - DATABASE_URL, solo para buscar la empresa por RUT o razón social (lectura). Con --empresa-id no se usa.
 *
 * Ojo: en la bitácora de Aether estas órdenes quedan como hechas por «supersuite», igual que las del panel.
 */

const HELP = `Órdenes de la Supersuite: reiniciar o eliminar una empresa, y las del marketing propio.

  reiniciar  --empresa <…>                     borra los datos y conserva usuarios, módulos y configuración
  eliminar   --empresa <…>                     borra TODO, la empresa incluida (pide esperar 7 días)
  confirmar  reiniciar|eliminar --empresa <…> --codigo <código> [--razon-social "<…>"] [--acepto-datos-reales]
  cancelar   reiniciar|eliminar --empresa <…>  anula las solicitudes pendientes
  ping                                         prueba la conexión y la firma (no toca ninguna empresa)

Marketing propio de Aether (ADR 0015; no tocan ninguna empresa):
  marketing-contexto [--salida contexto.json]  lo que el agente puede decir y mostrar (versión, oferta, guía)
  marketing-revisar --canal <red> --texto "<…>"           revisa una pieza
  marketing-revisar --archivo piezas.json                  revisa un calendario: [{ "id", "canal", "texto" }]

Empresa:
  --empresa "<RUT | razón social | id>"   la busca en la base (necesita DATABASE_URL, solo lectura)
  --empresa-id <id>                       id exacto; no consulta la base

Otras:
  --url <https://…>        dirección de Aether (por defecto APP_URL)
  --solo-solicitar         reiniciar: pide el código y se detiene (no pregunta ni confirma)
  --ayuda

Cómo se usa:
  1. reiniciar|eliminar  pide la solicitud: cuenta lo que se borraría y entrega un código. NO borra.
  2. reiniciar           pregunta ahí mismo (escribes la razón social) y ejecuta.
     eliminar            exige la empresa suspendida y esperar 7 días: después corres «confirmar eliminar».
  3. Antes de borrar, Aether guarda un respaldo en su almacenamiento privado; si no puede, no borra nada.
`;

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const santiago = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' }) : '—';

async function send(
  baseUrl: string,
  secret: string,
  step: 'solicitar' | 'confirmar' | 'cancelar' | 'ping' | 'marketing',
  order: { tipo: string; clienteId: string | null; datos?: Record<string, unknown> }
): Promise<AetherReply> {
  const { body, signature } = buildSignedOrder(secret, order);
  // Reiniciar o eliminar respalda, borra cientos de tablas y limpia archivos: la ruta puede tardar hasta 5 minutos.
  const timeoutMs = step === 'confirmar' ? 6 * 60_000 : 60_000;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/supersuite/ordenes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-supersuite-firma': signature },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      step === 'confirmar'
        ? `No hubo respuesta de Aether (${reason}). No se sabe si llegó a ejecutarse: vuelve a correr «confirmar» con el mismo código (es seguro repetirlo).`
        : `No se pudo hablar con Aether (${reason}).`
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Aether redirige a ${response.headers.get('location') ?? 'otra dirección'}: usa esa dirección en --url.`);
  }
  let reply: AetherReply | null = null;
  try {
    reply = (await response.json()) as AetherReply;
  } catch {
    reply = null;
  }
  if ([401, 404, 503].includes(response.status) || !reply || typeof reply.ok !== 'boolean') {
    throw new Error(describeHttpFailure(response.status, step));
  }
  return reply;
}

interface Target {
  id: string;
  label: string;
  /** Solo se conoce si se buscó la empresa en la base; permite revisar la razón social escrita antes de enviarla. */
  businessName: string | null;
}

async function resolveTarget(args: OrderArgs): Promise<Target> {
  if (args.companyId) return { id: args.companyId, label: `id ${args.companyId}`, businessName: null };
  if (!process.env.DATABASE_URL) {
    return fail('Para buscar la empresa por RUT o nombre hace falta DATABASE_URL (solo lectura). Define esa variable o usa --empresa-id <id>.');
  }
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { normalizeSslMode } = await import('../src/lib/prisma');
  const { matchCompanies } = await import('../src/lib/company-erasure/core');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeSslMode(process.env.DATABASE_URL), max: 1, connectionTimeoutMillis: 15_000 }),
    log: ['error'],
  });
  try {
    const all = await prisma.company.findMany({ select: { id: true, rut: true, businessName: true, status: true } });
    const matches = matchCompanies(all, args.company ?? '');
    if (matches.length === 0) return fail(`No encontré ninguna empresa para «${args.company}».`);
    if (matches.length > 1) return fail(`«${args.company}» coincide con ${matches.length} empresas. Usa el RUT o --empresa-id.`);
    const company = matches[0];
    return { id: company.id, label: `${company.businessName} · RUT ${company.rut} · ${company.status}`, businessName: company.businessName };
  } finally {
    await prisma.$disconnect();
  }
}

function printRequest(action: ErasureAction, reply: AetherReply): ReturnType<typeof readRequestDetails> {
  const details = readRequestDetails(reply.datos);
  const verb = action === 'eliminar' ? 'ELIMINARÍAN la empresa y todo lo suyo' : 'borrarían los datos de la empresa';
  console.log(`\nAether respondió: ${reply.mensaje ?? '(sin mensaje)'}`);
  console.log(`\nSe ${verb}: ${details.rows.toLocaleString('es-CL')} filas en ${details.tables.length} ${details.tables.length === 1 ? 'tabla' : 'tablas'}.`);
  const shown = details.tables.slice(0, 15);
  for (const [table, n] of shown) console.log(`  ${String(n).padStart(8)}  ${table}`);
  if (details.tables.length > shown.length) console.log(`  … y ${details.tables.length - shown.length} tablas más`);
  if (details.warnings.length > 0) {
    console.log('\n⚠ Esto no parece solo de prueba:');
    for (const warning of details.warnings) console.log(`  · ${warning}`);
  }
  console.log(`\nCódigo de confirmación: ${details.code}`);
  if (action === 'eliminar') console.log(`Se puede confirmar desde: ${santiago(details.notBefore)}\nVence:                    ${santiago(details.expiresAt)}`);
  else console.log(`Vence: ${santiago(details.expiresAt)}`);
  return details;
}

function printOutcome(reply: AetherReply): void {
  console.log(`\n✔ ${reply.mensaje ?? 'Listo.'}`);
  const data = reply.datos ?? {};
  const backup = data.respaldo as { ref?: string; bytes?: number; sha256?: string } | undefined;
  if (backup?.ref) console.log(`  Respaldo: ${backup.ref} (${Math.round((backup.bytes ?? 0) / 1024)} KB, sha256 ${backup.sha256 ?? '—'})`);
  const files = data.archivos as { found?: number; deleted?: number; failed?: number; notAttributed?: number } | undefined;
  if (files) {
    console.log(`  Archivos: ${files.deleted ?? 0} borrados de ${files.found ?? 0} encontrados${files.failed ? `, ${files.failed} no se pudieron borrar` : ''}${files.notAttributed ? `, ${files.notAttributed} no se tocaron por no ser inequívocamente de la empresa` : ''}`);
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Confirma con la razón social escrita. Si se conoce el nombre real, se revisa antes de enviar: Aether cancela la solicitud a los 5 intentos fallidos. */
async function askBusinessName(known: string | null): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const typed = await ask('\nEscribe la razón social de la empresa para ejecutarlo (Enter para no hacerlo): ');
    if (!typed) return null;
    if (known === null || businessNameMatches(known, typed)) return typed;
    console.log('  No coincide con la razón social de la empresa. No se envió nada.');
  }
  return null;
}

async function runConfirm(
  baseUrl: string,
  secret: string,
  action: ErasureAction,
  target: Target,
  data: { code: string; businessName: string; acceptRealData: boolean }
): Promise<void> {
  console.log(action === 'eliminar' ? '\nEliminando… (respalda, borra y limpia archivos; puede tardar unos minutos)' : '\nReiniciando… (respalda y borra; puede tardar unos minutos)');
  const reply = await send(baseUrl, secret, 'confirmar', {
    tipo: orderType(action, 'confirmar'),
    clienteId: target.id,
    datos: { codigo: data.code, razonSocial: data.businessName, aceptoDatosReales: data.acceptRealData },
  });
  if (!reply.ok) {
    console.error(`\n✖ Aether no lo ejecutó: ${reply.mensaje ?? 'sin detalle'}`);
    if (/aceptoDatosReales/.test(reply.mensaje ?? '')) console.error('  Si de verdad quieres perder esos datos, repite agregando --acepto-datos-reales.');
    process.exit(1);
  }
  printOutcome(reply);
}

async function main(): Promise<void> {
  assertScriptCanRun('enviar-orden-supersuite');
  let args: OrderArgs;
  try {
    args = parseOrderArgs(process.argv.slice(2));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (args.help) {
    console.log(HELP);
    return;
  }

  const secret = process.env.SUPERSUITE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return fail('Falta SUPERSUITE_WEBHOOK_SECRET: el secreto que Aether tiene en Vercel para las órdenes. Ponlo en el .env o como variable de entorno (no como argumento).');
  }
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(args.url ?? process.env.APP_URL);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  console.log(`Aether: ${baseUrl}`);

  try {
    if (args.command === 'ping') {
      const reply = await send(baseUrl, secret, 'ping', { tipo: 'ping', clienteId: null });
      console.log(reply.ok ? `\n✔ Conexión y firma correctas (${reply.mensaje ?? 'pong'}).` : `\n✖ ${reply.mensaje ?? 'Sin detalle'}`);
      if (!reply.ok) process.exit(1);
      return;
    }

    if (args.command === 'marketing-contexto') {
      const reply = await send(baseUrl, secret, 'marketing', { tipo: 'marketing.contexto', clienteId: null });
      if (!reply.ok) return fail(reply.mensaje ?? 'Aether no entregó el contexto.');
      console.log(`\n✔ ${reply.mensaje ?? 'Contexto recibido.'}`);
      if (args.outFile) {
        await writeFile(args.outFile, `${JSON.stringify(reply.datos ?? {}, null, 2)}\n`, 'utf8');
        console.log(`  Guardado en ${args.outFile}`);
      } else {
        console.log('  Usa --salida contexto.json para guardarlo completo.');
      }
      return;
    }

    if (args.command === 'marketing-revisar') {
      const datos = args.piecesFile ? marketingReviewData(args, await readFile(args.piecesFile, 'utf8')) : marketingReviewData(args);
      const reply = await send(baseUrl, secret, 'marketing', { tipo: 'marketing.revisar', clienteId: null, datos });
      if (!reply.ok) return fail(reply.mensaje ?? 'Aether no pudo revisar las piezas.');
      console.log(`\n${reply.mensaje ?? ''}\n`);
      for (const line of formatMarketingReview(reply.datos)) console.log(line);
      return;
    }

    const action = args.action as ErasureAction;
    const target = await resolveTarget(args);
    console.log(`Empresa: ${target.label}`);
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

    if (args.command === 'cancelar') {
      const reply = await send(baseUrl, secret, 'cancelar', { tipo: orderType(action, 'cancelar'), clienteId: target.id });
      if (!reply.ok) return fail(reply.mensaje ?? 'Aether no pudo cancelar.');
      console.log(`\n✔ ${reply.mensaje ?? 'Listo.'}`);
      return;
    }

    if (args.command === 'confirmar') {
      let businessName = args.businessName;
      if (!businessName && interactive) businessName = await askBusinessName(target.businessName);
      if (!businessName) return fail('Falta la razón social escrita: --razon-social "<razón social>".');
      if (target.businessName !== null && !businessNameMatches(target.businessName, businessName)) {
        return fail(`La razón social escrita no coincide con la de la empresa («${target.businessName}»). No se envió nada.`);
      }
      await runConfirm(baseUrl, secret, action, target, { code: args.code as string, businessName, acceptRealData: args.acceptRealData });
      return;
    }

    // reiniciar | eliminar: primer paso, la solicitud (no borra nada).
    const requested = await send(baseUrl, secret, 'solicitar', { tipo: orderType(action, 'solicitar'), clienteId: target.id });
    if (!requested.ok) {
      console.error(`\n✖ Aether no aceptó la solicitud: ${requested.mensaje ?? 'sin detalle'}`);
      if (action === 'eliminar' && /suspender/i.test(requested.mensaje ?? '')) console.error('  Suspende la empresa desde la Supersuite (orden cuenta.suspender) y vuelve a pedirlo.');
      process.exit(1);
    }
    const details = printRequest(action, requested);
    const selector = companySelector(args);
    const hint = confirmCommandHint(action, selector, details.code, details.warnings.length > 0);

    if (action === 'eliminar') {
      console.log('\nNo se borró nada. Eliminar exige esperar; cuando llegue la fecha de arriba, ejecútalo con:');
      console.log(`  ${hint}`);
      console.log(`Para anular la solicitud: npx tsx scripts/enviar-orden-supersuite.ts cancelar eliminar ${selector}`);
      return;
    }
    if (args.onlyRequest || !interactive) {
      console.log('\nNo se borró nada. Para ejecutarlo con este código:');
      console.log(`  ${hint}`);
      return;
    }

    let acceptRealData = false;
    if (details.warnings.length > 0) {
      const answer = await ask('\nEscribe ACEPTO PERDER DATOS REALES para continuar (Enter para no hacerlo): ');
      if (answer !== 'ACEPTO PERDER DATOS REALES') {
        console.log(`\nNo se borró nada. El código sigue vigente hasta: ${santiago(details.expiresAt)}`);
        return;
      }
      acceptRealData = true;
    }
    const businessName = await askBusinessName(target.businessName);
    if (!businessName) {
      console.log(`\nNo se borró nada. El código sigue vigente hasta: ${santiago(details.expiresAt)}\nPara ejecutarlo luego:\n  ${hint}`);
      return;
    }
    await runConfirm(baseUrl, secret, action, target, { code: details.code, businessName, acceptRealData });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
