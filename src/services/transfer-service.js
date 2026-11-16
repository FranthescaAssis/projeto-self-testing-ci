const crypto = require('node:crypto');
const { AccountNotFoundError, IdempotencyConflictError } = require('../domain/errors');
const { calculateTransfer, validateTransferRequest } = require('../domain/transfer');
const { assertValidIdempotencyKey, fingerprintTransfer } = require('../domain/idempotency');

class TransferService {
  constructor({
    accountRepository,
    transactionRepository,
    transferRepository,
    idempotencyRepository,
    fraudGateway,
    runInTransaction,
    clock = () => new Date(),
    idGenerator = () => crypto.randomUUID(),
  }) {
    this.accountRepository = accountRepository;
    this.transactionRepository = transactionRepository;
    this.transferRepository = transferRepository;
    this.idempotencyRepository = idempotencyRepository;
    this.fraudGateway = fraudGateway;
    this.runInTransaction = runInTransaction;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async transfer({ sourceAccountId, targetAccountId, amount, idempotencyKey }) {
    assertValidIdempotencyKey(idempotencyKey);
    validateTransferRequest({ sourceAccountId, targetAccountId, amount });
    const fingerprint = fingerprintTransfer({ sourceAccountId, targetAccountId, amount });

    // Verificação da chave, leitura dos saldos, cálculo e gravação acontecem em
    // uma única transação imediata: duas requisições simultâneas nunca leem o
    // mesmo saldo nem registram a mesma chave duas vezes.
    const { transfer, replayed } = this.runInTransaction(() => {
      const previous = this.idempotencyRepository.findByKey(idempotencyKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new IdempotencyConflictError();
        }
        return { transfer: this.transferRepository.findById(previous.transferId), replayed: true };
      }

      const source = this.findAccount(sourceAccountId);
      const target = this.findAccount(targetAccountId);

      const balances = calculateTransfer({
        sourceBalance: source.balance,
        targetBalance: target.balance,
        amount,
      });

      const record = {
        id: this.idGenerator(),
        sourceAccountId,
        targetAccountId,
        amount,
        createdAt: this.clock().toISOString(),
      };

      this.accountRepository.updateBalance(source.id, balances.sourceBalance);
      this.accountRepository.updateBalance(target.id, balances.targetBalance);
      this.transferRepository.insert(record);
      this.recordEntry(record, {
        accountId: source.id,
        counterpartyAccountId: target.id,
        type: 'DEBIT',
        balanceAfter: balances.sourceBalance,
        description: 'Transferência enviada',
      });
      this.recordEntry(record, {
        accountId: target.id,
        counterpartyAccountId: source.id,
        type: 'CREDIT',
        balanceAfter: balances.targetBalance,
        description: 'Transferência recebida',
      });
      this.idempotencyRepository.insert({
        key: idempotencyKey,
        fingerprint,
        transferId: record.id,
        createdAt: record.createdAt,
      });

      return { transfer: record, replayed: false };
    });

    if (replayed) {
      return { transfer, replayed };
    }

    // Efeito colateral externo: só acontece depois do commit e apenas na
    // primeira execução, nunca em repetições idempotentes.
    await this.fraudGateway.notifyTransfer({
      transferId: transfer.id,
      sourceAccountId: transfer.sourceAccountId,
      targetAccountId: transfer.targetAccountId,
      amount: transfer.amount,
      occurredAt: transfer.createdAt,
    });

    return { transfer, replayed };
  }

  findAccount(accountId) {
    const account = this.accountRepository.findById(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }
    return account;
  }

  recordEntry(transfer, entry) {
    this.transactionRepository.insert({
      id: this.idGenerator(),
      transferId: transfer.id,
      amount: transfer.amount,
      createdAt: transfer.createdAt,
      ...entry,
    });
  }
}

module.exports = { TransferService };
