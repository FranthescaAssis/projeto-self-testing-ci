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
