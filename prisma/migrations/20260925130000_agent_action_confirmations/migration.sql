-- OP-07 (auditoría de arquitectura): reemplaza la marca de "jti ya usado"
-- del asistente, que vivía en un Map en memoria por instancia de proceso
-- (`src/modules/agent-actions/token.ts`), por una fila en base compartida
-- entre instancias. Bajo Vercel cada instancia tenía su propio Map, así que
-- el mismo token de confirmación podía reusarse en otra instancia y ejecutar
-- la acción (que escribe en la base) dos veces.
--
-- 100% ADITIVA (ver CLAUDE.md §5): tabla nueva, sin tocar nada existente.

-- CreateEnum
CREATE TYPE "AgentActionConfirmationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "AgentActionConfirmation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" "AgentActionConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "resultSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActionConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- La unicidad es lo que hace atómico el "consumir el jti" entre instancias:
-- el segundo insert con el mismo (companyId, jti) falla con P2002 sin
-- importar qué instancia lo intente ni en qué orden lleguen las requests.
CREATE UNIQUE INDEX "AgentActionConfirmation_companyId_jti_key" ON "AgentActionConfirmation"("companyId", "jti");

-- CreateIndex
CREATE INDEX "AgentActionConfirmation_companyId_idx" ON "AgentActionConfirmation"("companyId");

-- AddForeignKey
ALTER TABLE "AgentActionConfirmation" ADD CONSTRAINT "AgentActionConfirmation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
