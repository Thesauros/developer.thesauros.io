/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.server.json' }],
  },
  collectCoverageFrom: ['**/*.ts', '!main.ts', '!**/*.module.ts', '!**/dto/**'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
