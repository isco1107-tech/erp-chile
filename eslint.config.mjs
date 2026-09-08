import nextConfig from 'eslint-config-next';

/**
 * ESLint 9 (flat config) exige este archivo — sin él, `next lint`/`eslint .`
 * fallan por completo ("Invalid project directory" / "couldn't find an
 * eslint.config.js"), aunque `eslint` y `eslint-config-next` ya estaban
 * instalados. `eslint-config-next` ya exporta un array de flat config listo
 * para usar (Core Web Vitals + reglas de Next.js/React/TypeScript), así que
 * no hace falta recrearlo a mano.
 */
export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
];
