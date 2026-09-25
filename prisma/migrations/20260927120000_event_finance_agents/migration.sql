-- Agentes financieros de la productora de eventos. Solo agrega valores al
-- enum: aditivo, no toca filas existentes (seguro con la base compartida).
ALTER TYPE "AgentRole" ADD VALUE IF NOT EXISTS 'EVENT_FINANCE';
ALTER TYPE "AgentRole" ADD VALUE IF NOT EXISTS 'EVENT_COLLECTIONS';
