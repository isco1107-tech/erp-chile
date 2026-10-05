import { Prisma, type DteType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Totales de ventas emitidas de un mes (calendario de Santiago) y un tipo de documento. */
export interface MonthlySalesSummaryRow {
  /** `YYYY-MM` en el calendario de America/Santiago, igual que `monthKey` del panel. */
  month: string;
  dteType: DteType;
  documents: number;
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  /** Σ round(cantidad × PMP de la línea): el mismo costo de venta que se calculaba en JS. */
  costOfSales: number;
}

interface RawRow {
  month: string;
  dteType: DteType;
  documents: number;
  netAmount: bigint | number | null;
  exemptAmount: bigint | number | null;
  ivaAmount: bigint | number | null;
  costOfSales: bigint | number | null;
}

/**
 * Agrega en la base las ventas emitidas de una ventana, por mes y tipo.
 *
 * El panel de Inicio traía antes TODOS los documentos de 12 meses con sus
 * líneas (`findMany` con `items`) para sumarlos en JS: con 150.000 ventas al
 * año eran ~80.000 documentos y ~160.000 líneas por cada carga de la pantalla
 * a la que todos entran al iniciar sesión (auditoría de estrés 2026-10-05).
 * Esto devuelve a lo más 12 meses × tipos de documento filas.
 *
 * `issueDate` se guarda como instante UTC sin zona; se lleva a Santiago antes
 * de truncar al mes para que una venta del 31 a las 22:00 caiga en ese mes y
 * no en el siguiente (mismo criterio que `santiagoDateParts`).
 */
export async function getMonthlySalesSummary(
  companyId: string,
  dteTypes: DteType[],
  from: Date,
  to: Date
): Promise<MonthlySalesSummaryRow[]> {
  if (dteTypes.length === 0) return [];
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      to_char((d."issueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS "month",
      d."dteType" AS "dteType",
      COUNT(*)::int AS "documents",
      SUM(d."netAmount") AS "netAmount",
      SUM(d."exemptAmount") AS "exemptAmount",
      SUM(d."ivaAmount") AS "ivaAmount",
      SUM(COALESCE(c."cost", 0)) AS "costOfSales"
    FROM "SalesDocument" d
    LEFT JOIN LATERAL (
      SELECT SUM(ROUND(i."quantity" * i."unitCostPMP")) AS "cost"
      FROM "SalesDocumentItem" i
      WHERE i."documentId" = d.id AND i."companyId" = ${companyId}
    ) c ON TRUE
    WHERE d."companyId" = ${companyId}
      AND d."status" = 'ISSUED'
      AND d."dteType"::text IN (${Prisma.join(dteTypes)})
      AND d."issueDate" >= ${from}
      AND d."issueDate" < ${to}
    GROUP BY 1, 2
  `;
  return rows.map((row) => ({
    month: row.month,
    dteType: row.dteType,
    documents: row.documents,
    netAmount: Number(row.netAmount ?? 0),
    exemptAmount: Number(row.exemptAmount ?? 0),
    ivaAmount: Number(row.ivaAmount ?? 0),
    costOfSales: Number(row.costOfSales ?? 0),
  }));
}
