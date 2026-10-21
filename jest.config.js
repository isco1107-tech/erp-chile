/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Ver tests/__mocks__/server-only.js: permite testear módulos de servidor.
    '^server-only$': '<rootDir>/tests/__mocks__/server-only.js',
    // Ver tests/__mocks__/next-font-google.js: el cargador de fuentes de Next no corre en Jest.
    '^next/font/google$': '<rootDir>/tests/__mocks__/next-font-google.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
  },
};
