-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasPos" BOOLEAN NOT NULL DEFAULT false;

-- El POS es un módulo nuevo, así que nace apagado para todos. Se enciende solo
-- en los planes cuyo preset ya lo incluye (Enterprise), para que la definición
-- del plan y lo que la empresa realmente tiene no queden desalineadas.
UPDATE "CompanyFeatures" cf
SET "hasPos" = true, "updatedAt" = CURRENT_TIMESTAMP
FROM "Company" c
WHERE cf."companyId" = c."id" AND c."planName" = 'Enterprise';
