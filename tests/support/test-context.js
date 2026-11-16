const { createDatabase, createTransactionRunner } = require('../../src/repositories/database');
const { AccountRepository } = require('../../src/repositories/account-repository');
const { TransactionRepository } = require('../../src/repositories/transaction-repository');
const { TransferRepository } = require('../../src/repositories/transfer-repository');
const { IdempotencyRepository } = require('../../src/repositories/idempotency-repository');
const { AccountService } = require('../../src/services/account-service');
const { TransferService } = require('../../src/services/transfer-service');
const { StatementService } = require('../../src/services/statement-service');
const { createRegistryValidatorStub, createFraudGatewayMock, createFixedClock } = require('./test-doubles');

// CPFs fictícios com dígitos verificadores válidos, usados apenas em testes.
const TEST_CPFS = ['52998224725', '11144477735', '12345678909', '98765432100', '45678912364'];

/**
 * Monta os serviços reais sobre um SQLite em memória, trocando apenas as
 * dependências externas por test doubles (stub cadastral e mock do anti-fraude).
 */
function createTestContext({ fraudGateway = createFraudGatewayMock() } = {}) {
  const db = createDatabase(':memory:');
  const clock = createFixedClock();
  const runInTransaction = createTransactionRunner(db);

  const accountRepository = new AccountRepository(db);
  const transactionRepository = new TransactionRepository(db);
  const transferRepository = new TransferRepository(db);
  const idempotencyRepository = new IdempotencyRepository(db);

  const accountService = new AccountService({
    accountRepository,
    transactionRepository,
    registryValidator: createRegistryValidatorStub('REGULAR'),
    runInTransaction,
    clock,
  });

  const transferService = new TransferService({
    accountRepository,
    transactionRepository,
    transferRepository,
    idempotencyRepository,
    fraudGateway,
    runInTransaction,
    clock,
  });

  const statementService = new StatementService({ accountRepository, transactionRepository });

  let nextCpf = 0;
  async function openAccount(ownerName, initialBalance) {
    return accountService.createAccount({ ownerName, document: TEST_CPFS[nextCpf++], initialBalance });
  }

  return {
    db,
    clock,
    fraudGateway,
    accountRepository,
    transactionRepository,
    transferRepository,
    accountService,
    transferService,
    statementService,
    openAccount,
    close: () => db.close(),
  };
}

module.exports = { createTestContext, TEST_CPFS };
