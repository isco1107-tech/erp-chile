# Despliegue para Claude Code

## Estado actual
- El proyecto ya compila en producción con `npm run build`.
- La base de datos está en estado válido según Prisma.
- El bloqueo real del despliegue es de autenticación de Vercel (`Error: Not authorized`).

## Qué necesita Claude Code para desplegar
1. Autenticar la CLI de Vercel en este entorno:
   ```bash
   npx vercel login
   ```
2. Conectar el proyecto a la cuenta correcta:
   ```bash
   npx vercel link
   ```
3. Publicar producción:
   ```bash
   npx vercel --prod --yes
   ```

## Reglas de seguridad
- No correr migraciones destructivas sobre la base de producción sin confirmación explícita.
- Mantener `DATABASE_URL` y `DIRECT_DATABASE_URL` apuntando al Neon correcto.
- No hacer despliegue si la validación previa (`npm run build` / `npx prisma validate`) falla.

## Checklist antes del deploy
- [ ] `npx prisma validate`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npx vercel login`
- [ ] `npx vercel link`
- [ ] `npx vercel --prod --yes`

## Observación importante
El entorno local aquí usa `.env` y `.env.local` con la conexión real de Neon, y la documentación en `CLAUDE.md` exige manejar esa base como producción. Por eso el deploy debe hacerse solo después de autenticación y con una revisión final de variables de entorno.
