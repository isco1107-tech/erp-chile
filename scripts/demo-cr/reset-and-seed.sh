#!/usr/bin/env bash
# Reinicia la base LOCAL desechable «cr_demo», migra y siembra la demo de CR Producciones.
set -euo pipefail
cd "$(dirname "$0")/../.."
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cr_demo"
export DIRECT_DATABASE_URL="$DATABASE_URL"
export R2_PUBLIC_URL="https://localhost:8443/cr-demo"
export JWT_SECRET="demo-secret-demo-secret-demo-secret-1234567890"
export TOTP_ENCRYPTION_KEY="demo-totp-key-demo-totp-key-1234567890ab"
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS cr_demo WITH (FORCE);" -c "CREATE DATABASE cr_demo;"
npx prisma migrate deploy >/dev/null 2>&1
npx tsx --conditions=react-server scripts/demo-cr/seed-cr-producciones.ts 2>&1 | grep -v '^prisma:query'
