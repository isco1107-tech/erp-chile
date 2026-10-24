-- Seller Center (dentro de Inventario): interruptor propio, apagado por defecto.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasSellerCenter" BOOLEAN NOT NULL DEFAULT false;

-- Persona del proveedor o productor: identidad de la plataforma (sin empresa).
CREATE TABLE IF NOT EXISTS "SupplierPortalPerson" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "loginLockedUntil" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "resetTokenHash" TEXT,
    "resetExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPortalPerson_pkey" PRIMARY KEY ("id")
);

-- Acceso de una persona al Seller Center de una empresa, en nombre de un proveedor.
CREATE TABLE IF NOT EXISTS "SupplierPortalMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "invitedByName" TEXT,
    "lastAccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPortalMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalPerson_email_key" ON "SupplierPortalPerson"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalPerson_resetTokenHash_key" ON "SupplierPortalPerson"("resetTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalMembership_inviteTokenHash_key" ON "SupplierPortalMembership"("inviteTokenHash");
CREATE INDEX IF NOT EXISTS "SupplierPortalMembership_companyId_supplierId_idx" ON "SupplierPortalMembership"("companyId", "supplierId");
CREATE INDEX IF NOT EXISTS "SupplierPortalMembership_personId_idx" ON "SupplierPortalMembership"("personId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalMembership_companyId_personId_key" ON "SupplierPortalMembership"("companyId", "personId");

DO $$ BEGIN
    ALTER TABLE "SupplierPortalMembership" ADD CONSTRAINT "SupplierPortalMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "SupplierPortalMembership" ADD CONSTRAINT "SupplierPortalMembership_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "SupplierPortalMembership" ADD CONSTRAINT "SupplierPortalMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "SupplierPortalPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
