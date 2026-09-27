import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { registerMcpTools } from '@/modules/mcp/tools';
import { resolveMcpSession } from '@/modules/mcp/services/tokens.service';

/**
 * Servidor MCP de Aether: lo que alguien conecta desde su Claude o ChatGPT
 * PERSONAL, con un token que se genera desde Configuración → Mi Perfil (solo
 * si la empresa activó el conector en Configuración → Empresa). El proxy
 * (`src/proxy.ts`) no intercepta `/api`, así que la autenticación vive
 * enteramente acá — no hay sesión de cookie que la cubra.
 */

const mcpHandler = createMcpHandler(
  (server) => {
    registerMcpTools(server);
  },
  { serverInfo: { name: 'Aether ERP', version: '1.0.0' } }
);

const handler = withMcpAuth(
  mcpHandler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const session = await resolveMcpSession(bearerToken);
    if (!session) return undefined;
    // `AuthInfo` no tiene un campo libre para companyId/permisos: cada tool
    // vuelve a resolver la sesión completa desde el token crudo
    // (`ctx.http.authInfo.token`), nunca desde este objeto — ver `tools.ts`.
    return { token: bearerToken, clientId: session.userId, scopes: [] };
  },
  { required: true }
);

export { handler as GET, handler as POST };
