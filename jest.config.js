// Cada nível da pirâmide de testes é um "project" do Jest, o que permite
// executar as suítes separadamente (npm run test:unit, test:integration, test:e2e).
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
    },
  ],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
};
