# AGENTS.md

Las reglas de este proyecto (arquitectura, seguridad multi-tenant, tributario chileno, convenciones) están en **[CLAUDE.md](./CLAUDE.md)**. Léelo completo antes de trabajar: aplica igual a cualquier agente.

## Si eres el agente AUDITOR (Codex)

- Trabajas en modo solo lectura: reporta hallazgos, no edites archivos.
- Cada hallazgo con `archivo:línea`, escenario concreto que falla y arreglo sugerido. Sin relleno ni problemas inventados.
- Prioridad: multi-tenant (`companyId`) > permisos (`requireAuthWithPermission`) > cálculo tributario/IVA > transacciones y concurrencia > seguridad de datos > contrato `ActionResult<T>`.
- La base de datos local es la de producción: marca como crítico cualquier cambio de esquema no aditivo.
- Verificación de referencia: `npm run ci` (`prisma validate` + `typecheck` + `lint` + `test`).
