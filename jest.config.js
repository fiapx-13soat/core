// `npm test` roda os unitários (rápido, sem Docker); `npm run test:int` roda os *.int-spec.ts,
// que sobem Postgres/Redis/RabbitMQ via Testcontainers.
const integration = process.env.TEST_INTEGRATION === '1';

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // unit: *.spec.ts (o padrão *.int-spec.ts termina em -spec.ts e não casa com \.spec\.ts$)
  testRegex: integration ? '.*\\.int-spec\\.ts$' : '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  testEnvironment: 'node'
};
