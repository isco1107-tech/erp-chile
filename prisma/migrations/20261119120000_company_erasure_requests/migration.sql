-- Solicitudes de reinicio o eliminación de una empresa pedidas por la Supersuite (ver el modelo en schema.prisma).
-- Aditiva e idempotente. Sin llave foránea a propósito: la fila debe sobrevivir a la empresa.
CREATE TABLE IF NOT EXISTS "CompanyErasureRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "companyRut" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedOrder" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "preview" JSONB,
    "result" JSONB,

    CONSTRAINT "CompanyErasureRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyErasureRequest_companyId_kind_status_idx" ON "CompanyErasureRequest"("companyId", "kind", "status");
CREATE INDEX IF NOT EXISTS "CompanyErasureRequest_codeHash_idx" ON "CompanyErasureRequest"("codeHash");
