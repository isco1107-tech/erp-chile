-- Endurecimiento de seguridad (2026-11). Aditiva e idempotente: la base es la de producción compartida.

-- Límite de tasa compartido entre instancias (clave = prefijo + SHA-256 del identificador).
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- TOTP de un solo uso: último paso de tiempo aceptado.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpLastUsedStep" INTEGER;

-- Entradas: hasta cuándo una orden pública impaga reserva cupo.
ALTER TABLE "TicketSale" ADD COLUMN IF NOT EXISTS "reservedUntil" TIMESTAMP(3);
