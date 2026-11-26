-- Academia: registro de asistencia con QR y aprobación automática de inscripciones.
-- Aditiva e idempotente (la base es la de producción compartida): una tabla
-- nueva, una columna nullable y una booleana con valor por defecto.

-- Ventana de registro con QR por grupo y día (`/academia/asistencia/[token]`).
CREATE TABLE IF NOT EXISTS "AcademyCheckInLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCheckInLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AcademyCheckInLink_token_key" ON "AcademyCheckInLink"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyCheckInLink_groupId_date_key" ON "AcademyCheckInLink"("groupId", "date");
CREATE INDEX IF NOT EXISTS "AcademyCheckInLink_companyId_date_idx" ON "AcademyCheckInLink"("companyId", "date");

DO $$ BEGIN
    ALTER TABLE "AcademyCheckInLink" ADD CONSTRAINT "AcademyCheckInLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AcademyCheckInLink" ADD CONSTRAINT "AcademyCheckInLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cuándo la alumna se registró con el QR (NULL = la marcó la profesora).
ALTER TABLE "AcademyAttendance" ADD COLUMN IF NOT EXISTS "selfCheckInAt" TIMESTAMP(3);

-- Crear la ficha al instante al recibir una inscripción del link público (por defecto, no).
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "academyAutoApproveEnrollments" BOOLEAN NOT NULL DEFAULT false;
