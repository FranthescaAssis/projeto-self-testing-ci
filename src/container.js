const { createDatabase, createTransactionRunner } = require('./repositories/database');
const { AccountRepository } = require('./repositories/account-repository');
const { TransactionRepository } = require('./repositories/transaction-repository');
const { TransferRepository } = require('./repositories/transfer-repository');
const { IdempotencyRepository } = require('./repositories/idempotency-repository');
const { AccountService } = require('./services/account-service');
const { TransferService } = require('./services/transfer-service');
const { StatementService } = require('./services/statement-service');
const { HttpFraudGateway, DisabledFraudGateway } = require('./services/fraud-gateway');
const { LocalRegistryValidator } = require('./services/registry-validator');
const { createApp } = require('./app');

function createFraudGateway(config) {
  if (!config.antifraudWebhookUrl) {
    return new DisabledFraudGateway();
  }
  return new HttpFraudGateway({
    url: config.antifraudWebhookUrl,
    timeoutMs: config.antifraudTimeoutMs,
  });
}

/**
 * Raiz de composição: cria o banco, os repositórios e os serviços e liga tudo.
 * O segundo parâmetro permite substituir dependências externas (útil em testes).
 */
function buildContainer(config, overrides = {}) {
  const db = createDatabase(config.databaseFile);
  const runInTransaction = createTransactionRunner(db);

  const accountRepository = new AccountRepository(db);
  const transactionRepository = new TransactionRepository(db);
  const transferRepository = new TransferRepository(db);
  const idempotencyRepository = new IdempotencyRepository(db);

  const fraudGateway = overrides.fraudGateway ?? createFraudGateway(config);
  const registryValidator = overrides.registryValidator ?? new LocalRegistryValidator();

  const accountService = new AccountService({
    accountRepository,
    transactionRepository,
    registryValidator,
    runInTransaction,
  });
  const transferService = new TransferService({
    accountRepository,
    transactionRepository,
    transferRepository,
    idempotencyRepository,
    fraudGateway,
    runInTransaction,
  });
  const statementService = new StatementService({ accountRepository, transactionRepository });

  const app = createApp({ accountService, transferService, statementService, logger: overrides.logger });

  return {
    app,
    db,
    fraudGateway,
    close: () => db.close(),
  };
}

module.exports = { buildContainer };
