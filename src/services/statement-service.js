const { AccountNotFoundError } = require('../domain/errors');
const { parseStatementFilters } = require('../domain/statement-filters');

class StatementService {
  constructor({ accountRepository, transactionRepository }) {
    this.accountRepository = accountRepository;
    this.transactionRepository = transactionRepository;
  }

  getStatement(accountId, query = {}) {
    const filters = parseStatementFilters(query);

    const account = this.accountRepository.findById(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    return {
      accountId: account.id,
      balance: account.balance,
      filters,
      entries: this.transactionRepository.listByAccount(account.id, filters),
    };
  }
}

module.exports = { StatementService };
