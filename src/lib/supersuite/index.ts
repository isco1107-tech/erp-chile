import 'server-only';

import { after } from 'next/server';
import { DteType, type AuditAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { crearSupersuite, type ClienteSupersuite } from './cliente';
import { accionDeAuditoria, alertaDeFolios, empresaActiva, ENTIDADES_DE_EMPRESA, moduloDeEntidad, modulosContratados } from './modulos';

/**
 * Telemetría hacia la Supersuite (el centro de mando que monitorea a las empresas
 * que usan Aether): uso por módulo, ficha de cada empresa, latidos del POS y
 * alertas propias (folios del SII).
 *
 * Reglas:
 *  - Sin SUPERSUITE_URL y SUPERSUITE_KEY todo es un no-op: Aether funciona igual.
 *  - Nunca lanza ni frena una operación de negocio: los errores van a observabilidad.
 *  - Aether corre en Vercel (serverless): no hay envío periódico; la cola se vacía
 *    al terminar cada request con `after()`.
 *  - No sale ningún dato personal ni del documento: solo empresa, módulo y acción.
 */

let cliente: ClienteSupersuite | null | undefined;

function monitor(): ClienteSupersuite | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.SUPERSUITE_URL?.trim();
  const apiKey = process.env.SUPERSUITE_KEY?.trim();
  cliente = url && apiKey
    ? crearSupersuite({
        url,
        apiKey,
        intervaloMs: 0,
        timeoutMs: 4000,
        alError: (error) => captureException(error, { module: 'supersuite' }),
      })
    : null;
  return cliente;
}

export const supersuiteHabilitada = () => monitor() !== null;

/** Programa el envío de lo encolado para cuando termine la respuesta actual. */
function enviarAlFinal(m: ClienteSupersuite): void {
  try {
    after(() => m.flush());
  } catch {
    // Fuera de un request (scripts, crons invocados a mano): se envía de inmediato.
    void m.flush();
  }
}

/** Una acción auditada = un evento de uso del módulo al que pertenece. */
export function registrarUsoSupersuite(input: { companyId: string; entity: string; action: AuditAction }): void {
  try {
    const m = monitor();
    if (!m) return;
    if (ENTIDADES_DE_EMPRESA.has(input.entity)) {
      void sincronizarEmpresaSupersuite(input.companyId);
      return;
    }
    const modulo = moduloDeEntidad(input.entity);
    if (!modulo) return;
    m.evento(input.companyId, modulo, accionDeAuditoria(input.entity, input.action));
    enviarAlFinal(m);
  } catch (error) {
    captureException(error, { module: 'supersuite', companyId: input.companyId, extra: { entity: input.entity } });
  }
}

/** Envía la ficha actual de la empresa: nombre, ciudad, plan, alta, estado y módulos contratados. */
export async function sincronizarEmpresaSupersuite(companyId: string): Promise<void> {
  try {
    const m = monitor();
    if (!m) return;
    const empresa = await prisma.company.findFirst({
      where: { id: companyId },
      select: { businessName: true, rut: true, ciudad: true, comuna: true, planName: true, status: true, createdAt: true, features: true },
    });
    if (!empresa) return;
    m.cliente(companyId, {
      nombre: empresa.businessName,
      ciudad: empresa.comuna ?? empresa.ciudad ?? undefined,
      plan: empresa.planName,
      clienteDesde: empresa.createdAt,
      activo: empresaActiva(empresa.status),
      modulos: modulosContratados(empresa.features),
      metadata: { rut: empresa.rut, estadoAether: empresa.status },
    });
    enviarAlFinal(m);
  } catch (error) {
    captureException(error, { module: 'supersuite', companyId, extra: { step: 'sincronizarEmpresa' } });
  }
}

/** La empresa se eliminó de Aether: en la Supersuite queda como dada de baja (conserva su historia). */
export function empresaEliminadaSupersuite(companyId: string, businessName: string): void {
  try {
    const m = monitor();
    if (!m) return;
    m.cliente(companyId, { nombre: businessName, activo: false, metadata: { estadoAether: 'DELETED' } });
    enviarAlFinal(m);
  } catch (error) {
    captureException(error, { module: 'supersuite', companyId, extra: { step: 'empresaEliminada' } });
  }
}

/**
 * Folios del SII (lo llama el cron diario de alertas operativas): alerta por cada
 * tipo con pocos folios y cierre de la alerta de los tipos que ya se repusieron.
 */
export async function avisarFoliosSupersuite(companyId: string, bajos: { dteType: string; remaining: number }[]): Promise<void> {
  try {
    const m = monitor();
    if (!m) return;
    const conAlerta = new Set(bajos.map((f) => f.dteType));
    for (const f of bajos) {
      const a = alertaDeFolios(f.dteType, f.remaining);
      m.alerta(a.severidad, a.mensaje, companyId, a.clave);
    }
    // COTIZACION no es DTE: no tiene folios que avisar.
    for (const tipo of Object.values(DteType)) {
      if (tipo !== 'COTIZACION' && !conAlerta.has(tipo)) m.resolverAlerta(`folios:${tipo}`, companyId);
    }
    // El cron corre en su propio request: se espera el envío para no perderlo al terminar.
    await m.flush();
  } catch (error) {
    captureException(error, { module: 'supersuite', companyId, extra: { step: 'avisarFolios' } });
  }
}

/**
 * Latido de una caja POS. `apagada` = se cerró el turno: la Supersuite la muestra
 * apagada (no "sin señal") y no levanta alertas hasta el próximo turno.
 */
export function latidoCajaSupersuite(companyId: string, caja: { id: string; name: string }, apagada = false): void {
  try {
    const m = monitor();
    if (!m) return;
    const datos = { tipo: 'pos' as const, nombre: caja.name };
    if (apagada) m.apagado(companyId, `caja-${caja.id}`, datos);
    else m.latido(companyId, `caja-${caja.id}`, datos);
    enviarAlFinal(m);
  } catch (error) {
    captureException(error, { module: 'supersuite', companyId, extra: { step: 'latidoCaja' } });
  }
}
