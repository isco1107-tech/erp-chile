# Despliegue

## Cómo se publica
- El repo `isco1107-tech/erp-chile` está conectado a Vercel por integración con GitHub.
- **Cada fusión a `main` se publica sola en producción.** Cada PR recibe un deploy de vista previa con su propio enlace.
- No hace falta la CLI de Vercel ni un token en el entorno de Claude Code.
- Para republicar sin commit nuevo: Vercel → proyecto → Deployments → Redeploy.

## Base de datos
- El build es `prisma generate && next build`: **no corre migraciones**. Un deploy nunca toca el esquema de la base Neon.
- Las migraciones siguen siendo un paso manual y deliberado (ver `CLAUDE.md` §5): se aplican primero y se despliega el código inmediatamente después.

## Checklist antes de fusionar a `main`
- [ ] `npm run ci` en verde (el check `verify` del PR lo corre).
- [ ] Si el PR trae migración: revisarla con `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` y confirmar que es aditiva.
- [ ] Revisar el deploy de vista previa del PR.
