import nextConfig from 'eslint-config-next';

/**
 * ESLint 9 (flat config) exige este archivo — sin él, `next lint`/`eslint .`
 * fallan por completo ("Invalid project directory" / "couldn't find an
 * eslint.config.js"), aunque `eslint` y `eslint-config-next` ya estaban
 * instalados. `eslint-config-next` ya exporta un array de flat config listo
 * para usar (Core Web Vitals + reglas de Next.js/React/TypeScript), así que
 * no hace falta recrearlo a mano.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'prisma/migrations/**',
      'components/**',
      'dashboard/**',
      'lib/**',
      'desktop-client/src-tauri/target/**',
    ],
  },
  ...nextConfig,
  {
    rules: {
      // React Compiler lints are useful during refactors, but the current app
      // still loads most client data from effects. Keep CI focused on defects
      // until those screens are migrated deliberately.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/immutability': 'off',
      'react/no-unescaped-entities': 'off',
      // CLAUDE.md § 1: todo error de producción se reporta con
      // captureException/captureMessage (src/lib/observability), nunca con
      // console.error/warn suelto — eso no llega a Sentry ni queda como JSON
      // estructurado. `log`/`info`/`debug` siguen permitidos (ver
      // `mailer.ts`, que deliberadamente cae a consola sin credenciales de
      // email). Las dos pantallas `error.tsx` (boundary de cliente) son la
      // única excepción legítima — el servidor ya capturó la excepción en
      // `instrumentation.ts` antes de que React la mande al cliente — y
      // llevan su propio `eslint-disable-next-line no-console`.
      'no-console': ['error', { allow: ['log', 'info', 'debug', 'trace', 'table', 'group', 'groupEnd'] }],
    },
  },
  {
    // Scripts de línea de comandos (seed, backfills, verificaciones ad-hoc):
    // corren fuera del runtime de la app, a mano, por un developer — ahí la
    // consola ES la interfaz, no un atajo que evita observabilidad.
    files: ['scripts/**/*.{ts,js,cjs,mjs}', 'prisma/**/*.{ts,js,cjs,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
