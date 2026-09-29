-- Conector MCP: cada usuario genera y revoca sus propios tokens personales
-- para conectar un Claude/ChatGPT propio al servidor MCP de la empresa
-- (`/api/mcp`), solo si la empresa activó CompanySettings.mcpConnectorEnabled.
-- Aditiva: una tabla nueva y una columna nullable-por-default en una tabla
-- existente.

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "mcpConnectorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "McpPersonalToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpPersonalToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "McpPersonalToken_tokenHash_key" ON "McpPersonalToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "McpPersonalToken_companyId_userId_idx" ON "McpPersonalToken"("companyId", "userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "McpPersonalToken" ADD CONSTRAINT "McpPersonalToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "McpPersonalToken" ADD CONSTRAINT "McpPersonalToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
