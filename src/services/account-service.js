const crypto = require('node:crypto');
const {
  ValidationError,
  AccountNotFoundError,
  DocumentRejectedError,
  DocumentAlreadyRegisteredError,
} = require('../domain/errors');
const { normalizeCpf, isValidCpf } = require('../domain/cpf');
const { assertValidBalance } = require('../domain/money');

const REGULAR_STATUS = 'REGULAR';

class AccountService {
  constructor({
    accountRepository,
    transactionRepository,
    registryValidator,
    runInTransaction,
    clock = () => new Date(),
    idGenerator = () => crypto.randomUUID(),
  }) {
    this.accountRepository = accountRepository;
    this.transactionRepository = transactionRepository;
    this.registryValidator = registryValidator;
    this.runInTransaction = runInTransaction;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async createAccount({ ownerName, document, initialBalance = 0 }) {
    const name = typeof ownerName === 'string' ? ownerName.trim() : '';
    if (name.length < 3 || name.length > 120) {
      throw new ValidationError('ownerName deve ter entre 3 e 120 caracteres');
    }
    if (!isValidCpf(document)) {
      throw new ValidationError('document deve ser um CPF válido');
    }
    assertValidBalance(initialBalance);

    const cpf = normalizeCpf(document);
    const registry = await this.registryValidator.validate(cpf);
    if (registry.status !== REGULAR_STATUS) {
      throw new DocumentRejectedError();
    }
    if (this.accountRepository.findByDocument(cpf)) {
      throw new DocumentAlreadyRegisteredError();
    }

    const account = {
      id: this.idGenerator(),
      ownerName: name,
      document: cpf,
      balance: initialBalance,
      createdAt: this.clock().toISOString(),
    };

    this.runInTransaction(() => {
      this.accountRepository.insert(account);
      if (initialBalance > 0) {
        this.transactionRepository.insert({
          id: this.idGenerator(),
          accountId: account.id,
          transferId: null,
          type: 'CREDIT',
          amount: initialBalance,
          balanceAfter: initialBalance,
          counterpartyAccountId: null,
          description: 'Saldo inicial',
          createdAt: account.createdAt,
        });
      }
    });

    return account;
  }

  getAccount(accountId) {
    const account = this.accountRepository.findById(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }
    return account;
  }
}

module.exports = { AccountService };
