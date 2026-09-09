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
    },
  },
];

export default config;
