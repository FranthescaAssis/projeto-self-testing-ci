const crypto = require('node:crypto');
const { AccountNotFoundError } = require('../domain/errors');
const { calculateTransfer, validateTransferRequest } = require('../domain/transfer');

class TransferService {
  constructor({
    accountRepository,
    transactionRepository,
    transferRepository,
    fraudGateway,
    runInTransaction,
    clock = () => new Date(),
    idGenerator = () => crypto.randomUUID(),
  }) {
    this.accountRepository = accountRepository;
    this.transactionRepository = transactionRepository;
    this.transferRepository = transferRepository;
    this.fraudGateway = fraudGateway;
    this.runInTransaction = runInTransaction;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async transfer({ sourceAccountId, targetAccountId, amount }) {
    validateTransferRequest({ sourceAccountId, targetAccountId, amount });

    // Leitura dos saldos, cálculo e gravação acontecem em uma única transação
    // imediata: duas transferências simultâneas nunca leem o mesmo saldo.
    const transfer = this.runInTransaction(() => {
      const source = this.accountRepository.findById(sourceAccountId);
      if (!source) {
        throw new AccountNotFoundError(sourceAccountId);
      }
      const target = this.accountRepository.findById(targetAccountId);
      if (!target) {
        throw new AccountNotFoundError(targetAccountId);
      }

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
      this.transactionRepository.insert({
        id: this.idGenerator(),
        accountId: source.id,
        transferId: record.id,
        type: 'DEBIT',
        amount,
        balanceAfter: balances.sourceBalance,
        counterpartyAccountId: target.id,
        description: 'Transferência enviada',
        createdAt: record.createdAt,
      });
      this.transactionRepository.insert({
        id: this.idGenerator(),
        accountId: target.id,
        transferId: record.id,
        type: 'CREDIT',
        amount,
        balanceAfter: balances.targetBalance,
        counterpartyAccountId: source.id,
        description: 'Transferência recebida',
        createdAt: record.createdAt,
      });

      return record;
    });

    // Efeito colateral externo: só acontece depois do commit.
    await this.fraudGateway.notifyTransfer({
      transferId: transfer.id,
      sourceAccountId: transfer.sourceAccountId,
      targetAccountId: transfer.targetAccountId,
      amount: transfer.amount,
      occurredAt: transfer.createdAt,
    });

    return { transfer };
  }
}

module.exports = { TransferService };
